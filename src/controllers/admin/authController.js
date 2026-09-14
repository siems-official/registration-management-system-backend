import { asyncHandler } from '../../middleware/asyncHandler.js';
import { success } from '../../utils/response.js';
import { HttpError } from '../../utils/httpError.js';
import { signPreauthToken, signSessionToken, verifyJwt, extractBearerToken } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { authenticator } from 'otplib';
import Admin from '../../models/Admin.js';

/**
 * Step 1 — username + password. Issues a SHORT-LIVED preauth token that only
 * `/login/verify-2fa` accepts. It can access no other route.
 */
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.validated.body;

  const admin = await Admin.findOne({ username });
  if (!admin) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  const passwordOk = await admin.verifyPassword(password);
  if (!passwordOk) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  if (!admin.isActive) {
    throw new HttpError(403, 'ADMIN_DISABLED', 'Admin account is not active.');
  }

  const preauthToken = signPreauthToken(admin._id);
  logger.info({ adminId: admin._id.toString(), username }, 'Admin step-1 login');
  return success(res, {
    preauthToken,
    tokenType: 'Bearer',
    expiresIn: env.preauthJwtExpiresIn,
    totpRequired: true
  });
});

/**
 * Step 2 — TOTP verification. Issues the full session JWT (default 8h).
 * Accepts the preauth token from the body or the Authorization header.
 */
export const verify2fa = asyncHandler(async (req, res) => {
  const { preauthToken: bodyToken, totp } = req.validated.body;
  const token = bodyToken || extractBearerToken(req);

  if (!token) {
    throw new HttpError(400, 'PREAUTH_REQUIRED', 'Step-1 login token is required.');
  }

  const payload = verifyJwt(token);
  if (payload.type !== 'preauth') {
    throw new HttpError(401, 'INVALID_TOKEN', 'Expected a step-1 preauth token.');
  }

  const admin = await Admin.findById(payload.sub);
  if (!admin || !admin.isActive) {
    throw new HttpError(401, 'ADMIN_DISABLED', 'Admin account is not active.');
  }

  const validCode = authenticator.verify({ token: totp, secret: admin.totpSecret });
  if (!validCode) {
    logger.warn({ adminId: admin._id.toString() }, 'Invalid TOTP attempt');
    throw new HttpError(401, 'INVALID_TOTP', 'Invalid or expired 2FA code.');
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const sessionToken = signSessionToken(admin);
  return success(res, {
    token: sessionToken,
    tokenType: 'Bearer',
    expiresIn: env.jwtExpiresIn,
    admin: { _id: admin._id, username: admin.username, role: admin.role }
  });
});

export const me = asyncHandler(async (req, res) => {
  return success(res, req.admin);
});