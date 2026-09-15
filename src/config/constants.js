export const PARTICIPANT_TYPES = {
  ALUMNI: 'Alumni',
  CURRENT_STUDENT: 'Current Student'
};

export const PAYMENT_STATUSES = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  PAID: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  NETWORK_ERROR: 'Network Error',
  VERIFICATION_FAILED: 'Verification Failed',
  OVERSOLD_PENDING_REVIEW: 'Oversold-PendingReview'
};

// Statuses for which an admin may generate a fresh resume-payment session
// (Section 6.5 of the spec). Oversold-PendingReview is intentionally excluded
// until a SuperAdmin resolves it.
export const RESUMABLE_PAYMENT_STATUSES = [
  PAYMENT_STATUSES.PENDING,
  PAYMENT_STATUSES.FAILED,
  PAYMENT_STATUSES.CANCELLED,
  PAYMENT_STATUSES.NETWORK_ERROR,
  PAYMENT_STATUSES.VERIFICATION_FAILED
];

export const REGISTRATION_SOURCES = {
  SELF: 'self',
  ADMIN_MANUAL: 'admin-manual'
};

export const TSHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

export const ADMIN_ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin'
};

export const QUEUE_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms'
};

export const QUEUE_STATUSES = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed'
};

export const QUEUE_TYPES = {
  TICKET_CONFIRMATION: 'ticket_confirmation'
};

export const AUDIT_ACTIONS = {
  FEE_UPDATE: 'fee_update',
  CAPACITY_UPDATE: 'capacity_update',
  REGISTRATION_DEADLINE_UPDATE: 'registration_deadline_update',
  RESUME_PAYMENT: 'resume_payment',
  MEMBER_EDIT: 'member_edit',
  MANUAL_PAYMENT_OVERRIDE: 'manual_payment_override',
  CAPACITY_MANUAL_OVERRIDE: 'capacity_manual_override',
  MANUAL_REGISTRATION: 'manual_registration',
  VIEW_SENSITIVE_DATA: 'view_sensitive_data'
};

export const CURRENCY = 'BDT';

/**
 * Single source of truth for CellFin gateway status → our internal status.
 * Every interpretation of a CellFin status must go through this map — never
 * inline string comparisons. An unrecognized status MUST be treated as
 * 'Verification Failed' by callers (never guessed), since one we don't know
 * is a reason to stop and flag it.
 *
 * Note: 'DUPLICATE_TOKEN_REQUEEST' is spelled exactly as it appears in the
 * Islami Bank API document (including the double-E).
 */
export const CELLFIN_STATUS_MAP = {
  APPROVED: PAYMENT_STATUSES.PAID,
  FAILED: PAYMENT_STATUSES.FAILED,
  CANCELLED: PAYMENT_STATUSES.CANCELLED,
  UN_ATTEMPTED: PAYMENT_STATUSES.CANCELLED,
  QUEUED: PAYMENT_STATUSES.PENDING,
  OTP_SENT: PAYMENT_STATUSES.PENDING,
  DUPLICATE_TOKEN_REQUEEST: PAYMENT_STATUSES.FAILED,
  EXCEED_FUND_AVAILABLE: PAYMENT_STATUSES.FAILED,
  EXCEED_DAILY_LIMIT: PAYMENT_STATUSES.FAILED,
  EXCEED_MONTHLY_LIMIT: PAYMENT_STATUSES.FAILED,
  EXPIRED: PAYMENT_STATUSES.FAILED,
  REFUNDED: PAYMENT_STATUSES.CANCELLED,
  INVALID_TRANSACTION: PAYMENT_STATUSES.VERIFICATION_FAILED,
  UNABLE_TO_PROCESS: PAYMENT_STATUSES.VERIFICATION_FAILED,
  UNABLE_TO_REFUND: PAYMENT_STATUSES.VERIFICATION_FAILED,
  AUTHENTICATION_FAILED: PAYMENT_STATUSES.VERIFICATION_FAILED,
  NOT_FOUND: PAYMENT_STATUSES.VERIFICATION_FAILED
};

/** The one status that means "approved" as far as settlement is concerned. */
export const CELLFIN_APPROVED_STATUS = 'APPROVED';

export const MAX_ACCOMPANY = 20;

export const ALIGNMENT_MARKET = 'event';

export const DOCUMENT_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
};