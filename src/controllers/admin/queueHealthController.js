import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import EmailSmsQueueItem from '../../models/EmailSmsQueueItem.js';
import { QUEUE_STATUSES } from '../../config/constants.js';

export const queueHealth = asyncHandler(async (_req, res) => {
  const [pending, sent, failed, recentFailed] = await Promise.all([
    EmailSmsQueueItem.countDocuments({ status: QUEUE_STATUSES.PENDING }),
    EmailSmsQueueItem.countDocuments({ status: QUEUE_STATUSES.SENT }),
    EmailSmsQueueItem.countDocuments({ status: QUEUE_STATUSES.FAILED }),
    EmailSmsQueueItem.find({ status: QUEUE_STATUSES.FAILED })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
  ]);

  return success(res, {
    counts: { pending, sent, failed },
    recentFailed
  });
});