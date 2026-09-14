import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import { HttpError } from '../../utils/httpError.js';
import { maskNid, generateTranId } from '../../utils/crypto.js';
import { calculatePayableAmount } from '../../services/feeService.js';
import {
  manualCapacityChange,
  ensureCapacityExists
} from '../../services/capacityService.js';
import { issueTicket } from '../../services/ticketService.js';
import { enqueueTicketConfirmation } from '../../services/queueService.js';
import { logAdminAction } from '../../services/auditService.js';
import { resumePayment } from '../../services/paymentService.js';
import { initiateSession, refundTransaction } from '../../services/sslcommerzService.js';
import { readStoredPhoto } from '../../services/uploadService.js';
import { AUDIT_ACTIONS, PAYMENT_STATUSES, REGISTRATION_SOURCES } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import Registration from '../../models/Registration.js';
import FeeConfig from '../../models/FeeConfig.js';

const MASKED_FIELDS = { __v: 0 };

function clientIp(req) {
  return req.ip || null;
}

function gatewayUrls() {
  return {
    successUrl: env.sslcommerz.successUrl,
    failUrl: env.sslcommerz.failUrl,
    cancelUrl: env.sslcommerz.cancelUrl,
    ipnUrl: env.sslcommerz.ipnUrl
  };
}

export const listRegistrations = asyncHandler(async (req, res) => {
  const { page, limit, search, paymentStatus, participantType } = req.validated.query;

  const filter = {};
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (participantType) filter.participantType = participantType;
  if (search) {
    filter.$text = { $search: search };
  }

  const [docs, total] = await Promise.all([
    Registration.find(filter, MASKED_FIELDS)
      .sort({ registeredAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Registration.countDocuments(filter)
  ]);

  const rows = docs.map((d) => ({
    ...d,
    nid: maskNid(d.nid)
  }));

  return success(res, rows, {
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});

export const getRegistrationDetail = asyncHandler(async (req, res) => {
  const registration = await Registration.findById(req.params.id);
  if (!registration) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.VIEW_SENSITIVE_DATA,
    targetType: 'Registration',
    targetId: registration._id,
    ipAddress: clientIp(req)
  });

  return success(res, {
    registration,
    sensitive: { nid: registration.nid, photoUrl: registration.photoUrl }
  });
});

export const updateRegistration = asyncHandler(async (req, res) => {
  const body = req.validated.body;
  const registration = await Registration.findById(req.params.id);
  if (!registration) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }

  const before = registration.toObject();
  const isPaid = registration.paymentStatus === PAYMENT_STATUSES.PAID;

  // Reject a paidAmount edit on an already-Paid record unless explicitly flagged.
  let overrideFlagged = false;
  if (body.paidAmount !== undefined && isPaid) {
    if (body.paidAmountOverride !== true) {
      throw new HttpError(
        400,
        'PAYMENT_OVERRIDE_REQUIRED',
        'Editing paidAmount on a Paid registration requires an explicit paidAmountOverride flag (logs manual_payment_override).'
      );
    }
    overrideFlagged = true;
  }

  // Duplicate guard when identity fields change
  if (body.email || body.nid) {
    const newEmail = body.email || registration.email;
    const newNid = body.nid || registration.nid;
    const dup = await Registration.findOne({ email: newEmail, nid: newNid, _id: { $ne: registration._id } });
    if (dup) {
      throw new HttpError(409, 'DUPLICATE_REGISTRATION', 'Another registration already uses this email and NID.');
    }
  }

  // payableAmount is always server-calculated — recompute when accompany count
  // changes on a non-Paid record (historical snapshot protection, Section 5).
  if (!isPaid && body.numberOfAccompany !== undefined && body.numberOfAccompany !== registration.numberOfAccompany) {
    const feeConfig = await FeeConfig.findById('event');
    if (!feeConfig) {
      throw new HttpError(503, 'SETTINGS_MISSING', 'Fee configuration is not set up.');
    }
    body.payableAmount = calculatePayableAmount(
      registration.participantType,
      body.numberOfAccompany,
      feeConfig
    );
  }

  // Apply allowed fields (schema itself forbids participantType / direct payableAmount)
  for (const [key, value] of Object.entries(body)) {
    if (key === 'paidAmountOverride') continue;
    registration[key] = value;
  }
  await registration.save();

  const after = registration.toObject();

  if (overrideFlagged) {
    await logAdminAction({
      adminId: req.admin._id,
      action: AUDIT_ACTIONS.MANUAL_PAYMENT_OVERRIDE,
      targetType: 'Registration',
      targetId: registration._id,
      before: { paidAmount: before.paidAmount },
      after: { paidAmount: after.paidAmount },
      ipAddress: clientIp(req)
    });
  }
  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.MEMBER_EDIT,
    targetType: 'Registration',
    targetId: registration._id,
    before,
    after,
    ipAddress: clientIp(req)
  });

  return success(res, { registration });
});

