import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const config = {
  windowMs: env.rateLimit.windowMs,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }
  }
};

// In test mode rate limiters are skipped unless a test explicitly opts in
// (see the verify-2fa throttling test).
function skipInTest(_req) {
  return env.isTest && process.env.ENABLE_RATELIMIT_IN_TEST !== 'true';
}

/** Global limiter applied to every route. */
export const globalLimiter = rateLimit({
  ...config,
  limit: 500,
  skip: skipInTest
});

/** Strict limiter (spec: 5 requests / 15 min) on login, registrations, initiate. */
export const strictLimiter = rateLimit({
  ...config,
  limit: env.rateLimit.strictMax,
  skip: skipInTest
});

/**
 * Dedicated strict limiter for /api/admin/login/verify-2fa (Part-1 fix #1):
 * a 6-digit TOTP is brute-forceable once step 1 passes, so this route gets its
 * own budget rather than sharing the login limiter.
 */
export const verify2faLimiter = rateLimit({
  ...config,
  limit: env.rateLimit.strictMax,
  skip: skipInTest
});