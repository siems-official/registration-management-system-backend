import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * SMS delivery adapter. Placeholder: the provider API key is not wired up yet
 * (Section 2 of the spec). The queue/worker is channel-agnostic so switching to
 * a real provider is a config change here, not a redesign.
 */
export async function sendTicketConfirmationSms({ to, registration: _registration }) {
  if (!env.sms.apiKey) {
    throw new Error(
      'SMS_PROVIDER_API_KEY is not configured — SMS delivery is not available yet.'
    );
  }
  logger.info({ to }, 'SMS ticket delivery (provider plug-in pending)');
  // TODO: replace with the real provider call when credentials are provisioned.
  return true;
}