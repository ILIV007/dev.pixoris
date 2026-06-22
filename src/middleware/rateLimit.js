// =========================================================
// Rate Limit Middleware — In-memory rate limiter (v3.1)
// =========================================================
// NOTE: Cloudflare Workers in-memory state is per-isolate.
// For true distributed rate limiting, use Cloudflare's
// Rate Limiting API or Durable Objects. This is a basic
// per-worker-instance limiter that helps mitigate brute force.
// =========================================================
import { errorResponse } from '../utils/response.js';

// Simple in-memory store: Map<key, { count, resetAt }>
const store = new Map();

// Clean up expired entries every 60 seconds
let lastCleanup = Date.now();
const cleanup = () => {
  const now = Date.now();
  if (now - lastCleanup < 60000) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
};

// rateLimit: returns middleware
// options: { windowMs: 60000, max: 10, keyFn: (req) => string }
export const rateLimit = (options = {}) => {
  const { windowMs = 60000, max = 10, keyFn = null } = options;

  return (handler) => async (request, env) => {
    const t = request._startTime || Date.now();
    cleanup();

    // Build key (IP-based by default)
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For') ||
               'unknown';
    const routeKey = keyFn ? keyFn(request) : new URL(request.url).pathname;
    const key = `${ip}:${routeKey}`;

    const now = Date.now();
    let entry = store.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return new Response(JSON.stringify({
        success: false,
        error: 'Too many requests',
        retry_after: retryAfter,
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-Response-Time': `${Date.now() - t}ms`,
        },
      });
    }

    return handler(request, env);
  };
};

// Pre-configured limiters
export const loginRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 10,                  // 10 attempts per 5 min per IP
  keyFn: (req) => 'login',
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 20,                 // 20 uploads per minute
  keyFn: (req) => 'upload',
});
