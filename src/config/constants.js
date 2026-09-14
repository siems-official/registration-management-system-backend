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

export const MAX_ACCOMPANY = 20;

export const ALIGNMENT_MARKET = 'event';

export const DOCUMENT_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
};