import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import AdminActionLog from '../../models/AdminActionLog.js';

export const listAuditLog = asyncHandler(async (req, res) => {
  const { page, limit, adminId, action, from, to } = req.validated.query;

  const filter = {};
  if (adminId) filter.adminId = adminId;
  if (action) filter.action = action;
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }

  const [docs, total] = await Promise.all([
    AdminActionLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('adminId', 'username')
      .lean(),
    AdminActionLog.countDocuments(filter)
  ]);

  return success(res, docs, {
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});