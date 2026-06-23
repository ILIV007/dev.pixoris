// =========================================================
// Auth Middleware — JWT + Role-Based Access Control (v3.1)
// =========================================================
import { errorResponse } from '../utils/response.js';

// Role hierarchy: higher number = more permissions
export const ROLE_LEVEL = {
  author: 1,
  editor: 2,
  admin: 3,
  super_admin: 4,
};

// JWT verification using Web Crypto API
const encoder = new TextEncoder();

const base64UrlDecode = (base64Url) => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return buffer.buffer;
};

export const verifyJWT = async (token, secret) => {
  if (!token || !secret) return null;
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC', key,
      base64UrlDecode(signature),
      encoder.encode(`${header}.${body}`)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch { return null; }
};

export const signJWT = async (payload, secret) => {
  const base64UrlEncode = (buffer) => {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,  // 24h
  })));

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(signature)}`;
};

// Extract auth payload from request
export const getAuth = async (request, secret) => {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), secret);
};

// Require a minimum role
export const requireRole = (minRole) => (handler) => async (request, env) => {
  const t = request._startTime || Date.now();
  const auth = await getAuth(request, env.JWT_SECRET);
  if (!auth) return errorResponse('Unauthorized - token missing or invalid', 401, t);
  if (ROLE_LEVEL[auth.role] < ROLE_LEVEL[minRole]) {
    return errorResponse(`Forbidden - requires ${minRole} role`, 403, t);
  }
  request.admin = auth;
  return handler(request, env);
};

// Backwards-compatible adminAuth (any authenticated admin)
export const adminAuth = (handler) => async (request, env) => {
  const t = request._startTime || Date.now();
  const auth = await getAuth(request, env.JWT_SECRET);
  if (!auth) return errorResponse('Unauthorized', 401, t);
  if (ROLE_LEVEL[auth.role] < ROLE_LEVEL['author']) {
    return errorResponse('Forbidden', 403, t);
  }
  request.admin = auth;
  return handler(request, env);
};
