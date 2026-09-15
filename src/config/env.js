import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const isTest = process.env.NODE_ENV === 'test';

const REQUIRED_VARS = ['JWT_SECRET'];
if (!isTest) {
  REQUIRED_VARS.push(
    'MONGO_URI',
    'CELLFIN_MERCHANT_ID',
    'CELLFIN_PASSWORD',
    'CELLFIN_MERCHANT_NAME',
    'CELLFIN_SUCCESS_URL',
    'CELLFIN_FAIL_URL',
    'CELLFIN_CANCEL_URL',
    'CELLFIN_IPN_URL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS'
  );
}

function assertRequired() {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values before starting the server.'
    );
  }
}

assertRequired();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseIntSafe(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const env = {
  isTest,
  isProduction: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',
  isLive: process.env.NODE_ENV === 'live',

  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseIntSafe(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  preauthJwtExpiresIn: process.env.PREAUTH_JWT_EXPIRES_IN || '5m',
  bcryptRounds: parseIntSafe(process.env.BCRYPT_ROUNDS, 12),
  admin2faIssuer: process.env.ADMIN_2FA_ISSUER || 'AlumniEventPlatform',

  cellfin: {
    merchantId: process.env.CELLFIN_MERCHANT_ID,
    password: process.env.CELLFIN_PASSWORD,
    merchantName: process.env.CELLFIN_MERCHANT_NAME,
    isLive: bool(process.env.CELLFIN_IS_LIVE),
    mock: bool(process.env.CELLFIN_MOCK),
    overrideBaseUrl: process.env.CELLFIN_ALLOW_OVERRIDE_URL,
    successUrl: process.env.CELLFIN_SUCCESS_URL,
    failUrl: process.env.CELLFIN_FAIL_URL,
    cancelUrl: process.env.CELLFIN_CANCEL_URL,
    ipnUrl: process.env.CELLFIN_IPN_URL
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseIntSafe(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'Event Registration <no-reply@example.com>'
  },

  sms: {
    apiKey: process.env.SMS_PROVIDER_API_KEY,
    senderId: process.env.SMS_PROVIDER_SENDER_ID
  },

  upload: {
    dir: path.resolve(projectRoot, process.env.UPLOAD_DIR || './uploads'),
    maxSizeMb: parseIntSafe(process.env.MAX_UPLOAD_SIZE_MB, 2)
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimit: {
    windowMs: parseIntSafe(process.env.RATE_LIMIT_WINDOW_MS, 900000),
    strictMax: parseIntSafe(process.env.RATE_LIMIT_STRICT_MAX, 5)
  },

  queue: {
    pollIntervalMs: parseIntSafe(process.env.QUEUE_POLL_INTERVAL_MS, 5000),
    maxAttempts: parseIntSafe(process.env.QUEUE_MAX_ATTEMPTS, 5)
  },

  logLevel: process.env.LOG_LEVEL || 'info'
};

export const projectRootPath = projectRoot;