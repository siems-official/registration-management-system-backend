import AdminActionLog from '../models/AdminActionLog.js';

/**
 * Mandatory audit logging (Section 9). Every fee change, capacity change,
 * deadline change, member edit, resume-payment, manual override, and
 * sensitive-data view produces an entry with the acting admin's ID.
 */
export async function logAdminAction({
  adminId,
  action,
  targetType,
  targetId,
  before,
  after,
  ipAddress
}) {
  return AdminActionLog.create({
    adminId,
    action,
    targetType,
    targetId,
    before,
    after,
    ipAddress
  });
}