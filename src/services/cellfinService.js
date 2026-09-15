import crypto from 'node:crypto';
import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { CURRENCY } from '../config/constants.js';
import { formatCellfinTime } from '../utils/date.js';

const UAT_BASE = 'https://staging.islamibankbd.com:8259';
const LIVE_BASE = 'https://cellfinpay.islamibankbd.com';

const client = axios.create({ timeout: 15000 });

export class CellfinError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'CellfinError';
    this.cause = cause;
  }
}

export function isMockMode() {
  return env.cellfin.mock === true;
}

function baseUrl() {
  if (env.cellfin.overrideBaseUrl) return env.cellfin.overrideBaseUrl;
  return env.cellfin.isLive ? LIVE_BASE : UAT_BASE;
}

function assertConfigured(callName) {
  if (isMockMode()) return;
  if (!env.cellfin.merchantId || !env.cellfin.password || !env.cellfin.merchantName) {
    throw new CellfinError(
      `CellFin is not configured (merchant id/password/name missing) — cannot ${callName}.`
    );
  }
}

/**
 * SHA-512 hash of (password + correlationId), hex-encoded, per the Islami Bank
 * spec. ⚠️ The exact concatenation order is documented as `password + correlationId`
 * but could not be verified from the spec's own samples (they are internally
 * inconsistent). It MUST be validated against the UAT endpoint — a wrong concat
 * surfaces as a clean `AUTHENTICATION_FAILED` status. The derived hash is a
 * credential derivative — never log it.
 */
function sha512Password(password, correlationId) {
  return crypto.createHash('sha512').update(password + correlationId).digest('hex');
}

/**
 * Create a CellFin payment token (Step 1).
 * Body shape follows the Islami Bank spec: nested `order`, `id`/`password`
 * top-level, `operation: PG_TOKEN`. The four callback URLs are configured
 * bank-side at onboarding and are NOT sent in this request.
 */
export async function createToken({ correlationId, amount, merchantName, userMobile }) {
  assertConfigured('createToken');

  if (isMockMode()) {
    logger.warn('CELLFIN_MOCK=true — returning canned token for %s', correlationId);
    return {
      token: `mock-token-${correlationId}`,
      redirectUrl: `https://mock.local/cfpg/v1/pay?token=mock-token-${correlationId}`,
      correlationId
    };
  }

  const password = sha512Password(env.cellfin.password, correlationId);
  const name = merchantName || env.cellfin.merchantName;

  const body = {
    id: env.cellfin.merchantId,
    password,
    operation: 'PG_TOKEN',
    correlationId,
    order: {
      amount,
      currency: CURRENCY,
      creationTime: formatCellfinTime(),
      invoiceNumber: correlationId,
      merchant: name
    }
  };
  if (userMobile) {
    body.userMobile = userMobile;
  }

  let data;
  try {
    const response = await client.post(`${baseUrl()}/cfpg/v1/token`, body);
    data = response.data;
  } catch (err) {
    // Network/timeout failure — distinct error so the caller can keep a Pending
    // registration recoverable via resume-payment.
    throw new CellfinError(`CellFin token request failed: ${err.message}`, err);
  }

  if (data?.status !== 'SUCCESS') {
    throw new CellfinError(
      `CellFin token creation rejected: ${JSON.stringify(data)}`
    );
  }

  return {
    token: data.token,
    redirectUrl: data.redirectUrl,
    correlationId: data.correlationId || correlationId
  };
}

/**
 * Authoritative transaction status query (Step 3). This — never a raw IPN POST
 * body — is the source of truth for reconciliation.
 */
export async function queryStatus({ correlationId, token }) {
  assertConfigured('queryStatus');

  if (isMockMode()) {
    logger.warn('CELLFIN_MOCK=true — mock status query for %s', correlationId);
    return {
      correlationId,
      token,
      trId: `mock-tr-${correlationId}`,
      status: 'APPROVED',
      tr_amount: undefined,
      mock: true
    };
  }

  const password = sha512Password(env.cellfin.password, correlationId);
  const body = {
    id: env.cellfin.merchantId,
    password,
    operation: 'STATUS',
    correlationId,
    token
  };

  try {
    const response = await client.post(`${baseUrl()}/cfpg/v1/status`, body);
    return response.data;
  } catch (err) {
    throw new CellfinError(`CellFin status query failed: ${err.message}`, err);
  }
}

export const cellfinBaseUrl = baseUrl;