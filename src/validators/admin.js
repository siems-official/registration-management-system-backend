import Joi from 'joi';

export const adminLoginSchema = Joi.object({
  username: Joi.string().trim().min(1).max(50).required(),
  password: Joi.string().min(6).max(200).required()
});

export const verify2faSchema = Joi.object({
  // preauthToken optional in body; may also be supplied via Authorization header
  preauthToken: Joi.string().trim().min(20).optional(),
  totp: Joi.string().trim().pattern(/^\d{6}$/).required()
});

export const patchSettingsSchema = (allowedKeys, perKeySchema) =>
  Joi.object(
    Object.fromEntries(
      allowedKeys.map((key) => [
        key,
        perKeySchema[key].optional()
      ])
    )
  ).min(1);

export const feeConfigPatchSchema = patchSettingsSchema(
  ['alumnusFee', 'currentStudentFee', 'perAccompanyFee'],
  {
    alumnusFee: Joi.number().integer().min(0).max(1000000),
    currentStudentFee: Joi.number().integer().min(0).max(1000000),
    perAccompanyFee: Joi.number().integer().min(0).max(1000000)
  }
);

export const capacityPatchSchema = patchSettingsSchema(['maxCapacity'], {
  maxCapacity: Joi.number().integer().min(1).max(100000000)
});

export const deadlinePatchSchema = patchSettingsSchema(['registrationDeadline'], {
  registrationDeadline: Joi.date().iso().required()
});

export const updateRegistrationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150),
  nid: Joi.string().trim().min(4).max(30),
  dateOfBirth: Joi.date().iso().max('now'),
  profession: Joi.string().allow(null).trim().max(200),
  designation: Joi.string().allow(null).trim().max(200),
  institution: Joi.string().trim().min(1).max(200),
  presentAddress: Joi.string().trim().min(1).max(500),
  permanentAddress: Joi.string().trim().min(1).max(500),
  whatsappNo: Joi.string().trim().pattern(/^[+0-9][0-9 ()-]{6,19}$/),
  email: Joi.string().trim().email().max(200),
  yearOfPassingBSc: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1),
  yearOfPassingMSc: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1),
  numberOfAccompany: Joi.number().integer().min(0).max(20),
  tshirtSize: Joi.string().valid('S', 'M', 'L', 'XL', 'XXL'),
  photoUrl: Joi.string().trim().max(500),
  participantType: Joi.forbidden(),
  // paidAmount override on a Paid record — must be explicitly flagged
  paidAmount: Joi.number().integer().min(0),
  paidAmountOverride: Joi.boolean().default(false)
});

export const resumePaymentBodySchema = Joi.object({}).min(0);

export const manualOverrideBodySchema = Joi.object({
  action: Joi.string().valid('mark-paid', 'refund').required(),
  note: Joi.string().trim().max(500)
});

export const auditLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  adminId: Joi.string().trim(),
  action: Joi.string().trim(),
  from: Joi.date().iso(),
  to: Joi.date().iso()
});