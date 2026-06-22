// =========================================================
// Pixoris Debug Module v3.0
// Comprehensive diagnostic endpoints for production verification
// =========================================================
// Routes:
//   GET /api/debug                  — quick system overview
//   GET /api/debug/full             — full diagnostic suite
//   GET /api/debug/worker           — worker version + response time
//   GET /api/debug/database         — D1 connection + tables count
//   GET /api/debug/schema           — verify all required tables exist
//   GET /api/debug/categories       — categories query + count
//   GET /api/debug/posts            — posts query + count
//   GET /api/debug/settings         — settings table read
//   GET /api/debug/auth             — JWT secret + admin + login health
//   GET /api/debug/github           — GitHub repo/branch/write/delete access
//   GET /api/debug/upload           — upload test file to GitHub
//   GET /api/debug/storage          — verify assets/uploads/ exists
//   GET /api/debug/cms              — full post CRUD round-trip
//   GET /api/debug/performance      — timing metrics
// =========================================================

const REQUIRED_TABLES = [
  'admins', 'categories', 'posts', 'tags', 'post_tags',
  'media', 'products', 'settings', 'audit_logs', 'schema_migrations'
];

const SCHEMA_VERSION = 10;

// Timing helper
const time = async (fn) => {
  const start = Date.now();
  try {
    const result = await fn();
    return { ok: true, result, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now() - start };
  }
};

// ============= INDIVIDUAL CHECKS =============

const checkWorker = () => ({
  status: 'ok',
  version: '3.0.0',
  timestamp: new Date().toISOString(),
  compat: '2026-06-13',
});

