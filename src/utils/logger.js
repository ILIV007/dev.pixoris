// =========================================================
// Logger — Structured logging for Cloudflare Workers (v3.1)
// =========================================================
// Cloudflare Workers don't have access to a filesystem; logs go
// to `console.log/error` which appear in wrangler tail and the
// Cloudflare dashboard. This module provides structured logging
// for easier debugging.
// =========================================================

const LOG_LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

const currentLevel = LOG_LEVELS[(
  (typeof PIXORIS_LOG_LEVEL !== 'undefined' && PIXORIS_LOG_LEVEL) ||
  'INFO'
).toUpperCase()] || LOG_LEVELS.INFO;

const formatLog = (level, message, context = {}) => {
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  });
};

export const logger = {
  debug: (msg, ctx = {}) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) console.log(formatLog('DEBUG', msg, ctx));
  },
  info: (msg, ctx = {}) => {
    if (currentLevel <= LOG_LEVELS.INFO) console.log(formatLog('INFO', msg, ctx));
  },
  warn: (msg, ctx = {}) => {
    if (currentLevel <= LOG_LEVELS.WARN) console.warn(formatLog('WARN', msg, ctx));
  },
  error: (msg, ctx = {}) => {
    if (currentLevel <= LOG_LEVELS.ERROR) console.error(formatLog('ERROR', msg, ctx));
  },
};

// Convenience: log an error and return a JSON Response in one call
export const logAndReturn = (errorMsg, status, context = {}, startTime = null) => {
  logger.error(errorMsg, { status, ...context });
  return errorResponse(errorMsg, status, startTime);
};
