import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import { PAYMENT_STATUSES, PARTICIPANT_TYPES } from '../../config/constants.js';
import Registration from '../../models/Registration.js';
import Capacity from '../../models/Capacity.js';

export const dashboardStats = asyncHandler(async (_req, res) => {
  const [total, byParticipantType, byPaymentStatus, capacity] = await Promise.all([
    Registration.countDocuments(),
    Registration.aggregate([
      { $match: { participantType: { $in: Object.values(PARTICIPANT_TYPES) } } },
      { $group: { _id: '$participantType', count: { $sum: 1 } } }
    ]),
    Registration.aggregate([
      { $match: { paymentStatus: { $in: Object.values(PAYMENT_STATUSES) } } },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
    ]),
    Capacity.findById('event')
  ]);

  const participantTypeMap = Object.fromEntries(
    Object.values(PARTICIPANT_TYPES).map((t) => [t, 0])
  );
  for (const row of byParticipantType) participantTypeMap[row._id] = row.count;

  const paymentStatusMap = Object.fromEntries(
    Object.values(PAYMENT_STATUSES).map((s) => [s, 0])
  );
  for (const row of byPaymentStatus) paymentStatusMap[row._id] = row.count;

  return success(res, {
    total,
    byParticipantType: participantTypeMap,
    byPaymentStatus: paymentStatusMap,
    capacity: capacity
      ? { maxCapacity: capacity.maxCapacity, paidSlots: capacity.paidSlots, remaining: Math.max(0, capacity.maxCapacity - capacity.paidSlots) }
      : null
  });
});