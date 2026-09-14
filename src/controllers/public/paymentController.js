import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import { HttpError } from '../../utils/httpError.js';
import { reconcileIpn } from '../../services/paymentService.js';
import { initiateSession } from '../../services/sslcommerzService.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { PAYMENT_STATUSES } from '../../config/constants.js';
import Registration from '../../models/Registration.js';

export const initiatePayment = asyncHandler(async (req, res) => {
  const registration = await Registration.findById(req.params.registrationId);
  if (!registration) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }

  const allowInitiate = [PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.PROCESSING].includes(
    registration.paymentStatus
  );
  if (!allowInitiate) {
    throw new HttpError(
      400,
      'NOT_RESUMABLE',
      `Cannot initiate payment for a registration in '${registration.paymentStatus}' state. ` +
        'Contact the event admin to resume payment.'
    );
  }

  const session = await initiateSession({
    tranId: registration.tran_id,
    amount: registration.payableAmount,
    participant: registration,
    gatewayUrls: {
      successUrl: env.sslcommerz.successUrl,
      failUrl: env.sslcommerz.failUrl,
      cancelUrl: env.sslcommerz.cancelUrl,
      ipnUrl: env.sslcommerz.ipnUrl
    }
  });

  if (registration.paymentStatus !== PAYMENT_STATUSES.PROCESSING) {
    registration.paymentStatus = PAYMENT_STATUSES.PROCESSING;
    await registration.save();
  }

  return success(res, {
    registrationId: registration._id,
    tran_id: registration.tran_id,
    payableAmount: registration.payableAmount,
    gatewayUrl: session.gatewayPageUrl
  });
});

/**
 * SSLCommerz IPN — server-to-server callback. The ONLY authoritative path to
 * `Paid`. The POST body is treated as untrusted; reconciliation goes through
 * the validation API (Section 6.2).
 */
export const ipn = asyncHandler(async (req, res) => {
  const { tran_id: tranId, val_id: valId, status: gwStatus } = req.body || {};

  if (!tranId || !valId) {
    logger.warn({ body: req.body }, 'IPN received without tran_id/val_id');
    return res.status(200).send('IPN_OK');
  }

  const result = await reconcileIpn({ tranId, valId, body: req.body || {} });

  logger.info(
    { tranId, valId, gwStatus, outcome: result.status, registrationId: result.registration?._id },
    'IPN reconciled'
  );

  if (result.status === 'not_found') return res.status(200).send('IPN_OK');

  return success(res, {
    status: result.status,
    registrationId: result.registration?._id,
    ticketDisplayId: result.registration?.ticketDisplayId ?? null
  });
});

function redirectPage(title, message, extraHtml = '') {
  return `<!DOCTYPE html><html><head><title>${title}</title></head>
  <body style="font-family:sans-serif;background:#f6f6f6;display:flex;align-items:center;justify-content:center;min-height:100vh">
    <div style="background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);max-width:480px">
      <h2 style="margin:0 0 8px">${title}</h2><p style="color:#555;margin:0 0 16px">${message}</p>${extraHtml}
    </div></body></html>`;
}

// These three are UX-only redirect targets — never a source of truth for the
// payment state; that is the IPN's job (Section 4).
export const gatewaySuccess = asyncHandler(async (_req, res) => {
  res.send(
    redirectPage(
      'Thank you',
      'Your payment has been received. You will receive a confirmation email shortly.'
    )
  );
});

export const gatewayFail = asyncHandler(async (_req, res) => {
  res.send(
    redirectPage(
      'Payment Failed',
      'Your payment could not be completed. Please contact the event admin to resume payment.'
    )
  );
});

export const gatewayCancel = asyncHandler(async (_req, res) => {
  res.send(
    redirectPage(
      'Payment Cancelled',
      'You cancelled the payment. If you still wish to register, please try again or contact the event admin.'
    )
  );
});