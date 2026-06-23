// =========================================================
// GitHub Service — Unified API Layer (v3.1)
// =========================================================
// CRITICAL FIX: All GitHub API calls MUST include:
//   • User-Agent header (REQUIRED by GitHub)
//   • X-GitHub-Api-Version: 2022-11-28
//   • Accept: application/vnd.github+json
//   • Authorization: Bearer <token>
//
// Without User-Agent, GitHub returns 403 Forbidden.
// See: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required
// =========================================================

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'PixorisCMS/3.1';
const API_VERSION = '2022-11-28';

// ============ ERROR NORMALIZATION ============
export const normalizeGithubError = (status, body) => {
  if (status === 401) return { code: 'AUTH_FAILED', message: 'Invalid or expired GitHub token' };
  if (status === 403) {
    if (String(body).includes('User-Agent')) {
      return { code: 'MISSING_USER_AGENT', message: 'GitHub requires User-Agent header (this should not happen — bug in github.js)' };
    }
    if (String(body).includes('rate limit')) {
      return { code: 'RATE_LIMITED', message: 'GitHub API rate limit exceeded — try again later' };
    }
    return { code: 'FORBIDDEN', message: 'GitHub permission denied — token lacks required scope (needs repo:write)' };
  }
  if (status === 404) return { code: 'NOT_FOUND', message: 'Repository or file not found — check GITHUB_REPO and branch' };
  if (status === 409) return { code: 'CONFLICT', message: 'Git conflict — branch mismatch or file already exists with different SHA' };
  if (status === 422) return { code: 'UNPROCESSABLE', message: 'Validation failed — check request body' };
  return { code: 'UNKNOWN', message: `GitHub API error ${status}: ${body?.slice(0, 200) || 'unknown'}` };
};

// ============ BASE REQUEST HANDLER ============
// All GitHub API calls MUST go through this function.
// Never call fetch() directly on api.github.com from anywhere else.
export const githubRequest = async (env, endpoint, options = {}) => {
  // Validate env
  if (!env.GITHUB_TOKEN) {
    return { ok: false, status: 0, error: { code: 'NO_TOKEN', message: 'GITHUB_TOKEN secret not configured' }, data: null };
  }
  if (!env.GITHUB_REPO) {
    return { ok: false, status: 0, error: { code: 'NO_REPO', message: 'GITHUB_REPO not configured (format: owner/repo)' }, data: null };
  }

  const branch = env.GITHUB_BRANCH || 'main';
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

  // MANDATORY headers (do not let callers override these)
  const headers = {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': USER_AGENT,                    // ← CRITICAL — without this, GitHub returns 403
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  // Allow callers to add extra headers, but never override the mandatory ones
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      if (!['Authorization', 'User-Agent', 'Accept', 'X-GitHub-Api-Version'].includes(k)) {
        headers[k] = v;
      }
    }
  }

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    // Parse response (GitHub may return JSON or empty body)
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!res.ok) {
      const err = normalizeGithubError(res.status, typeof text === 'string' ? text : JSON.stringify(data));
      return { ok: false, status: res.status, error: err, data };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK_ERROR', message: `Network failure: ${err.message}` },
      data: null,
    };
  }
};

// ============ HIGH-LEVEL HELPERS ============

// Check if repo exists and is accessible
export const checkRepo = async (env) => {
  const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}`);
  return {
    ok: r.ok,
    exists: r.ok,
    status: r.status,
    error: r.error,
    data: r.ok ? {
      name: r.data?.name,
      full_name: r.data?.full_name,
      default_branch: r.data?.default_branch,
      permissions: r.data?.permissions,
    } : null,
  };
};

// Check if a branch exists
export const checkBranch = async (env, branch = null) => {
  const b = branch || env.GITHUB_BRANCH || 'main';
  const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}/branches/${encodeURIComponent(b)}`);
  return {
    ok: r.ok,
    exists: r.ok,
    branch: b,
    error: r.error,
  };
};

// Check if a path exists in the repo (returns SHA if exists, null if not)
export const getFileSha = async (env, path, branch = null) => {
  const b = branch || env.GITHUB_BRANCH || 'main';
  const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(b)}`);
  if (!r.ok) {
    if (r.status === 404) return { ok: true, exists: false, sha: null };
    return { ok: false, error: r.error };
  }
  return { ok: true, exists: true, sha: r.data?.sha, data: r.data };
};

// List contents of a folder
export const listFolder = async (env, path = '', branch = null) => {
  const b = branch || env.GITHUB_BRANCH || 'main';
  const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(b)}`);
  if (!r.ok) {
    if (r.status === 404) return { ok: true, exists: false, items: [] };
    return { ok: false, error: r.error, items: [] };
  }
  return { ok: true, exists: true, items: Array.isArray(r.data) ? r.data : [r.data] };
};

// Upload a file (create or update). content must be base64-encoded string.
// Auto-detects existing file and includes SHA for updates.
export const uploadFile = async (env, path, base64Content, message = null, retries = 2) => {
  const branch = env.GITHUB_BRANCH || 'main';
  const commitMessage = message || `chore(pixoris): upload ${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Get existing SHA (if file exists)
    const shaCheck = await getFileSha(env, path, branch);
    const sha = shaCheck.ok && shaCheck.sha ? shaCheck.sha : null;

    const body = {
      message: commitMessage,
      content: base64Content,
      branch,
      ...(sha && { sha }),
    };

    const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      body,
    });

    if (r.ok) {
      return {
        ok: true,
        url: r.data?.content?.download_url,
        sha: r.data?.content?.sha,
        path: r.data?.content?.path,
        html_url: r.data?.content?.html_url,
        updated: !!sha,
      };
    }

    // Retry on 5xx or network errors
    if ((r.status >= 500 || r.status === 0) && attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }

    return {
      ok: false,
      error: r.error,
      status: r.status,
    };
  }
};

// Delete a file by path (requires SHA)
export const deleteFile = async (env, path, message = null) => {
  const branch = env.GITHUB_BRANCH || 'main';
  const shaCheck = await getFileSha(env, path, branch);
  if (!shaCheck.ok) return { ok: false, error: shaCheck.error };
  if (!shaCheck.sha) return { ok: false, error: { code: 'NOT_FOUND', message: 'File does not exist' } };

  const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'DELETE',
    body: {
      message: message || `chore(pixoris): delete ${path}`,
      sha: shaCheck.sha,
      branch,
    },
  });

  return { ok: r.ok, error: r.error, status: r.status };
};

// Quick permission check (can the token write to this repo?)
export const checkWriteAccess = async (env) => {
  const r = await githubRequest(env, `/repos/${env.GITHUB_REPO}`);
  if (!r.ok) return { ok: false, can_write: false, error: r.error };
  const perms = r.data?.permissions || {};
  return {
    ok: true,
    can_write: perms.push === true || perms.admin === true,
    can_read: perms.pull !== false,
    permissions: perms,
  };
};
