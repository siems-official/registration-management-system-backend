import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import { isPastDeadline, serverNow } from '../../utils/date.js';
import FeeConfig from '../../models/FeeConfig.js';
import RegistrationSettings from '../../models/RegistrationSettings.js';
import { HttpError } from '../../utils/httpError.js';

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

export const getRegistrationSettings = asyncHandler(async (_req, res) => {
  const settings = await RegistrationSettings.findById('event');
  if (!settings) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Registration settings are not set up.');
  }
  const deadline = settings.registrationDeadline;
  return success(res, {
    registrationDeadline: deadline,
    isRegistrationOpen: !isPastDeadline(deadline, serverNow())
  });
});