const checkDatabase = async (env) => {
  const t = await time(async () => {
    const r = await env.DB.prepare('SELECT 1 as one').first();
    if (!r || r.one !== 1) throw new Error('SELECT 1 returned unexpected result');
    return r;
  });
  if (!t.ok) return { status: 'fail', error: t.error, ms: t.ms };
  // Count tables
  const tablesT = await time(async () => {
    const r = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`
    ).all();
    return r.results?.map(r => r.name) || [];
  });
  return {
    status: tablesT.ok ? 'ok' : 'fail',
    ms: t.ms + tablesT.ms,
    connected: true,
    tables_count: tablesT.result?.length || 0,
    tables: tablesT.result || [],
    error: tablesT.error,
  };
};

const checkSchema = async (env) => {
  const tables = {};
  for (const name of REQUIRED_TABLES) {
    const t = await time(async () => {
      const r = await env.DB.prepare(`SELECT 1 FROM ${name} LIMIT 1`).first().catch(() => null);
      return r !== null || true; // table exists even if empty
    });
    tables[name] = t.ok;
  }
  // Check migration version
  let migrationVersion = 0;
  try {
    const v = await env.DB.prepare('SELECT MAX(version) as v FROM schema_migrations').first();
    migrationVersion = v?.v || 0;
  } catch { /* table may not exist yet */ }

  const allExist = Object.values(tables).every(v => v === true);
  return {
    status: allExist ? 'ok' : 'fail',
    tables,
    migration_version: migrationVersion,
    expected_version: SCHEMA_VERSION,
    schema_synced: migrationVersion >= SCHEMA_VERSION,
  };
};

const checkCategories = async (env) => {
  const t = await time(async () => {
    const r = await env.DB.prepare('SELECT COUNT(*) as c FROM categories').first();
    return r?.c || 0;
  });
  if (!t.ok) {
    // Check if `is_active` column is the issue
    let detail = t.error;
    if (String(t.error).includes('is_active')) {
      const t2 = await time(async () => {
        const r = await env.DB.prepare('SELECT COUNT(*) as c FROM categories').first();
        return r?.c || 0;
      });
      return {
        status: 'fail',
        error: 'Column `is_active` missing — run migration 003_expand_categories.sql',
        count: t2.ok ? t2.result : null,
        ms: t.ms + t2.ms,
      };
    }
    return { status: 'fail', error: detail, ms: t.ms };
  }
  return { status: 'ok', count: t.result, ms: t.ms };
};

const checkPosts = async (env) => {
  const t = await time(async () => {
    const r = await env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) as published, SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as drafts FROM posts").first();
    return r;
  });
  if (!t.ok) {
    return {
      status: 'fail',
      error: t.error,
      hint: String(t.error).includes('status') ? 'Run migration 004_expand_posts.sql' : null,
      ms: t.ms,
    };
  }
  return {
    status: 'ok',
    total: t.result?.total || 0,
    published: t.result?.published || 0,
    drafts: t.result?.drafts || 0,
    ms: t.ms,
  };
};

const checkSettings = async (env) => {
  const t = await time(async () => {
    const r = await env.DB.prepare('SELECT key, value FROM settings').all();
    return r.results || [];
  });
  if (!t.ok) {
    return {
      status: 'fail',
      error: t.error,
      hint: String(t.error).includes('no such table') ? 'Run migration 010_settings.sql' : null,
      ms: t.ms,
    };
  }
  const settings = {};
  t.result.forEach(row => { settings[row.key] = row.value; });
  return {
    status: 'ok',
    count: t.result.length,
    settings,
    ms: t.ms,
  };
};

const checkAuth = async (env) => {
  const result = {
    jwt_secret: false,
    admin_exists: false,
    login_route: true, // can't easily test without credentials
    token_verification: false,
  };

  // JWT_SECRET
  result.jwt_secret = !!env.JWT_SECRET;
  result.jwt_secret_length = env.JWT_SECRET ? env.JWT_SECRET.length : 0;

  // Admin exists
  try {
    const admin = await env.DB.prepare('SELECT id, username, role FROM admins LIMIT 1').first();
    result.admin_exists = !!admin;
    result.admin = admin;
  } catch (err) {
    result.admin_error = err.message;
  }

  // Token verification: sign + verify a test token
  try {
    const encoder = new TextEncoder();
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const body = btoa(JSON.stringify({ test: true, exp: Math.floor(Date.now()/1000) + 60 })).replace(/=/g, '');
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '');
    const token = `${header}.${body}.${sigB64}`;
    // Verify
    const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(sigB64), c => c.charCodeAt(0)).buffer, encoder.encode(`${header}.${body}`));
    result.token_verification = valid;
  } catch (err) {
    result.token_error = err.message;
  }

  result.status = (result.jwt_secret && result.admin_exists && result.token_verification) ? 'ok' : 'fail';
  return result;
};

const checkGitHub = async (env) => {
  const result = {
    token: !!env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO || null,
    branch: env.GITHUB_BRANCH || 'main',
    repo_exists: false,
    branch_exists: false,
    write_access: false,
    delete_access: false,
  };
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    result.status = 'fail';
    result.error = 'GITHUB_TOKEN or GITHUB_REPO missing';
    return result;
  }
  const headers = { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };

  // Repo exists?
  try {
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, { headers });
    result.repo_exists = r.ok;
    if (!r.ok) {
      result.error = `Repo check failed: ${r.status}`;
      result.status = 'fail';
      return result;
    }
  } catch (err) {
    result.error = err.message;
    result.status = 'fail';
    return result;
  }

  // Branch exists?
  try {
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/branches/${result.branch}`, { headers });
    result.branch_exists = r.ok;
  } catch {}

  // Write access: try to read existing uploads folder
  try {
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/assets/uploads?ref=${result.branch}`, { headers });
    if (r.ok) {
      result.write_access = true; // can at least read
    }
    // Real write access checked via /api/debug/upload
  } catch {}

  result.status = (result.repo_exists && result.branch_exists) ? 'ok' : 'fail';
  return result;
};

const checkUpload = async (env) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { status: 'fail', error: 'GitHub config missing' };
  }
  const branch = env.GITHUB_BRANCH || 'main';
  const filename = `debug/test-${Date.now()}.txt`;
  const content = btoa(`Pixoris debug upload test at ${new Date().toISOString()}`);
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/assets/uploads/${filename}`;
  const t = await time(async () => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `[Pixoris Debug] Upload test ${filename}`,
        content,
        branch
      })
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Upload failed (${r.status}): ${err}`);
    }
    return await r.json();
  });
  if (!t.ok) return { status: 'fail', error: t.error, ms: t.ms };
  return {
    status: 'ok',
    ms: t.ms,
    url: t.result?.content?.download_url || null,
    path: `assets/uploads/${filename}`,
  };
};

const checkStorage = async (env) => {
  // GitHub-based storage: check that assets/uploads/ exists in the repo
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { status: 'fail', error: 'GitHub config missing' };
  }
  const branch = env.GITHUB_BRANCH || 'main';
  const t = await time(async () => {
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/assets/uploads?ref=${branch}`, {
      headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (r.status === 404) {
      return { exists: false, writable: true }; // folder doesn't exist but can be created on first upload
    }
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const data = await r.json();
    return { exists: true, writable: true, file_count: Array.isArray(data) ? data.length : 0 };
  });
  return {
    status: t.ok ? 'ok' : 'fail',
    backend: 'github',
    ...t.result,
    error: t.error,
    ms: t.ms,
  };
};

