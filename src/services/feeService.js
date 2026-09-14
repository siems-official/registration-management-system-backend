import { PARTICIPANT_TYPES } from '../config/constants.js';

/**
 * Server-authoritative fee calculation (Section 5).
 * Never accept a client-supplied amount anywhere in the codebase.
 */
export function calculatePayableAmount(participantType, numberOfAccompany, feeConfig) {
  const base =
    participantType === PARTICIPANT_TYPES.ALUMNI
      ? feeConfig.alumnusFee
      : feeConfig.currentStudentFee;
  const accompany = Number.isFinite(numberOfAccompany) ? numberOfAccompany : 0;
  return base + accompany * feeConfig.perAccompanyFee;
}