export const resumePaymentAction = asyncHandler(async (req, res) => {
  const { registration, tran_id: newTranId } = await resumePayment(req.params.id);
  const previousStatus = registration.paymentStatus;

  let gatewayUrl = null;
  try {
    const session = await initiateSession({
      tranId: newTranId,
      amount: registration.payableAmount,
      participant: registration,
      gatewayUrls: gatewayUrls()
    });
    gatewayUrl = session.gatewayPageUrl;
  } catch (err) {
    // The new tran_id stays on the record; an admin can retry resume-payment.
    logger.error({ err, registrationId: registration._id, tranId: newTranId }, 'Resume-payment session init failed');
    throw new HttpError(
      502,
      'GATEWAY_ERROR',
      'Resume-payment prepared a new tran_id but the gateway could not be reached. Try again — the same tran_id will be reused.'
    );
  }

  registration.paymentStatus = PAYMENT_STATUSES.PROCESSING;
  await registration.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.RESUME_PAYMENT,
    targetType: 'Registration',
    targetId: registration._id,
    before: { paymentStatus: previousStatus },
    after: { paymentStatus: PAYMENT_STATUSES.PROCESSING, tran_id: newTranId },
    ipAddress: clientIp(req)
  });

  return success(res, {
    registrationId: registration._id,
    tran_id: newTranId,
    payableAmount: registration.payableAmount,
    gatewayUrl
  });
});

export const manualCreate = asyncHandler(async (req, res) => {
  const body = req.validated.body;

  const dup = await Registration.findOne({ email: body.email, nid: body.nid });
  if (dup) {
    throw new HttpError(409, 'DUPLICATE_REGISTRATION', 'A registration with this email and NID already exists.');
  }

  const feeConfig = await FeeConfig.findById('event');
  if (!feeConfig) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Fee configuration is not set up.');
  }

  const payableAmount = calculatePayableAmount(body.participantType, body.numberOfAccompany, feeConfig);
  const isPaid = body.paymentStatus === PAYMENT_STATUSES.PAID;

  const registration = await Registration.create({
    ...body,
    payableAmount,
    paidAmount: isPaid ? body.paidAmount : 0,
    photoUrl: body.photoUrl || '',
    tran_id: generateTranId(),
    paymentStatus: isPaid ? PAYMENT_STATUSES.PAID : PAYMENT_STATUSES.PENDING,
    registrationSource: REGISTRATION_SOURCES.ADMIN_MANUAL,
    ticketDisplayId: isPaid ? issueTicket(body.participantType) : null
  });

  if (isPaid) {
    const cap = await manualCapacityChange(1);
    logger.info({ before: cap.before, after: cap.after, registrationId: registration._id }, 'Manual paid registration slot');
    enqueueTicketConfirmation({ toEmail: registration.email, toSms: registration.whatsappNo, registration }).catch((err) => {
      logger.error({ err, registrationId: registration._id }, 'Manual-paid ticket enqueue failed');
    });
  }

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.MANUAL_REGISTRATION,
    targetType: 'Registration',
    targetId: registration._id,
    before: null,
    after: { participantType: body.participantType, name: body.name, paymentStatus: registration.paymentStatus, payableAmount, paidAmount: registration.paidAmount },
    ipAddress: clientIp(req)
  });

  return success(res, { registration }, { statusCode: 201 });
});

