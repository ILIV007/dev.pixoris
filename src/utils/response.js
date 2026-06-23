// =========================================================
// Response Utilities — Unified API Response Format (v3.1)
// =========================================================
// All API responses should go through these helpers to ensure
// consistent shape, headers, and timing.
//
// Standard response format:
//   { success: boolean, data?: any, error?: string, ms?: number }
// =========================================================

// ============ TIMING ============
// Stamp the start time on the request object
export const stampStartTime = (request) => {
  if (!request._startTime) request._startTime = Date.now();
  return request._startTime;
};

// ============ CORE RESPONSE BUILDER ============
export const jsonResponse = (data, status = 200, extraHeaders = {}, startTime = null) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    'X-Powered-By': 'Pixoris/3.1',
    ...extraHeaders,
  };
  if (startTime) {
    const elapsed = Date.now() - startTime;
    headers['X-Response-Time'] = `${elapsed}ms`;
    headers['Server-Timing'] = `total;dur=${elapsed}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
};

// ============ SUCCESS ============
// data: any (will be wrapped in { success: true, data })
// options: { cacheTtl?: number, startTime?: number, extra?: object }
export const successResponse = (data = {}, options = {}) => {
  const { cacheTtl = null, startTime = null, extra = {} } = options;
  const headers = {};
  if (cacheTtl && cacheTtl > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheTtl}, s-maxage=${cacheTtl * 2}`;
    headers['Vary'] = 'Accept-Encoding';
  }
  return jsonResponse({
    success: true,
    data,
    ...extra,
  }, 200, headers, startTime);
};

// ============ ERROR ============
// error: string or { code, message }
export const errorResponse = (error, status = 400, startTime = null) => {
  const errorObj = typeof error === 'string'
    ? { message: error }
    : error;
  return jsonResponse({
    success: false,
    error: errorObj.message || errorObj.code || 'Unknown error',
    code: errorObj.code || null,
  }, status, {}, startTime);
};

// ============ NOT FOUND ============
export const notFoundResponse = (path = null, startTime = null) => {
  return jsonResponse({
    success: false,
    error: 'Not Found',
    path,
  }, 404, {}, startTime);
};

// ============ VALIDATION ERROR ============
export const validationError = (fields, startTime = null) => {
  return jsonResponse({
    success: false,
    error: 'Validation failed',
    fields,
  }, 422, {}, startTime);
};

// ============ CORS PREFLIGHT ============
export const corsResponse = () => new Response(null, {
  status: 204,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  },
});
