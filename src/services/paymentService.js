import { PAYMENT_STATUSES, CELLFIN_STATUS_MAP, CELLFIN_APPROVED_STATUS } from '../config/constants.js';
import { isMockMode, queryStatus, CellfinError } from './cellfinService.js';
import { reserveSlot } from './capacityService.js';
import { issueTicket } from './ticketService.js';
import { enqueueTicketConfirmation } from './queueService.js';
import { HttpError } from '../utils/httpError.js';
import Registration from '../models/Registration.js';
import { logger } from '../config/logger.js';

/**
 * IPN reconciliation — the single authoritative path from Pending → Paid.
 *
 * CellFin flow: the IPN POST body is treated as UNTRUSTED — its `status` field
 * is never branched on. The registration is looked up by the body's
 * `correlationId` (== our tran_id), then re-verified against CellFin's STATUS
 * query API using the body's `token`. Only that queried status drives a
 * state change. Callers must invoke the full flow (authoritative query +
 * amount check + atomic capacity reservation) before ever setting
 * `paymentStatus = 'Paid'`.
 */
export async function reconcileIpn({ correlationId, token, body }) {
  // 1. Load the pending registration
  const registration = await Registration.findOne({ tran_id: correlationId });
  if (!registration) {
    logger.warn({ correlationId, token, body }, 'IPN received for unknown correlation_id');
    return { status: 'not_found' };
  }

  // 2. Idempotency — already resolved
  if (registration.paymentStatus === PAYMENT_STATUSES.PAID) {
    return { status: 'already_paid', registration };
  }

  // 3. Authoritative re-verification — never trust the POST body's status.
  let queried;
  try {
    queried = await queryStatus({ correlationId, token });
  } catch (err) {
    if (err instanceof CellfinError) {
      logger.error({ err, correlationId, token, ipnBody: body }, 'CellFin status query failed');
      registration.paymentStatus = PAYMENT_STATUSES.NETWORK_ERROR;
      await registration.save();
      return { status: 'network_error', registration };
    }
    throw err;
  }

  // 4. Map the QUERIED status through the single source of truth. Anything
  //    other than APPROVED stops here. An unrecognized status is Verification
  //    Failed + a loud log — never guessed.
  const queriedStatus = queried?.status;
  if (queriedStatus !== CELLFIN_APPROVED_STATUS) {
    const mapped = CELLFIN_STATUS_MAP[queriedStatus];
    if (!mapped) {
      logger.error(
        { queriedStatus, correlationId, queryResult: queried },
        'UNRECOGNIZED CellFin status — flagging as Verification Failed'
      );
      registration.paymentStatus = PAYMENT_STATUSES.VERIFICATION_FAILED;
    } else {
      logger.warn(
        { queriedStatus, correlationId, mapped },
        'CellFin transaction not approved — applying mapped status'
      );
      registration.paymentStatus = mapped;
    }
    await registration.save();
    return { status: 'not_approved', registration, queriedStatus };
  }

  // 5. Amount / currency check. BDT-only gateway; CellFin returns tr_amount.
  const mock = isMockMode() && queried?.mock === true;
  const trAmount = Number(queried?.tr_amount ?? body?.tr_amount);
  const numericAmount = Number.isFinite(trAmount) ? trAmount : registration.payableAmount;

  if (!mock && numericAmount !== registration.payableAmount) {
    logger.warn(
      { expected: registration.payableAmount, got: numericAmount, correlationId },
      'Amount mismatch — rejecting'
    );
    registration.paymentStatus = PAYMENT_STATUSES.VERIFICATION_FAILED;
    await registration.save();
    return { status: 'amount_mismatch', registration };
  }

  // 6. Atomic capacity reservation — MUST succeed before marking Paid.
  const { reserved, capacity } = await reserveSlot();
  if (!reserved) {
    registration.paymentStatus = PAYMENT_STATUSES.OVERSOLD_PENDING_REVIEW;
    registration.paidAmount = numericAmount || registration.payableAmount;
    await registration.save();
    logger.warn(
      { correlationId, paidSlots: capacity?.paidSlots, maxCapacity: capacity?.maxCapacity },
      'Capacity exhausted — Oversold-PendingReview'
    );
    return { status: 'oversold', registration };
  }

  // 7. Commit Paid status
  registration.paymentStatus = PAYMENT_STATUSES.PAID;
  registration.paidAmount = numericAmount || registration.payableAmount;
  registration.gatewayToken = token;
  registration.gatewayTrId = queried?.trId || body?.trId || null;
  registration.ticketDisplayId = issueTicket(registration.participantType);
  await registration.save();

  // 8. Enqueue confirmation delivery — must never change paymentStatus
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
 * Resume payment for a stuck/failed/cancelled registration. Called by an admin
 * and logged as `resume_payment`.
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

  // Issue a fresh tran_id (== CellFin correlationId) on the same document.
  // Status is intentionally left unchanged here — the caller flips it to
  // Processing only AFTER the fresh gateway token is successfully created, so
  // a gateway failure keeps the record in its original recoverable state.
  const crypto = await import('node:crypto');
  const newTranId = `tran_${crypto.randomUUID().replace(/-/g, '')}`;
  reg.tran_id = newTranId;
  await reg.save();

  return { registration: reg, tran_id: newTranId, payableAmount: reg.payableAmount };
}