/**
 * SuperAdmin-only. Resolves an Oversold-PendingReview record (or any
 * pending-state record) by either marking it Paid with a manual capacity
 * exception, or triggering a refund. Every use logs `capacity_manual_override`
 * with before/after paidSlots — the action deliberately bypasses the atomic
 * guard everything else relies on, so it must be unambiguous in an audit.
 */
export const manualPaymentOverride = asyncHandler(async (req, res) => {
  const { action, note } = req.validated.body;
  const registration = await Registration.findById(req.params.id);
  if (!registration) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }
  const previousStatus = registration.paymentStatus;
  if (registration.paymentStatus === PAYMENT_STATUSES.PAID) {
    throw new HttpError(400, 'ALREADY_PAID', 'This registration is already Paid.');
  }
  await ensureCapacityExists();

  if (action === 'mark-paid') {
    const capChange = await manualCapacityChange(1);
    registration.paymentStatus = PAYMENT_STATUSES.PAID;
    registration.paidAmount = registration.payableAmount;
    registration.ticketDisplayId = issueTicket(registration.participantType);
    await registration.save();

    enqueueTicketConfirmation({ toEmail: registration.email, toSms: registration.whatsappNo, registration }).catch((err) => {
      logger.error({ err, registrationId: registration._id }, 'Override-paid ticket enqueue failed');
    });

    await logAdminAction({
      adminId: req.admin._id,
      action: AUDIT_ACTIONS.CAPACITY_MANUAL_OVERRIDE,
      targetType: 'Registration',
      targetId: registration._id,
      before: { paymentStatus: previousStatus, note },
      after: { paymentStatus: PAYMENT_STATUSES.PAID, ticketDisplayId: registration.ticketDisplayId },
      ipAddress: clientIp(req)
    });
    await logAdminAction({
      adminId: req.admin._id,
      action: AUDIT_ACTIONS.CAPACITY_MANUAL_OVERRIDE,
      targetType: 'Capacity',
      targetId: 'event',
      before: capChange.before,
      after: capChange.after,
      ipAddress: clientIp(req)
    });

    return success(res, { registrationId: registration._id, resolvedTo: PAYMENT_STATUSES.PAID, capacity: capChange.after });
  }

  // action === 'refund'
  const refundResult = await refundTransaction({
    tranId: registration.tran_id,
    amount: registration.paidAmount || registration.payableAmount,
    refundRef: `override_${registration._id}_${Date.now()}`,
    reason: note || 'Manual payment override by SuperAdmin'
  });

  const capChange = await manualCapacityChange(-1, { floorAtZero: true });
  registration.paymentStatus = PAYMENT_STATUSES.CANCELLED;
  await registration.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.CAPACITY_MANUAL_OVERRIDE,
    targetType: 'Capacity',
    targetId: 'event',
    before: capChange.before,
    after: capChange.after,
    ipAddress: clientIp(req)
  });
  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.CAPACITY_MANUAL_OVERRIDE,
    targetType: 'Registration',
    targetId: registration._id,
    before: { paymentStatus: previousStatus },
    after: { paymentStatus: PAYMENT_STATUSES.CANCELLED, refundReference: refundResult?.ref || null },
    ipAddress: clientIp(req)
  });

  return success(res, { registrationId: registration._id, resolvedTo: PAYMENT_STATUSES.CANCELLED, refundResult, capacity: capChange.after });
});

export const registrationPhoto = asyncHandler(async (req, res) => {
  const registration = await Registration.findById(req.params.id);
  if (!registration) {
    throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
  }
  if (!registration.photoUrl) {
    throw new HttpError(404, 'NO_PHOTO', 'This registration has no photo.');
  }

  const photo = await readStoredPhoto(registration.photoUrl);
  if (!photo) {
    throw new HttpError(404, 'NO_PHOTO', 'Photo file could not be found.');
  }

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.VIEW_SENSITIVE_DATA,
    targetType: 'Registration',
    targetId: registration._id,
    ipAddress: clientIp(req)
  });

  res.set('Content-Type', photo.mime);
  res.set('Cache-Control', 'private, max-age=60');
  return res.send(photo.data);
});