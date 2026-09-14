import mongoose from 'mongoose';
import { QUEUE_CHANNELS, QUEUE_STATUSES } from '../config/constants.js';

const EmailSmsQueueItemSchema = new mongoose.Schema({
  channel: { type: String, enum: Object.values(QUEUE_CHANNELS), required: true },
  to: { type: String, required: true },
  type: { type: String, required: true },
  payload: { type: Object, required: true },
  status: {
    type: String,
    enum: Object.values(QUEUE_STATUSES),
    default: QUEUE_STATUSES.PENDING
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String },
  nextAttemptAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

EmailSmsQueueItemSchema.index({ status: 1, nextAttemptAt: 1 });
EmailSmsQueueItemSchema.index({ channel: 1, status: 1 });

const EmailSmsQueueItem = mongoose.model('EmailSmsQueueItem', EmailSmsQueueItemSchema);

export default EmailSmsQueueItem;