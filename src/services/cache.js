// =========================================================
// Cache Service — Cloudflare Cache API Layer (v4.1)
// =========================================================
// Uses Cloudflare's built-in Cache API (caches.default) for
// edge-level caching of public GET endpoints.
//
// Usage:
//   import { cacheGet, cachePut, withCache } from './cache.js';
//   const cached = await cacheGet(request);
//   if (cached) return cached;
//   const response = await handler();
//   return cachePut(request, response, 300); // 5-min TTL
// =========================================================

// Get cached response for a request
export const cacheGet = async (request) => {
  try {
    const cache = caches.default;
    return await cache.match(request);
  } catch {
    return null;
  }
};

// Store a response in cache with TTL
// NOTE: Cloudflare Cache API doesn't support per-entry TTL directly.
// TTL is controlled via the response's Cache-Control header.
export const cachePut = async (request, response, ttlSeconds = 300) => {
  try {
    // Only cache GET requests
    if (request.method !== 'GET') return response;

    // Clone the response and add cache headers
    const cachedResponse = new Response(response.body, response);
    cachedResponse.headers.set('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
    cachedResponse.headers.set('X-Cache-Status', 'MISS');

    const cache = caches.default;
    // Use a cache key based on the URL (ignore query params for some endpoints)
    const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

    // Store in cache (runs in background)
    cache.put(cacheKey, cachedResponse.clone()).catch(() => {});

    // Return the original response with X-Cache-Status header
    const outputResponse = new Response(response.body, response);
    outputResponse.headers.set('X-Cache-Status', 'MISS');
    return outputResponse;
  } catch {
    return response;
  }
};

// Wrap a handler with cache logic
// ttlSeconds: cache duration in seconds
export const withCache = (ttlSeconds = 300) => (handler) => async (request, env) => {
  // Only cache GET requests
  if (request.method !== 'GET') {
    return handler(request, env);
  }

  // Check cache first
  const cached = await cacheGet(request);
  if (cached) {
    const outputResponse = new Response(cached.body, cached);
    outputResponse.headers.set('X-Cache-Status', 'HIT');
    outputResponse.headers.set('X-Cache-TTL', ttlSeconds.toString());
    return outputResponse;
  }

  // Call the actual handler
  const response = await handler(request, env);

  // Only cache successful responses
  if (response.status === 200) {
    return cachePut(request, response, ttlSeconds);
  }

  return response;
};

// Clear cache for a specific URL pattern (best-effort)
// Cloudflare Cache API doesn't support pattern-based purge.
// Use this to purge specific URLs.
export const cachePurge = async (url) => {
  try {
    const cache = caches.default;
    await cache.delete(new Request(url));
    return true;
  } catch {
    return false;
  }
};
