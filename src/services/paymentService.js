import { CURRENCY, PAYMENT_STATUSES } from '../config/constants.js';
import { isMockMode, validateTransaction, SslcommerzError } from './sslcommerzService.js';
import { reserveSlot } from './capacityService.js';
import { issueTicket } from './ticketService.js';
import { enqueueTicketConfirmation } from './queueService.js';
import { HttpError } from '../utils/httpError.js';
import Registration from '../models/Registration.js';
import { logger } from '../config/logger.js';

/**
 * IPN reconciliation — the single authoritative path from Pending → Paid
 * (Section 6.2).
 *
 * Callers must invoke the full flow (validation API + amount/currency check +
 * atomic capacity reservation) before ever setting `paymentStatus = 'Paid'`.
 */
export async function reconcileIpn({ tranId, valId, body }) {
  // 1. Load the pending registration
  const registration = await Registration.findOne({ tran_id: tranId });
  if (!registration) {
    logger.warn({ tranId, valId }, 'IPN received for unknown tran_id');
    return { status: 'not_found' };
  }

  // 2. Idempotency — already resolved
  if (registration.paymentStatus === PAYMENT_STATUSES.PAID) {
    return { status: 'already_paid', registration };
  }

  // 3. Verify the transaction against SSLCommerz's validation API — the only
  //    source of truth. Never trust the POST body alone.
  let validation;
  try {
    validation = await validateTransaction(valId, tranId);
  } catch (err) {
    if (err instanceof SslcommerzError) {
      logger.error({ err, tranId, valId }, 'SSLCommerz validation API call failed');
      registration.paymentStatus = PAYMENT_STATUSES.NETWORK_ERROR;
      registration.gatewayValidationId = valId;
      await registration.save();
      return { status: 'network_error', registration };
    }
    throw err;
  }

  // Mock mode: valId cannot be validated remotely; verify via raw body fields
  const mock = isMockMode() && validation?.mock === true;

  if (!mock && validation?.status !== 'VALID') {
    logger.warn({ tranId, valId, validation }, 'Transaction not VALID');
    registration.paymentStatus = PAYMENT_STATUSES.VERIFICATION_FAILED;
    registration.gatewayValidationId = valId;
    await registration.save();
    return { status: 'verification_failed', registration };
  }

  // 4. Amount / currency check
  const validationAmount = Number(validation?.amount || body?.amount || body?.value || registration.payableAmount);
  const validationCurrency = validation?.currency || body?.currency || CURRENCY;
  const numericAmount = typeof validationAmount === 'string' ? Number(validationAmount) : validationAmount;

  if (!mock && numericAmount !== registration.payableAmount) {
    logger.warn(
      { expected: registration.payableAmount, got: numericAmount, tranId },
      'Amount mismatch — rejecting'
    );
    registration.paymentStatus = PAYMENT_STATUSES.VERIFICATION_FAILED;
    registration.gatewayValidationId = valId;
    await registration.save();
    return { status: 'amount_mismatch', registration };
  }
  if (!mock && validationCurrency && validationCurrency !== CURRENCY) {
    logger.warn({ expected: CURRENCY, got: validationCurrency, tranId }, 'Currency mismatch');
    registration.paymentStatus = PAYMENT_STATUSES.VERIFICATION_FAILED;
    registration.gatewayValidationId = valId;
    await registration.save();
    return { status: 'currency_mismatch', registration };
  }

  // 5. Atomic capacity reservation — MUST succeed before marking Paid
  const { reserved, capacity } = await reserveSlot();
  if (!reserved) {
    registration.paymentStatus = PAYMENT_STATUSES.OVERSOLD_PENDING_REVIEW;
    registration.gatewayValidationId = valId;
    registration.paidAmount = numericAmount || registration.payableAmount;
    await registration.save();
    logger.warn(
      { tranId, paidSlots: capacity?.paidSlots, maxCapacity: capacity?.maxCapacity },
      'Capacity exhausted — Oversold-PendingReview'
    );
    return { status: 'oversold', registration };
  }

  // 6. Commit Paid status
  registration.paymentStatus = PAYMENT_STATUSES.PAID;
  registration.paidAmount = numericAmount || registration.payableAmount;
  registration.gatewayValidationId = valId;
  registration.ticketDisplayId = issueTicket(registration.participantType);
  await registration.save();

  // 7. Enqueue confirmation delivery — must never change paymentStatus
  enqueueTicketConfirmation({
    toEmail: registration.email,
    toSms: registration.whatsappNo,
    registration
  }).catch((err) => {
    logger.error({ err, registrationId: registration._id }, 'Ticket enqueue failed (non-blocking)');
  });

  return { status: 'paid', registration };
}

/**
 * Resume payment for a stuck/failed/cancelled registration (Section 6.5).
 * Called by an admin and logged as `resume_payment`.
 */
export async function resumePayment(registrationId) {
  const reg = await Registration.findById(registrationId);
  if (!reg) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }

  const RESUMABLE = [
    PAYMENT_STATUSES.PENDING,
    PAYMENT_STATUSES.FAILED,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.NETWORK_ERROR,
    PAYMENT_STATUSES.VERIFICATION_FAILED
  ];
  if (!RESUMABLE.includes(reg.paymentStatus)) {
    throw new HttpError(
      400,
      'NOT_RESUMABLE',
      `Cannot resume payment for a registration in '${reg.paymentStatus}' state.`
    );
  }

  // Issue a fresh tran_id on the same document. Status is intentionally left
  // unchanged here — the caller flips it to Processing only AFTER the fresh
  // gateway session is successfully created, so a gateway failure keeps the
  // record in its original recoverable (resumable) state.
  const crypto = await import('node:crypto');
  const newTranId = `tran_${crypto.randomUUID().replace(/-/g, '')}`;
  reg.tran_id = newTranId;
  await reg.save();

  return { registration: reg, tran_id: newTranId, payableAmount: reg.payableAmount };
}