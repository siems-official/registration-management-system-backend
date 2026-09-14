import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success, fail } from '../../utils/response.js';
import { HttpError } from '../../utils/httpError.js';
import { generateTranId } from '../../utils/crypto.js';
import {
  enforceRegistrationDeadline,
  findDuplicateRegistration,
  assertDuplicateIsNone
} from '../../services/registrationService.js';
import { calculatePayableAmount } from '../../services/feeService.js';
import { isCapacityAvailable } from '../../services/capacityService.js';
import { initiateSession } from '../../services/sslcommerzService.js';
import { storeUploadedPhoto } from '../../services/uploadService.js';
import { PAYMENT_STATUSES } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import FeeConfig from '../../models/FeeConfig.js';
import Registration from '../../models/Registration.js';

export const createRegistration = asyncHandler(async (req, res) => {
  const body = req.validated?.body || {};

  await enforceRegistrationDeadline();

  const dup = await findDuplicateRegistration({ email: body.email, nid: body.nid });
  assertDuplicateIsNone(dup);

  const available = await isCapacityAvailable();
  if (!available) {
    throw new HttpError(
      409,
      'EVENT_FULL',
      'Registration is currently full. No more seats are available.'
    );
  }

  const feeConfig = await FeeConfig.findById('event');
  if (!feeConfig) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Fee configuration is not set up.');
  }

  const payableAmount = calculatePayableAmount(
    body.participantType,
    body.numberOfAccompany,
    feeConfig
  );

  const { photoUrl } = await storeUploadedPhoto(req.file);

  const tranId = generateTranId();
  const registration = await Registration.create({
    ...body,
    photoUrl,
    payableAmount,
    tran_id: tranId,
    paymentStatus: PAYMENT_STATUSES.PENDING,
    registrationSource: 'self'
  });

  let gatewayUrl = null;
  try {
    const session = await initiateSession({
      tranId,
      amount: payableAmount,
      participant: registration,
      gatewayUrls: {
        successUrl: env.sslcommerz.successUrl,
        failUrl: env.sslcommerz.failUrl,
        cancelUrl: env.sslcommerz.cancelUrl,
        ipnUrl: env.sslcommerz.ipnUrl
      }
    });
    gatewayUrl = session.gatewayPageUrl;
  } catch (err) {
    // Section 6.3 / Part-1 fix: the Pending registration MUST persist after a
    // gateway-init failure so an admin can recover it via resume-payment.
    logger.error({ err, registrationId: registration._id, tranId }, 'Session init failed post-creation');
    return fail(
      res,
      502,
      'GATEWAY_ERROR',
      'Registration was saved but the payment gateway could not be reached. Please retry payment later.',
      { registrationId: registration._id.toString(), tranId }
    );
  }

  registration.paymentStatus = PAYMENT_STATUSES.PROCESSING;
  await registration.save();

  return success(
    res,
    {
      registrationId: registration._id,
      tran_id: tranId,
      payableAmount,
      gatewayUrl,
      paymentStatus: registration.paymentStatus
    },
    { statusCode: 201 }
  );
});

export const getRegistrationStatus = asyncHandler(async (req, res) => {
  const registration = await Registration.findById(req.params.id);
  if (!registration) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }
  return success(res, {
    registrationId: registration._id,
    paymentStatus: registration.paymentStatus,
    ticketDisplayId: registration.ticketDisplayId,
    payableAmount: registration.payableAmount,
    paidAmount: registration.paidAmount,
    updatedAt: registration.updatedAt
  });
});