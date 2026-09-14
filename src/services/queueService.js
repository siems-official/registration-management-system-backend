import EmailSmsQueueItem from '../models/EmailSmsQueueItem.js';
import { QUEUE_CHANNELS, QUEUE_TYPES } from '../config/constants.js';

/**
 * Enqueue work instead of sending inline — the IPN handler must return
 * quickly regardless of SMTP/SMS latency (Section 8).
 */
export async function enqueueTicketConfirmation({ toEmail, toSms, registration, token }) {
  const items = [];

  if (toEmail) {
    items.push({
      channel: QUEUE_CHANNELS.EMAIL,
      to: toEmail,
      type: QUEUE_TYPES.TICKET_CONFIRMATION,
      payload: { registrationId: registration._id, ticketDisplayId: registration.ticketDisplayId, token }
    });
  }
  if (toSms) {
    items.push({
      channel: QUEUE_CHANNELS.SMS,
      to: toSms,
      type: QUEUE_TYPES.TICKET_CONFIRMATION,
      payload: { registrationId: registration._id, ticketDisplayId: registration.ticketDisplayId, token }
    });
  }

  return items.length ? EmailSmsQueueItem.insertMany(items, { ordered: true }) : [];
}

export async function findQueuedToken(token) {
  return EmailSmsQueueItem.findOne({ 'payload.token': token });
}