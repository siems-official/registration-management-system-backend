import crypto from 'node:crypto';
import { PARTICIPANT_TYPES, RESUMABLE_PAYMENT_STATUSES } from '../config/constants.js';

export function generateTranId() {
  // cryptographically random — never Date.now()-based
  return `tran_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function generateRandomFileName(extension) {
  return `${crypto.randomBytes(16).toString('hex')}.${extension.replace(/^\./, '')}`;
}

export function maskNid(nid) {
  const s = String(nid);
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}

export function generateTicketDisplayId(participantType) {
  const prefix = participantType === PARTICIPANT_TYPES.ALUMNI ? 'ALUM' : 'STU';
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const year = new Date().getUTCFullYear();
  return `${prefix}-${year}-${random}`;
}

export function isResumableStatus(status) {
  return RESUMABLE_PAYMENT_STATUSES.includes(status);
}