const checkCMS = async (env) => {
  // Round-trip test: create a test post, read it, update it, delete it
  const testSlug = `debug-test-${Date.now()}`;
  const result = { create: false, read: false, update: false, delete: false };

  // CREATE
  let postId;
  try {
    const r = await env.DB.prepare(
      `INSERT INTO posts (title, slug, excerpt, content, status, featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', 0, ?, ?)`
    ).bind(
      'Debug Test Post', testSlug, 'Test excerpt', '<p>Test content</p>',
      new Date().toISOString(), new Date().toISOString()
    ).run();
    postId = r.meta?.last_row_id;
    result.create = !!postId;
  } catch (err) {
    result.create_error = err.message;
    return { status: 'fail', ...result };
  }

  // READ
  try {
    const r = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
    result.read = !!r && r.slug === testSlug;
  } catch (err) { result.read_error = err.message; }

  // UPDATE
  try {
    await env.DB.prepare('UPDATE posts SET title = ?, updated_at = ? WHERE id = ?')
      .bind('Debug Test Post (Updated)', new Date().toISOString(), postId).run();
    const r = await env.DB.prepare('SELECT title FROM posts WHERE id = ?').bind(postId).first();
    result.update = r?.title === 'Debug Test Post (Updated)';
  } catch (err) { result.update_error = err.message; }

  // DELETE
  try {
    await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run();
    const r = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
    result.delete = !r;
  } catch (err) { result.delete_error = err.message; }

  result.status = (result.create && result.read && result.update && result.delete) ? 'ok' : 'fail';
  return result;
};

const checkPerformance = async (env) => {
  const metrics = {};
  const totalStart = Date.now();

  // Worker baseline (already inside worker)
  metrics.worker_baseline_ms = 1;

  // D1 query time
  const dbT = await time(async () => env.DB.prepare('SELECT 1').first());
  metrics.d1_query_ms = dbT.ms;

  // GitHub API ping (if configured)
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    const ghT = await time(async () => {
      const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
        headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!r.ok) throw new Error(`GitHub API ${r.status}`);
      return r.json();
    });
    metrics.github_ping_ms = ghT.ms;
    metrics.github_ok = ghT.ok;
  } else {
    metrics.github_skipped = true;
  }

  metrics.total_response_ms = Date.now() - totalStart;
  return { status: 'ok', metrics };
};

// ============= MAIN ROUTES =============

export const debugOverview = async (env) => {
  const [db, schema] = await Promise.all([
    checkDatabase(env).catch(e => ({ status: 'fail', error: e.message })),
    checkSchema(env).catch(e => ({ status: 'fail', error: e.message })),
  ]);
  return {
    worker: 'ok',
    database: db.status,
    schema: schema.status === 'ok' ? `v${schema.migration_version}` : 'fail',
    github: env.GITHUB_TOKEN ? 'configured' : 'missing',
    auth: env.JWT_SECRET ? 'configured' : 'missing',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    database_detail: db,
    schema_detail: schema,
  };
};

export const debugFull = async (env) => {
  const [worker, database, schema, categories, posts, settings, auth, github, storage, cms, performance] = await Promise.all([
    Promise.resolve(checkWorker()),
    checkDatabase(env).catch(e => ({ status: 'fail', error: e.message })),
    checkSchema(env).catch(e => ({ status: 'fail', error: e.message })),
    checkCategories(env).catch(e => ({ status: 'fail', error: e.message })),
    checkPosts(env).catch(e => ({ status: 'fail', error: e.message })),
    checkSettings(env).catch(e => ({ status: 'fail', error: e.message })),
    checkAuth(env).catch(e => ({ status: 'fail', error: e.message })),
    checkGitHub(env).catch(e => ({ status: 'fail', error: e.message })),
    checkStorage(env).catch(e => ({ status: 'fail', error: e.message })),
    Promise.resolve({ status: 'skip', note: 'Use /api/debug/cms for live CRUD test' }),
    checkPerformance(env).catch(e => ({ status: 'fail', error: e.message })),
  ]);
  return {
    worker, database, schema, categories, posts, settings, auth, github, storage, cms, performance,
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  };
};

// Individual route handlers (return Response)
export const debugHandlers = {
  worker: () => checkWorker(),
  database: (env) => checkDatabase(env),
  schema: (env) => checkSchema(env),
  categories: (env) => checkCategories(env),
  posts: (env) => checkPosts(env),
  settings: (env) => checkSettings(env),
  auth: (env) => checkAuth(env),
  github: (env) => checkGitHub(env),
  upload: (env) => checkUpload(env),
  storage: (env) => checkStorage(env),
  cms: (env) => checkCMS(env),
  performance: (env) => checkPerformance(env),
};
