import Joi from 'joi';
import {
  PARTICIPANT_TYPES,
  TSHIRT_SIZES,
  MAX_ACCOMPANY
} from '../config/constants.js';

// Base fields shared by both participant types. Joi defaults to
// { allowUnknown: false } — unknown fields are rejected outright.
const baseFields = {
  participantType: Joi.string()
    .valid(PARTICIPANT_TYPES.ALUMNI, PARTICIPANT_TYPES.CURRENT_STUDENT)
    .required(),
  name: Joi.string().trim().min(1).max(150).required(),
  nid: Joi.string().trim().min(4).max(30).required(),
  dateOfBirth: Joi.date().iso().max('now').required(),
  institution: Joi.string().trim().min(1).max(200).required(),
  presentAddress: Joi.string().trim().min(1).max(500).required(),
  permanentAddress: Joi.string().trim().min(1).max(500).required(),
  whatsappNo: Joi.string()
    .trim()
    .pattern(/^[+0-9][0-9 ()-]{6,19}$/)
    .required(),
  email: Joi.string().trim().lowercase().email().max(200).required(),
  numberOfAccompany: Joi.number().integer().min(0).max(MAX_ACCOMPANY).default(0),
  tshirtSize: Joi.string()
    .valid(...TSHIRT_SIZES)
    .required()
};

// Alumni-only fields. For Current Students the same fields are forbidden.
// `.when('participantType')` is used instead of a root-level alternatives+ref,
// which Joi 17.13 cannot resolve at the schema root.
const alumniScholarFields = {
  profession: Joi.string().trim().max(200),
  designation: Joi.string().trim().max(200),
  yearOfPassingBSc: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1),
  yearOfPassingMSc: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1)
};

function forbidForCurrentStudent(field) {
  return field.when('participantType', {
    is: PARTICIPANT_TYPES.CURRENT_STUDENT,
    then: Joi.forbidden()
  });
}

function buildRegistrationSchema(extraFields = {}) {
  return Joi.object({
    ...baseFields,
    ...Object.fromEntries(
      Object.entries(alumniScholarFields).map(([k, v]) => [k, forbidForCurrentStudent(v)])
    ),
    ...extraFields
  });
}

// Public multipart registration: `photo` arrives via multer (file), the rest
// arrives as text fields. Joi validates the text payload only.
export const createRegistrationSchema = buildRegistrationSchema();

// Admin manual creation — same shape as import rows.
export const manualRegistrationSchema = buildRegistrationSchema({
  photoUrl: Joi.string().trim().max(500),
  paymentStatus: Joi.string()
    .valid('Pending', 'Paid')
    .default('Pending'),
  paidAmount: Joi.number().integer().min(0),
  referenceNote: Joi.string().trim().max(500).when('paymentStatus', {
    is: 'Paid',
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

export const statusQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(200),
  paymentStatus: Joi.string().valid(
    'Pending',
    'Processing',
    'Paid',
    'Failed',
    'Cancelled',
    'Network Error',
    'Verification Failed',
    'Oversold-PendingReview'
  ),
  participantType: Joi.string().valid(...Object.values(PARTICIPANT_TYPES))
});

export { buildRegistrationSchema };