export function success(res, data = null, meta = {}) {
  return res.status(meta.statusCode || 200).json({ success: true, data, ...meta });
}

export function fail(res, statusCode, code, message, details) {
  const body = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(statusCode).json(body);
}

export function paginate(data, { page = 1, limit = 20, total = 0 }) {
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}