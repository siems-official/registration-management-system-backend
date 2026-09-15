import path from 'node:path';
import os from 'node:os';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/unused-in-tests';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN = '8h';
process.env.PREAUTH_JWT_EXPIRES_IN = '5m';
process.env.ADMIN_2FA_ISSUER = 'TestEventPlatform';

process.env.CELLFIN_MERCHANT_ID = 'testmerchant.28230601';
process.env.CELLFIN_PASSWORD = 'testpass';
process.env.CELLFIN_MERCHANT_NAME = 'testmerchant.com';
process.env.CELLFIN_IS_LIVE = 'false';
process.env.CELLFIN_SUCCESS_URL = 'http://localhost/CellFinSuccess';
process.env.CELLFIN_FAIL_URL = 'http://localhost/CellFinFail';
process.env.CELLFIN_CANCEL_URL = 'http://localhost/CellFinCancel';
process.env.CELLFIN_IPN_URL = 'http://localhost/api/payment/CellFinIPN';
process.env.CELLFIN_MOCK = 'false';

process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '2500';
process.env.SMTP_USER = 'smtpuser';
process.env.SMTP_PASS = 'smtppass';
process.env.SMTP_FROM = 'Test <no-reply@test.local>';

process.env.SMS_PROVIDER_API_KEY = '';
process.env.SMS_PROVIDER_SENDER_ID = '';

process.env.UPLOAD_DIR = path.join(
  os.tmpdir(),
  'rms-uploads-test'
);
process.env.MAX_UPLOAD_SIZE_MB = '2';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_STRICT_MAX = '5';

process.env.QUEUE_POLL_INTERVAL_MS = '5000';
process.env.QUEUE_MAX_ATTEMPTS = '5';

process.env.LOG_LEVEL = 'silent';
process.env.BCRYPT_ROUNDS = '4';