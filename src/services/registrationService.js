import RegistrationSettings from '../models/RegistrationSettings.js';
import Registration from '../models/Registration.js';
import { HttpError } from '../utils/httpError.js';
import { serverNow, isPastDeadline } from '../utils/date.js';

/**
 * Enforce the registration deadline on the server clock — never trust any
 * client-supplied timestamp.
 */
export async function enforceRegistrationDeadline() {
  const settings = await RegistrationSettings.findById('event');
  if (!settings) {
    throw new HttpError(503, 'SETTINGS_MISSING', 'Registration settings are not configured.');
  }
  if (isPastDeadline(settings.registrationDeadline, serverNow())) {
    throw new HttpError(
      410,
      'REGISTRATION_CLOSED',
      'Registration has closed.'
    );
  }
  return settings;
}

export async function getRegistrationDeadline() {
  const settings = await RegistrationSettings.findById('event');
  return settings ? settings.registrationDeadline : null;
}

/**
 * Duplicate check: ONLY when both email AND nid match (Section 3.1 compound
 * index). A row matching on a single key alone is accepted.
 */
export async function findDuplicateRegistration({ email, nid }) {
  return Registration.findOne({ email, nid });
}

export function assertDuplicateIsNone(dup) {
  if (dup) {
    throw new HttpError(
      409,
      'DUPLICATE_REGISTRATION',
      'A registration with this email and NID already exists.'
    );
  }
}