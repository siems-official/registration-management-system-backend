import { asyncHandler } from './asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Validate request input against a Joi schema. `source` selects req.body,
 * req.query, or req.params. Unknown fields are rejected inside the schema.
 */
export const validate = (schema, source = 'body') =>
  asyncHandler(async (req, _res, next) => {
    const value = source === 'body' ? req.body : source === 'params' ? req.params : req.query;
    const { error, value: validValue } = schema.validate(value, {
      abortEarly: false,
      stripUnknown: false,
      convert: true
    });
    if (error) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Request validation failed.',
        error.details.map((d) => ({ path: d.path.join('.'), message: d.message }))
      );
    }
    req.validated = req.validated || {};
    req.validated[source] = validValue;
    next();
  });