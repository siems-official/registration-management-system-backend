import EmailSmsQueueItem from '../models/EmailSmsQueueItem.js';
import Registration from '../models/Registration.js';
import { sendTicketConfirmationEmail } from '../services/emailService.js';
import { sendTicketConfirmationSms } from '../services/smsService.js';
import { QUEUE_CHANNELS, QUEUE_STATUSES } from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * MongoDB-backed delivery worker (Section 8 — no Redis).
 * Polls for pending items, attempts delivery, applies exponential backoff,
 * and gives up after QUEUE_MAX_ATTEMPTS. Delivery status never touches a
 * registration's paymentStatus.
 */

function backoffDelayMs(attempts) {
  const base = 1000 * 2 ** Math.min(attempts, 5);
  return Math.min(base, 5 * 60 * 1000);
}

async function deliver(item) {
  const { payload } = item;

  if (item.channel === QUEUE_CHANNELS.EMAIL) {
    const reg = payload.registrationId
      ? await Registration.findById(payload.registrationId).lean()
      : null;
    if (!reg) {
      throw new Error(`Registration ${payload.registrationId} not found for ticket email.`);
    }
    await sendTicketConfirmationEmail({ to: item.to, registration: reg });
    return;
  }

  if (item.channel === QUEUE_CHANNELS.SMS) {
    await sendTicketConfirmationSms({
      to: item.to,
      registration: { ticketDisplayId: payload.ticketDisplayId, name: undefined }
    });
    return;
  }

  throw new Error(`Unknown channel: ${item.channel}`);
}

let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const items = await EmailSmsQueueItem.find({
      status: QUEUE_STATUSES.PENDING,
      nextAttemptAt: { $lte: new Date() }
    })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    for (const item of items) {
      try {
        await deliver(item);
        await EmailSmsQueueItem.updateOne({ _id: item._id }, { $set: { status: QUEUE_STATUSES.SENT }, $inc: { attempts: 1 } });
        logger.info({ itemId: item._id, channel: item.channel }, 'Queue item delivered');
      } catch (err) {
        const attempts = (item.attempts || 0) + 1;
        const giveUp = attempts >= env.queue.maxAttempts;
        const update = {
          lastError: err.message,
          $inc: { attempts: 1 },
          $set: { status: giveUp ? QUEUE_STATUSES.FAILED : QUEUE_STATUSES.PENDING }
        };
        if (!giveUp) update.$set.nextAttemptAt = new Date(Date.now() + backoffDelayMs(attempts));
        await EmailSmsQueueItem.updateOne({ _id: item._id }, update);
        logger.warn(
          { itemId: item._id, attempts, giveUp, error: err.message },
          'Queue item delivery failed'
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Queue poll error');
  } finally {
    running = false;
  }
}

export function startQueueWorker() {
  if (env.isTest) return setInterval(() => {}, 1000 * 60 * 60);
  const id = setInterval(pollOnce, env.queue.pollIntervalMs);
  pollOnce();
  logger.info({ intervalMs: env.queue.pollIntervalMs }, 'Queue worker started');
  return id;
}

export { pollOnce };