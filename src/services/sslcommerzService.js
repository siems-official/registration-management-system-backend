import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { CURRENCY } from '../config/constants.js';

const SANDBOX = {
  sessionInit: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
  validator: 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
  refund: 'https://sandbox.sslcommerz.com/validator/api/merchantRefundAPI.php'
};

const LIVE = {
  sessionInit: 'https://secure.sslcommerz.com/gwprocess/v4/api.php',
  validator: 'https://secure.sslcommerz.com/validator/api/validationserverAPI.php',
  refund: 'https://secure.sslcommerz.com/validator/api/merchantRefundAPI.php'
};

const ENDPOINTS = env.sslcommerz.isLive ? LIVE : SANDBOX;

const client = axios.create({ timeout: 20000 });

export class SslcommerzError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SslcommerzError';
    this.cause = cause;
  }
}

export function isMockMode() {
  return env.sslcommerz.mock === true;
}

/**
 * Initiate a payment session. Callers must pass the server-calculated amount
 * (never a client-supplied one).
 */
export async function initiateSession({
  tranId,
  amount,
  participant,
  gatewayUrls
}) {
  assertConfigured('initiateSession');

  if (isMockMode()) {
    logger.warn('SSLCOMMERZ_MOCK=true — returning canned session for %s', tranId);
    return {
      sessionId: `mock_${tranId}`,
      gatewayPageUrl: `https://sandbox.sslcommerz.com/pay?mock=1&tran_id=${encodeURIComponent(tranId)}`
    };
  }

  const params = new URLSearchParams({
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    total_amount: String(amount),
    currency: CURRENCY,
    tran_id: tranId,
    success_url: gatewayUrls.successUrl,
    fail_url: gatewayUrls.failUrl,
    cancel_url: gatewayUrls.cancelUrl,
    ipn_url: gatewayUrls.ipnUrl,
    cus_name: participant.name,
    cus_email: participant.email,
    cus_phone: participant.whatsappNo,
    cus_add1: participant.presentAddress,
    cus_country: 'Bangladesh'
  });

  try {
    const { data } = await client.post(ENDPOINTS.sessionInit, params);
    if (data?.status !== 'SUCCESS') {
      throw new SslcommerzError(
        `SSLCommerz session-init failed: ${data?.failedreason || data?.status || 'unknown'}`
      );
    }
    return {
      sessionId: data?.sessionkey,
      gatewayPageUrl: data?.GatewayPageURL
    };
  } catch (err) {
    if (err instanceof SslcommerzError) throw err;
    throw new SslcommerzError(`SSLCommerz session-init network failure: ${err.message}`, err);
  }
}

/**
 * Transaction validation — the authoritative passthrough for IPN
 * reconciliation. Never trust the raw IPN POST body alone.
 */
export async function validateTransaction(valId, tranId) {
  assertConfigured('validateTransaction');

  if (isMockMode()) {
    logger.warn('SSLCOMMERZ_MOCK=true — mock-validating %s', valId);
    return { status: 'VALID', val_id: valId, tran_id: tranId, currency: CURRENCY, amount: undefined, mock: true };
  }

  const params = new URLSearchParams({
    val_id: valId,
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    format: 'json'
  });

  try {
    const { data } = await client.post(ENDPOINTS.validator, params);
    return data;
  } catch (err) {
    throw new SslcommerzError(`SSLCommerz validation network failure: ${err.message}`, err);
  }
}

/**
 * Refund path used by the manual payment override. Returns the raw result.
 */
export async function refundTransaction({ tranId, amount, refundRef, reason = '' }) {
  assertConfigured('refundTransaction');

  if (isMockMode()) {
    logger.warn('SSLCOMMERZ_MOCK=true — mock-refunding %s', tranId);
    return { status: 'success', ref: `mock_refund_${tranId}` };
  }

  const params = new URLSearchParams({
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    refund_tran_id: tranId,
    refund_currency: CURRENCY,
    refund_amount: String(amount),
    refund_ref: refundRef,
    refund_reason: reason,
    format: 'json'
  });

  try {
    const { data } = await client.post(ENDPOINTS.refund, params);
    return data;
  } catch (err) {
    throw new SslcommerzError(`SSLCommerz refund network failure: ${err.message}`, err);
  }
}

function assertConfigured(callName) {
  if (isMockMode()) return;
  if (!env.sslcommerz.storeId || !env.sslcommerz.storePassword) {
    throw new SslcommerzError(
      `SSLCommerz is not configured (store id/password missing) — cannot ${callName}.`
    );
  }
}

export const sslcommerzEndpoints = ENDPOINTS;