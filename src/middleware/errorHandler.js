import { HttpError } from '../utils/httpError.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req, res, next) {
  return next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found.`));
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, 'HttpError (5xx)');
    }
    const body = { success: false, error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  // SSLCommerz gateway failures — surface as 502, never a generic 500.
  if (err?.name === 'SslcommerzError') {
    logger.error({ err, path: req.originalUrl }, 'SSLCommerz gateway error');
    return res.status(502).json({
      success: false,
      error: { code: 'GATEWAY_ERROR', message: 'The payment gateway could not be reached.' }
    });
  }

  // Multer file-size limit failure surfaces as LIMIT_FILE_SIZE
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: { code: 'PHOTO_TOO_LARGE', message: 'Photo exceeds the maximum allowed size.' }
    });
  }

  // Body-parser JSON errors
  if (err?.type === 'entity.parse.failed' || err.name === 'SyntaxError') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Malformed JSON in request body.' }
    });
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }
  });
}