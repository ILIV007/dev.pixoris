// =========================================================
// Storage Service — Abstraction Layer (v3.1)
// =========================================================
// Provides a unified upload interface that abstracts the storage
// backend (GitHub now, R2 in the future).
//
// Features:
//   • Automatic retry on transient failures
//   • Fallback mode when storage is unavailable
//   • Size + type validation
//   • Path normalization (folders by date)
//   • Returns public URL on success
// =========================================================
import { uploadFile as ghUpload, deleteFile as ghDelete, checkRepo, checkBranch, listFolder } from './github.js';

const MAX_FILE_SIZE = 8 * 1024 * 1024;  // 8MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/avif', 'image/bmp',
  'application/pdf',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg',
];

// ============ VALIDATION ============
export const validateFile = (file) => {
  if (!file) return { ok: false, error: 'No file provided' };

  // Size check
  if (file.size && file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  // Type check (if mime type is provided)
  if (file.type && file.mimeType && !ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    return { ok: false, error: `File type "${file.mimeType}" not allowed` };
  }

  return { ok: true };
};

// ============ PATH NORMALIZATION ============
// Generate a clean, unique path under assets/uploads/<folder>/<filename>
// Folder structure: assets/uploads/{posts|categories|users|products|debug|temp}/<filename>
export const buildPath = (folder, filename) => {
  const validFolders = ['posts', 'categories', 'users', 'products', 'debug', 'temp'];
  const requestedFolder = (folder || 'posts').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const safeFolder = validFolders.includes(requestedFolder) ? requestedFolder : 'posts';
  const safeName = String(filename).replace(/\s+/g, '-').replace(/[^\w.\-]/g, '');
  const timestamp = Date.now();
  return `assets/uploads/${safeFolder}/${timestamp}-${safeName}`;
};

// ============ CONVERT ARRAYBUFFER → BASE64 ============
const toBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

// ============ MAIN UPLOAD FUNCTION ============
// env: Cloudflare env
// file: { name, type, arrayBuffer() } — a File/Blob object
// options: { folder, altText, uploadedBy }
export const upload = async (env, file, options = {}) => {
  // 1. Validate env config
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return {
      ok: false,
      storage: 'fallback',
      error: 'GitHub storage not configured (set GITHUB_TOKEN and GITHUB_REPO)',
    };
  }

  // 2. Validate file
  const validation = validateFile(file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // 3. Read file content as base64
  let bytes;
  try {
    const buf = await file.arrayBuffer();
    bytes = new Uint8Array(buf);
  } catch (err) {
    return { ok: false, error: 'Failed to read file: ' + err.message };
  }

  if (bytes.byteLength > MAX_FILE_SIZE) {
    return { ok: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  const base64Content = toBase64(bytes);

  // 4. Build path
  const path = buildPath(options.folder || 'posts', file.name);

  // 5. Upload via GitHub service
  const result = await ghUpload(env, path, base64Content, options.message);

  if (!result.ok) {
    // Return fallback mode response — caller can decide whether to retry later
    return {
      ok: false,
      storage: 'fallback',
      error: result.error?.message || 'Upload failed',
      code: result.error?.code,
      retry_recommended: ['NETWORK_ERROR', 'RATE_LIMITED'].includes(result.error?.code),
    };
  }

  return {
    ok: true,
    storage: 'github',
    url: result.url,
    path: result.path,
    sha: result.sha,
    size: bytes.byteLength,
    updated: result.updated,
  };
};

// ============ DELETE ============
export const remove = async (env, urlOrPath) => {
  // Convert URL to path if needed
  let path = urlOrPath;
  if (typeof urlOrPath === 'string' && urlOrPath.startsWith('http')) {
    try {
      const u = new URL(urlOrPath);
      const match = u.pathname.match(/\/(?:blob|raw)\/[^/]+\/(.+)$/);
      if (match) path = match[1];
      else path = u.pathname.replace(/^\//, '');
    } catch {
      return { ok: false, error: 'Invalid URL' };
    }
  }

  return ghDelete(env, path);
};

// ============ HEALTH CHECK ============
export const healthCheck = async (env) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return {
      status: 'fail',
      backend: 'github',
      error: 'GITHUB_TOKEN or GITHUB_REPO not configured',
    };
  }

  const [repoCheck, folderCheck] = await Promise.all([
    checkRepo(env),
    listFolder(env, 'assets/uploads'),
  ]);

  return {
    status: repoCheck.ok ? 'ok' : 'fail',
    backend: 'github',
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH || 'main',
    repo_exists: repoCheck.exists,
    uploads_folder_exists: folderCheck.exists,
    uploads_file_count: folderCheck.items?.length || 0,
    can_write: repoCheck.data?.permissions?.push === true || repoCheck.data?.permissions?.admin === true,
    error: repoCheck.error?.message,
  };
};

// ============ FALLBACK MODE ============
// When GitHub is unavailable, return a placeholder URL so the
// admin UI can still display something. Real upload happens later
// when a cron job retries pending uploads (future feature).
export const fallbackPlaceholder = (filename) => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#0d1222"/>
      <text x="200" y="140" fill="#9aa5c7" font-family="Tahoma" font-size="14" text-anchor="middle">⚠️ Storage fallback</text>
      <text x="200" y="170" fill="#ff4e9c" font-family="Tahoma" font-size="12" text-anchor="middle">${filename}</text>
    </svg>
  `)}`;
};
