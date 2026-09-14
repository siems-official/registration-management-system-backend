import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import { HttpError } from '../../utils/httpError.js';
import { logAdminAction } from '../../services/auditService.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import { getCapacity as getCapacityRecord, setMaxCapacity } from '../../services/capacityService.js';
import FeeConfig from '../../models/FeeConfig.js';
import RegistrationSettings from '../../models/RegistrationSettings.js';

function clientIp(req) {
  return req.ip || null;
}

export const getFees = asyncHandler(async (_req, res) => {
  await FeeConfig.findByIdAndUpdate(
    'event',
    { $setOnInsert: { alumnusFee: 2000, currentStudentFee: 1000, perAccompanyFee: 1000 } },
    { upsert: true }
  );
  const config = await FeeConfig.findById('event');
  if (!config) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Fee configuration is not set up.');
  }
  return success(res, {
    alumnusFee: config.alumnusFee,
    currentStudentFee: config.currentStudentFee,
    perAccompanyFee: config.perAccompanyFee,
    updatedAt: config.updatedAt
  });
});

export const patchFees = asyncHandler(async (req, res) => {
  await getFeesConfigOrThrow();
  const before = await FeeConfig.findById('event');
  const after = await FeeConfig.findByIdAndUpdate(
    'event',
    { ...req.validated.body, updatedAt: new Date() },
    { new: true }
  );

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.FEE_UPDATE,
    targetType: 'FeeConfig',
    targetId: 'event',
    before: {
      alumnusFee: before.alumnusFee,
      currentStudentFee: before.currentStudentFee,
      perAccompanyFee: before.perAccompanyFee
    },
    after: {
      alumnusFee: after.alumnusFee,
      currentStudentFee: after.currentStudentFee,
      perAccompanyFee: after.perAccompanyFee
    },
    ipAddress: clientIp(req)
  });

  return success(res, after);
});

export const getCapacity = asyncHandler(async (_req, res) => {
  const capacity = await getCapacityOrThrow();
  return success(res, capacity);
});

export const patchCapacity = asyncHandler(async (req, res) => {
  await getCapacityOrThrow();
  const { before, after } = await setMaxCapacity(req.validated.body.maxCapacity);

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.CAPACITY_UPDATE,
    targetType: 'Capacity',
    targetId: 'event',
    before,
    after,
    ipAddress: clientIp(req)
  });

  return success(res, after);
});

export const getDeadline = asyncHandler(async (_req, res) => {
  const settings = await getSettingsOrThrow();
  return success(res, { registrationDeadline: settings.registrationDeadline });
});

export const patchDeadline = asyncHandler(async (req, res) => {
  await getSettingsOrThrow();
  const before = await RegistrationSettings.findById('event');
  const after = await RegistrationSettings.findByIdAndUpdate(
    'event',
    { registrationDeadline: req.validated.body.registrationDeadline },
    { new: true }
  );

  await logAdminAction({
    adminId: req.admin._id,
    action: AUDIT_ACTIONS.REGISTRATION_DEADLINE_UPDATE,
    targetType: 'RegistrationSettings',
    targetId: 'event',
    before: { registrationDeadline: before.registrationDeadline },
    after: { registrationDeadline: after.registrationDeadline },
    ipAddress: clientIp(req)
  });

  return success(res, { registrationDeadline: after.registrationDeadline });
});

async function getFeesConfigOrThrow() {
  const exists = await FeeConfig.findById('event');
  if (!exists) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Fee configuration has not been seeded.');
  }
  return exists;
}

async function getCapacityOrThrow() {
  const capacity = await getCapacityRecord();
  if (!capacity) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Capacity has not been seeded.');
  }
  return capacity;
}

async function getSettingsOrThrow() {
  const settings = await RegistrationSettings.findById('event');
  if (!settings) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Registration settings have not been seeded.');
  }
  return settings;
}