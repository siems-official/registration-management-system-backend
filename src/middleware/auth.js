import jwt from 'jsonwebtoken';
import { asyncHandler } from './asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';
import Admin from '../models/Admin.js';

export function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function signSessionToken(admin) {
  return jwt.sign(
    {
      sub: admin._id.toString(),
      type: 'session',
      role: admin.role
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function signPreauthToken(adminId) {
  return jwt.sign(
    { sub: adminId.toString(), type: 'preauth' },
    env.jwtSecret,
    { expiresIn: env.preauthJwtExpiresIn }
  );
}

export function verifyJwt(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
}

/**
 * Admin session guard for every protected route.
 * - Rejects a step-1 `preauth` token here — the ONLY place a preauth token is
 *   accepted is the /login/verify-2fa route.
 * - Requires a valid `session` token + an active admin in the database.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
  }

  const payload = verifyJwt(token);

  if (payload.type === 'preauth') {
    throw new HttpError(
      403,
      '2FA_REQUIRED',
      'TOTP verification required before this token can access protected routes.'
    );
  }
  if (payload.type !== 'session') {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid token type.');
  }

  const admin = await Admin.findById(payload.sub);
  if (!admin || !admin.isActive) {
    throw new HttpError(401, 'ADMIN_DISABLED', 'Admin account is not active.');
  }

  req.admin = {
    _id: admin._id,
    username: admin.username,
    role: admin.role
  };
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return next(new HttpError(403, 'FORBIDDEN', 'Insufficient role for this action.'));
    }
    return next();
  };