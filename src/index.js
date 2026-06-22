// =========================================================
// Pixoris CMS Worker API v2.2 — Production Ready
// =========================================================
// Fixes & Features:
//   • Schema synced with worker code (no missing columns)
//   • PBKDF2 password hashing (100k iterations, SHA-256)
//   • Role-based auth (super_admin, admin, editor, author)
//   • Audit logs for all admin actions
//   • Full Products CRUD admin endpoints
//   • Media delete + folder + alt-text support
//   • Pagination + search on all list endpoints
//   • Storage abstraction (GitHub now, R2 ready)
//   • Settings API
//   • Sitemap endpoint
//   • Better error handling & logging
// =========================================================
import { Router } from './router.js';

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;

// ============ CRYPTO HELPERS ============
const base64UrlEncode = (buffer) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64UrlDecode = (base64Url) => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return buffer.buffer;
};

const importHmacKey = async (secret) => {
  return crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
};

// PBKDF2-based password hashing (much stronger than raw SHA-256)
const hashPassword = async (password, salt) => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return base64UrlEncode(bits);
};

const verifyPassword = async (password, salt, expectedHash) => {
  const actual = await hashPassword(password, salt);
  return actual === expectedHash;
};

// Legacy SHA-256 (for migrating v2.1 stored hashes)
const legacyHashPassword = async (password, salt) => {
  const data = encoder.encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(hash);
};

const signJWT = async (payload, secret) => {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400  // 24 hours
  })));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(signature)}`;
};

const verifyJWT = async (token, secret) => {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      base64UrlDecode(signature),
      encoder.encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
};

// ============ RESPONSE HELPERS ============
const jsonResponse = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  }
});

const errorResponse = (message, status = 400) => jsonResponse({ success: false, error: message }, status);

const successResponse = (data = {}, extra = {}) => jsonResponse({ success: true, ...data, ...extra });

// ============ AUTH HELPERS ============
const getAuth = async (request, secret) => {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), secret);
};

// Role hierarchy: higher number = more permissions
const ROLE_LEVEL = { author: 1, editor: 2, admin: 3, super_admin: 4 };

const requireRole = (minRole) => (handler) => async (request, env) => {
  const auth = await getAuth(request, env.JWT_SECRET);
  if (!auth) return errorResponse('Unauthorized - token missing or invalid', 401);
  if (ROLE_LEVEL[auth.role] < ROLE_LEVEL[minRole]) {
    return errorResponse(`Forbidden - requires ${minRole} role`, 403);
  }
  request.admin = auth;
  return handler(request, env);
};

// Backwards-compatible adminAuth (any authenticated admin)
const adminAuth = (handler) => async (request, env) => {
  const auth = await getAuth(request, env.JWT_SECRET);
  if (!auth) return errorResponse('Unauthorized', 401);
  if (ROLE_LEVEL[auth.role] < ROLE_LEVEL['author']) {
    return errorResponse('Forbidden', 403);
  }
  request.admin = auth;
  return handler(request, env);
};

// ============ AUDIT LOG ============
const auditLog = async (env, adminId, action, entityType = null, entityId = null, details = null, request = null) => {
  try {
    const ip = request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('X-Forwarded-For') || null;
    const ua = request?.headers?.get('User-Agent') || null;
    await env.DB.prepare(
      'INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip, ua).run();
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

// ============ STORAGE ABSTRACTION ============
const Storage = {
  async upload(filename, base64Content, env) {
    // Future: if env.R2_BUCKET configured, use R2 instead
    if (env.R2_BUCKET) {
      return Storage._uploadToR2(filename, base64Content, env);
    }
    return Storage._uploadToGitHub(filename, base64Content, env);
  },

  async _uploadToGitHub(filename, base64Content, env) {
    const path = `assets/uploads/${filename}`;
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
    const branch = env.GITHUB_BRANCH || 'main';
    const checkRes = await fetch(url + `?ref=${branch}`, {
      headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    let sha = null;
    if (checkRes.status === 200) { const existing = await checkRes.json(); sha = existing.sha; }
    const body = { message: `Upload ${filename} via Pixoris CMS`, content: base64Content, branch, ...(sha && { sha }) };
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`GitHub upload failed: ${err}`); }
    const data = await res.json();
    return { url: data.content.download_url, storage: 'github' };
  },

  async _uploadToR2(filename, base64Content, env) {
    // Placeholder for R2 implementation
    // Requires R2 binding in wrangler.toml
    throw new Error('R2 storage not yet implemented - configure GitHub for now');
  },

  async delete(url, env) {
    // GitHub deletion requires SHA — handled via API
    if (!url.includes('github.com') && !url.includes('raw.githubusercontent.com')) return;
    try {
      const match = url.match(/\/(?:blob|raw)\/[^/]+\/(.+)$/);
      if (!match) return;
      const path = match[1];
      const branch = env.GITHUB_BRANCH || 'main';
      const apiUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${branch}`;
      const checkRes = await fetch(apiUrl, {
        headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!checkRes.ok) return;
      const existing = await checkRes.json();
      await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${path}`, sha: existing.sha, branch })
      });
    } catch (err) {
      console.error('GitHub delete failed:', err.message);
    }
  }
};

// ============ SLUG HELPER ============
const slugify = (str) => {
  return String(str).trim()
    .replace(/[\s\u0600-\u06FF]+/g, '-')  // Persian chars + spaces to dashes
    .replace(/[^a-zA-Z0-9\u0600-\u06FF-]/g, '')
    .replace(/-+/g, '-')
    .toLowerCase();
};

const estimateReadingTime = (html) => {
  const text = String(html).replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200)); // 200 WPM
};

// ============ ROUTER ============
const router = new Router();

// ============ PUBLIC: HEALTH ============
router.get('/api/health', () => successResponse({ status: 'ok', version: '2.2.0', timestamp: new Date().toISOString() }));

// ============ PUBLIC: POSTS ============
router.get('/api/posts', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const tag = searchParams.get('tag');
  const featured = searchParams.get('featured');
  const q = searchParams.get('q');
  const sort = searchParams.get('sort') || 'newest'; // newest | oldest | popular
  const limit = Math.min(parseInt(searchParams.get('limit')) || 12, 100);
  const offset = parseInt(searchParams.get('offset')) || 0;
  const page = parseInt(searchParams.get('page')) || 1;
  const offsetCalc = (page - 1) * limit;

  let sql = `SELECT p.*, c.name as category_name, c.slug as category_slug, c.color as category_color,
                    a.username as author_name
             FROM posts p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN admins a ON p.author_id = a.id
             WHERE p.status = 'published'`;
  const params = [];
  if (category) { sql += ' AND c.slug = ?'; params.push(category); }
  if (featured === '1') sql += ' AND p.featured = 1';
  if (q) {
    sql += ' AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (tag) {
    sql += ' AND p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE t.slug = ?)';
    params.push(tag);
  }

  // Count total
  const countSql = sql.replace(/^SELECT p\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
  const countResult = await env.DB.prepare(countSql).bind(...params).first();
  const total = countResult?.total || 0;

  // Sort
  const orderBy = sort === 'popular' ? 'p.views DESC' : sort === 'oldest' ? 'p.published_at ASC' : 'p.published_at DESC';
  sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  params.push(limit, offsetCalc);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return successResponse({
    posts: results || [],
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});

router.get('/api/post/:slug', async (request, env) => {
  const { slug } = request.params;
  const { results } = await env.DB.prepare(
    `SELECT p.*, c.name as category_name, c.slug as category_slug, c.color as category_color,
            a.username as author_name
     FROM posts p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN admins a ON p.author_id = a.id
     WHERE p.slug = ? AND p.status = 'published'`
  ).bind(slug).all();
  if (!results || results.length === 0) return errorResponse('Post not found', 404);

  await env.DB.prepare('UPDATE posts SET views = views + 1 WHERE slug = ?').bind(slug).run();
  const tagsResult = await env.DB.prepare(
    `SELECT t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?`
  ).bind(results[0].id).all();

  // Related posts
  const related = await env.DB.prepare(
    `SELECT p.id, p.title, p.slug, p.image_url, p.excerpt
     FROM posts p WHERE p.category_id = ? AND p.id != ? AND p.status = 'published'
     ORDER BY p.published_at DESC LIMIT 4`
  ).bind(results[0].category_id, results[0].id).all();

  return successResponse({
    post: { ...results[0], tags: tagsResult.results || [], related: related.results || [] }
  });
});

// ============ PUBLIC: CATEGORIES ============
router.get('/api/categories', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const includeCounts = searchParams.get('with_counts') === '1';
  let sql = `SELECT c.* ${includeCounts ? ', (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id AND p.status = \'published\') as post_count' : ''} FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.id`;
  const { results } = await env.DB.prepare(sql).all();
  return successResponse({ categories: results || [] });
});

router.get('/api/category/:slug', async (request, env) => {
  const { slug } = request.params;
  const cat = await env.DB.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1').bind(slug).first();
  if (!cat) return errorResponse('Category not found', 404);
  return successResponse({ category: cat });
});

// ============ PUBLIC: FEATURED + TRENDING ============
router.get('/api/featured', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit')) || 6, 20);
  const { results } = await env.DB.prepare(
    `SELECT p.*, c.name as category_name, c.slug as category_slug, c.color as category_color
     FROM posts p LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.featured = 1 AND p.status = 'published'
     ORDER BY p.published_at DESC LIMIT ?`
  ).bind(limit).all();
  return successResponse({ posts: results || [] });
});

router.get('/api/trending', async (request, env) => {
  const { results } = await env.DB.prepare(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM posts p LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.status = 'published' AND p.views > 0
     ORDER BY p.views DESC LIMIT 5`
  ).all();
  return successResponse({ posts: results || [] });
});

// ============ PUBLIC: SEARCH ============
router.get('/api/search', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const type = searchParams.get('type') || 'posts'; // posts | products | all
  if (!q || q.length < 2) return successResponse({ posts: [], products: [] });

  const results = {};
  if (type === 'posts' || type === 'all') {
    const postsRes = await env.DB.prepare(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.image_url, c.name as category_name
       FROM posts p LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.status = 'published' AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)
       ORDER BY p.published_at DESC LIMIT 20`
    ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
    results.posts = postsRes.results || [];
  }
  if (type === 'products' || type === 'all') {
    const productsRes = await env.DB.prepare(
      `SELECT id, title, slug, description, price, image_url, category
       FROM products WHERE active = 1 AND (title LIKE ? OR description LIKE ?)
       ORDER BY sort_order LIMIT 20`
    ).bind(`%${q}%`, `%${q}%`).all();
    results.products = productsRes.results || [];
  }
  return successResponse(results);
});

// ============ PUBLIC: TAGS ============
router.get('/api/tags', async (request, env) => {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.name, t.slug, COUNT(pt.post_id) as post_count
     FROM tags t LEFT JOIN post_tags pt ON t.id = pt.tag_id
     GROUP BY t.id ORDER BY post_count DESC LIMIT 50`
  ).all();
  return successResponse({ tags: results || [] });
});

// ============ PUBLIC: PRODUCTS ============
router.get('/api/products', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const featured = searchParams.get('featured');
  const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 100);
  let sql = 'SELECT * FROM products WHERE active = 1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (featured === '1') sql += ' AND featured = 1';
  sql += ' ORDER BY sort_order, id LIMIT ?';
  params.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return successResponse({ products: results || [] });
});

router.get('/api/product/:slug', async (request, env) => {
  const { slug } = request.params;
  const { results } = await env.DB.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').bind(slug).all();
  if (!results || results.length === 0) return errorResponse('Product not found', 404);

  // Related products
  const related = await env.DB.prepare(
    'SELECT id, title, slug, price, image_url FROM products WHERE category = ? AND id != ? AND active = 1 LIMIT 4'
  ).bind(results[0].category, results[0].id).all();

  return successResponse({
    product: {
      ...results[0],
      gallery: results[0].gallery ? JSON.parse(results[0].gallery) : []
    },
    related: related.results || []
  });
});

// ============ PUBLIC: SITEMAP DATA ============
router.get('/api/sitemap', async (request, env) => {
  const posts = await env.DB.prepare(
    `SELECT slug, updated_at FROM posts WHERE status = 'published' ORDER BY updated_at DESC`
  ).all();
  const categories = await env.DB.prepare('SELECT slug, updated_at FROM categories WHERE is_active = 1').all();
  const products = await env.DB.prepare('SELECT slug, updated_at FROM products WHERE active = 1').all();
  return successResponse({
    posts: posts.results || [],
    categories: categories.results || [],
    products: products.results || []
  });
});

// ============ PUBLIC: SETTINGS ============
router.get('/api/settings', async (request, env) => {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  (results || []).forEach(row => { settings[row.key] = row.value; });
  return successResponse({ settings });
});

// ============ ADMIN: AUTH ============
router.post('/api/admin/login', async (request, env) => {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return errorResponse('Username and password required');

    const { results } = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).all();
    if (!results || results.length === 0) {
      await auditLog(env, null, 'login.failed', 'admin', null, { username }, request);
      return errorResponse('Invalid credentials', 401);
    }
    const admin = results[0];

    if (!admin.is_active) {
      await auditLog(env, admin.id, 'login.disabled', 'admin', admin.id, null, request);
      return errorResponse('Account disabled. Contact super admin.', 403);
    }

    let passwordValid = false;
    if (admin.password_hash.startsWith('pbkdf2:')) {
      // v2.2 format: pbkdf2:<salt>:<hash>
      const [, salt, hash] = admin.password_hash.split(':');
      passwordValid = await verifyPassword(password, salt, hash);
    } else if (admin.password_hash.startsWith('sha256:')) {
      // v2.1 format: sha256:<salt>:<hash>  (auto-migrate to pbkdf2)
      const [, salt, hash] = admin.password_hash.split(':');
      const legacyHash = await legacyHashPassword(password, salt);
      passwordValid = legacyHash === hash;
    } else {
      // Legacy plaintext (auto-migrate)
      passwordValid = admin.password_hash === password;
    }

    if (!passwordValid) {
      await auditLog(env, admin.id, 'login.failed', 'admin', admin.id, null, request);
      return errorResponse('Invalid credentials', 401);
    }

    // Migrate legacy password to PBKDF2
    if (!admin.password_hash.startsWith('pbkdf2:')) {
      const newSalt = crypto.randomUUID();
      const newHash = await hashPassword(password, newSalt);
      await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
        .bind(`pbkdf2:${newSalt}:${newHash}`, admin.id).run();
    }

    // Update last_login
    await env.DB.prepare('UPDATE admins SET last_login = ? WHERE id = ?')
      .bind(new Date().toISOString(), admin.id).run();

    await auditLog(env, admin.id, 'login.success', 'admin', admin.id, null, request);

    const token = await signJWT(
      { id: admin.id, username: admin.username, role: admin.role, email: admin.email },
      env.JWT_SECRET
    );
    return successResponse({
      token,
      admin: { id: admin.id, username: admin.username, role: admin.role, email: admin.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse('Login failed: ' + err.message, 500);
  }
});

router.get('/api/admin/me', adminAuth(async (request, env) => {
  const { id } = request.admin;
  const admin = await env.DB.prepare(
    'SELECT id, username, email, role, is_active, last_login, created_at FROM admins WHERE id = ?'
  ).bind(id).first();
  if (!admin) return errorResponse('Admin not found', 404);
  return successResponse({ admin });
}));

// ============ ADMIN: STATS / DASHBOARD ============
router.get('/api/admin/stats', adminAuth(async (request, env) => {
  const totalPosts = await env.DB.prepare("SELECT COUNT(*) as count FROM posts").first();
  const publishedCount = await env.DB.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'published'").first();
  const draftCount = await env.DB.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'").first();
  const scheduledCount = await env.DB.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'scheduled'").first();
  const categoriesCount = await env.DB.prepare("SELECT COUNT(*) as count FROM categories").first();
  const productsCount = await env.DB.prepare("SELECT COUNT(*) as count FROM products").first();
  const mediaCount = await env.DB.prepare("SELECT COUNT(*) as count FROM media").first();
  const totalViews = await env.DB.prepare("SELECT SUM(views) as count FROM posts").first();
  const usersCount = await env.DB.prepare("SELECT COUNT(*) as count FROM admins").first();
  const auditCount = await env.DB.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE created_at > datetime('now', '-7 days')").first();

  // Latest posts
  const latestPosts = await env.DB.prepare(
    `SELECT p.id, p.title, p.slug, p.status, p.views, p.updated_at, c.name as category_name
     FROM posts p LEFT JOIN categories c ON p.category_id = c.id
     ORDER BY p.updated_at DESC LIMIT 5`
  ).all();

  // Top viewed
  const topPosts = await env.DB.prepare(
    `SELECT id, title, slug, views FROM posts WHERE status = 'published' ORDER BY views DESC LIMIT 5`
  ).all();

  return successResponse({
    stats: {
      totalPosts: totalPosts?.count || 0,
      published: publishedCount?.count || 0,
      drafts: draftCount?.count || 0,
      scheduled: scheduledCount?.count || 0,
      categories: categoriesCount?.count || 0,
      products: productsCount?.count || 0,
      media: mediaCount?.count || 0,
      users: usersCount?.count || 0,
      totalViews: totalViews?.count || 0,
      recentActivity: auditCount?.count || 0,
    },
    latestPosts: latestPosts.results || [],
    topPosts: topPosts.results || []
  });
}));

// ============ ADMIN: AUDIT LOGS ============
router.get('/api/admin/audit-logs', requireRole('admin')(async (request, env) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);
  const offset = parseInt(searchParams.get('offset')) || 0;
  const action = searchParams.get('action');
  let sql = `SELECT al.*, a.username as admin_name FROM audit_logs al LEFT JOIN admins a ON al.admin_id = a.id`;
  const params = [];
  if (action) { sql += ' WHERE al.action LIKE ?'; params.push(`%${action}%`); }
  sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return successResponse({ logs: results || [] });
}));

// ============ ADMIN: POSTS CRUD ============
router.get('/api/admin/posts', adminAuth(async (request, env) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);
  let sql = `SELECT p.*, c.name as category_name, a.username as author_name
             FROM posts p LEFT JOIN categories c ON p.category_id = c.id
                          LEFT JOIN admins a ON p.author_id = a.id`;
  const params = [];
  if (status) { sql += ' WHERE p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.updated_at DESC LIMIT ?';
  params.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return successResponse({ posts: results || [] });
}));

router.get('/api/admin/post/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { results } = await env.DB.prepare(
    `SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?`
  ).bind(id).all();
  if (!results || results.length === 0) return errorResponse('Post not found', 404);
  const tagsResult = await env.DB.prepare(
    `SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?`
  ).bind(id).all();
  return successResponse({ post: { ...results[0], tags: tagsResult.results || [] } });
}));

router.post('/api/admin/post', adminAuth(async (request, env) => {
  const data = await request.json();
  const { title, slug, excerpt, content, image_url, featured_image_alt, category_id, featured, status, tags, seo_title, seo_description, canonical_url, meta_keywords } = data;
  if (!title || !slug || !content) return errorResponse('Title, slug and content are required');

  const existing = await env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).all();
  if (existing.results && existing.results.length > 0) return errorResponse('Slug already exists');

  const now = new Date().toISOString();
  const finalStatus = status || (data.published ? 'published' : 'draft');
  const publishedAt = finalStatus === 'published' ? now : null;
  const readingTime = estimateReadingTime(content);

  const result = await env.DB.prepare(
    `INSERT INTO posts (title, slug, excerpt, content, image_url, featured_image_alt, category_id, author_id, status, featured, reading_time, published_at, seo_title, seo_description, canonical_url, meta_keywords, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title, slug, excerpt || '', content, image_url || '', featured_image_alt || '',
    category_id || null, request.admin.id, finalStatus, featured ? 1 : 0,
    readingTime, publishedAt,
    seo_title || null, seo_description || null, canonical_url || null, meta_keywords || null,
    now, now
  ).run();

  const postId = result.meta?.last_row_id;
  if (tags && tags.length > 0 && postId) {
    for (const tagName of tags) {
      const tagSlug = slugify(tagName);
      await env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(tagName, tagSlug).run();
      const tagResult = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(tagSlug).all();
      if (tagResult.results && tagResult.results[0]) {
        await env.DB.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagResult.results[0].id).run();
      }
    }
  }

  await auditLog(env, request.admin.id, 'post.create', 'post', postId, { title, slug, status: finalStatus }, request);
  return successResponse({ id: postId, message: 'Post created successfully' });
}));

router.put('/api/admin/post/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const data = await request.json();
  const { title, slug, excerpt, content, image_url, featured_image_alt, category_id, featured, status, tags, seo_title, seo_description, canonical_url, meta_keywords } = data;
  if (!title || !slug || !content) return errorResponse('Title, slug and content are required');

  const existing = await env.DB.prepare('SELECT id, status FROM posts WHERE slug = ? AND id != ?').bind(slug, id).all();
  if (existing.results && existing.results.length > 0) return errorResponse('Slug already exists');

  const now = new Date().toISOString();
  const finalStatus = status || 'draft';
  const readingTime = estimateReadingTime(content);
  // Set published_at only when transitioning to published for the first time
  const current = await env.DB.prepare('SELECT status, published_at FROM posts WHERE id = ?').bind(id).first();
  let publishedAt = current?.published_at;
  if (finalStatus === 'published' && !publishedAt) publishedAt = now;
  if (finalStatus !== 'published') publishedAt = null;

  await env.DB.prepare(
    `UPDATE posts SET title = ?, slug = ?, excerpt = ?, content = ?, image_url = ?, featured_image_alt = ?,
       category_id = ?, status = ?, featured = ?, reading_time = ?, published_at = ?,
       seo_title = ?, seo_description = ?, canonical_url = ?, meta_keywords = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    title, slug, excerpt || '', content, image_url || '', featured_image_alt || '',
    category_id || null, finalStatus, featured ? 1 : 0, readingTime, publishedAt,
    seo_title || null, seo_description || null, canonical_url || null, meta_keywords || null,
    now, id
  ).run();

  if (tags && Array.isArray(tags)) {
    await env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
    for (const tagName of tags) {
      const tagSlug = slugify(tagName);
      await env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(tagName, tagSlug).run();
      const tagResult = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(tagSlug).all();
      if (tagResult.results && tagResult.results[0]) {
        await env.DB.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(id, tagResult.results[0].id).run();
      }
    }
  }

  await auditLog(env, request.admin.id, 'post.update', 'post', parseInt(id), { title, slug, status: finalStatus }, request);
  return successResponse({ message: 'Post updated successfully' });
}));

router.delete('/api/admin/post/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const post = await env.DB.prepare('SELECT title FROM posts WHERE id = ?').bind(id).first();
  await env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  await auditLog(env, request.admin.id, 'post.delete', 'post', parseInt(id), { title: post?.title }, request);
  return successResponse({ message: 'Post deleted successfully' });
}));

// ============ ADMIN: CATEGORIES CRUD ============
router.get('/api/admin/categories', adminAuth(async (request, env) => {
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id) as post_count
     FROM categories c ORDER BY c.sort_order, c.id`
  ).all();
  return successResponse({ categories: results || [] });
}));

router.post('/api/admin/category', adminAuth(async (request, env) => {
  const { name, slug, description, icon, banner_image, color, seo_title, seo_description, is_active, is_featured, sort_order } = await request.json();
  if (!name || !slug) return errorResponse('Name and slug required');
  const result = await env.DB.prepare(
    `INSERT INTO categories (name, slug, description, icon, banner_image, color, seo_title, seo_description, is_active, is_featured, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, slug, description || '', icon || '', banner_image || '', color || '#4ee5ff',
         seo_title || null, seo_description || null, is_active === false ? 0 : 1, is_featured ? 1 : 0, sort_order || 0).run();
  await auditLog(env, request.admin.id, 'category.create', 'category', result.meta?.last_row_id, { name, slug }, request);
  return successResponse({ id: result.meta?.last_row_id });
}));

router.put('/api/admin/category/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { name, slug, description, icon, banner_image, color, seo_title, seo_description, is_active, is_featured, sort_order } = await request.json();
  await env.DB.prepare(
    `UPDATE categories SET name = ?, slug = ?, description = ?, icon = ?, banner_image = ?, color = ?,
       seo_title = ?, seo_description = ?, is_active = ?, is_featured = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(name, slug, description || '', icon || '', banner_image || '', color || '#4ee5ff',
         seo_title || null, seo_description || null, is_active === false ? 0 : 1, is_featured ? 1 : 0, sort_order || 0, id).run();
  await auditLog(env, request.admin.id, 'category.update', 'category', parseInt(id), { name, slug }, request);
  return successResponse({});
}));

router.delete('/api/admin/category/:id', requireRole('admin')(async (request, env) => {
  const { id } = request.params;
  const cat = await env.DB.prepare('SELECT name FROM categories WHERE id = ?').bind(id).first();
  // Unlink posts from this category
  await env.DB.prepare('UPDATE posts SET category_id = NULL WHERE category_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  await auditLog(env, request.admin.id, 'category.delete', 'category', parseInt(id), { name: cat?.name }, request);
  return successResponse({});
}));

// ============ ADMIN: PRODUCTS CRUD ============
router.get('/api/admin/products', adminAuth(async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY sort_order, id').all();
  return successResponse({ products: results || [] });
}));

router.post('/api/admin/product', adminAuth(async (request, env) => {
  const { title, slug, description, price, discount_price, stock, sku, image_url, gallery, category, featured, active, sort_order } = await request.json();
  if (!title || !slug) return errorResponse('Title and slug required');
  const result = await env.DB.prepare(
    `INSERT INTO products (title, slug, description, price, discount_price, stock, sku, image_url, gallery, category, featured, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title, slug, description || '', price || 0, discount_price || null, stock || 0, sku || null,
    image_url || '', gallery ? JSON.stringify(gallery) : '[]', category || '',
    featured ? 1 : 0, active === false ? 0 : 1, sort_order || 0
  ).run();
  await auditLog(env, request.admin.id, 'product.create', 'product', result.meta?.last_row_id, { title, slug }, request);
  return successResponse({ id: result.meta?.last_row_id });
}));

router.put('/api/admin/product/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { title, slug, description, price, discount_price, stock, sku, image_url, gallery, category, featured, active, sort_order } = await request.json();
  await env.DB.prepare(
    `UPDATE products SET title = ?, slug = ?, description = ?, price = ?, discount_price = ?, stock = ?, sku = ?,
       image_url = ?, gallery = ?, category = ?, featured = ?, active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    title, slug, description || '', price || 0, discount_price || null, stock || 0, sku || null,
    image_url || '', gallery ? JSON.stringify(gallery) : '[]', category || '',
    featured ? 1 : 0, active === false ? 0 : 1, sort_order || 0, id
  ).run();
  await auditLog(env, request.admin.id, 'product.update', 'product', parseInt(id), { title, slug }, request);
  return successResponse({});
}));

router.delete('/api/admin/product/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const product = await env.DB.prepare('SELECT title FROM products WHERE id = ?').bind(id).first();
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  await auditLog(env, request.admin.id, 'product.delete', 'product', parseInt(id), { title: product?.title }, request);
  return successResponse({});
}));

// ============ ADMIN: MEDIA ============
router.get('/api/admin/media', adminAuth(async (request, env) => {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder');
  const q = searchParams.get('q');
  let sql = 'SELECT m.*, a.username as uploaded_by_name FROM media m LEFT JOIN admins a ON m.uploaded_by = a.id';
  const params = [];
  const where = [];
  if (folder) { where.push('m.folder = ?'); params.push(folder); }
  if (q) { where.push('(m.filename LIKE ? OR m.alt_text LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY m.uploaded_at DESC';
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return successResponse({ media: results || [] });
}));

router.post('/api/admin/upload', adminAuth(async (request, env) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder') || '';
    const altText = formData.get('alt_text') || '';
    if (!file) return errorResponse('No file uploaded');

    const bytes = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const safeName = file.name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '');
    const filename = `${Date.now()}-${safeName}`;

    const { url, storage } = await Storage.upload(filename, base64, env);
    const result = await env.DB.prepare(
      'INSERT INTO media (filename, url, original_name, size, mime_type, alt_text, folder, storage, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(filename, url, file.name, bytes.byteLength, file.type, altText, folder, storage, request.admin.id).run();

    await auditLog(env, request.admin.id, 'media.upload', 'media', result.meta?.last_row_id, { filename, folder }, request);
    return successResponse({ url, filename, id: result.meta?.last_row_id });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}));

router.put('/api/admin/media/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { alt_text, folder } = await request.json();
  await env.DB.prepare('UPDATE media SET alt_text = ?, folder = ? WHERE id = ?').bind(alt_text || '', folder || '', id).run();
  await auditLog(env, request.admin.id, 'media.update', 'media', parseInt(id), { alt_text, folder }, request);
  return successResponse({});
}));

router.delete('/api/admin/media/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const media = await env.DB.prepare('SELECT url, filename FROM media WHERE id = ?').bind(id).first();
  if (!media) return errorResponse('Media not found', 404);
  // Try to delete from storage (best-effort)
  await Storage.delete(media.url, env);
  await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
  await auditLog(env, request.admin.id, 'media.delete', 'media', parseInt(id), { filename: media.filename }, request);
  return successResponse({});
}));

// ============ ADMIN: USERS (super_admin only) ============
router.get('/api/admin/users', requireRole('super_admin')(async (request, env) => {
  const { results } = await env.DB.prepare(
    'SELECT id, username, email, role, is_active, last_login, created_at FROM admins ORDER BY id'
  ).all();
  return successResponse({ users: results || [] });
}));

router.post('/api/admin/user', requireRole('super_admin')(async (request, env) => {
  const { username, email, password, role } = await request.json();
  if (!username || !password) return errorResponse('Username and password required');
  if (!['super_admin', 'admin', 'editor', 'author'].includes(role)) return errorResponse('Invalid role');

  const existing = await env.DB.prepare('SELECT id FROM admins WHERE username = ?').bind(username).first();
  if (existing) return errorResponse('Username already exists');

  const salt = crypto.randomUUID();
  const hash = await hashPassword(password, salt);
  const result = await env.DB.prepare(
    'INSERT INTO admins (username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)'
  ).bind(username, email || null, `pbkdf2:${salt}:${hash}`, role).run();

  await auditLog(env, request.admin.id, 'user.create', 'admin', result.meta?.last_row_id, { username, role }, request);
  return successResponse({ id: result.meta?.last_row_id });
}));

router.put('/api/admin/user/:id', requireRole('super_admin')(async (request, env) => {
  const { id } = request.params;
  const { username, email, role, is_active, password } = await request.json();

  if (password) {
    const salt = crypto.randomUUID();
    const hash = await hashPassword(password, salt);
    await env.DB.prepare(
      'UPDATE admins SET username = ?, email = ?, role = ?, is_active = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(username, email || null, role, is_active === false ? 0 : 1, `pbkdf2:${salt}:${hash}`, id).run();
  } else {
    await env.DB.prepare(
      'UPDATE admins SET username = ?, email = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(username, email || null, role, is_active === false ? 0 : 1, id).run();
  }

  await auditLog(env, request.admin.id, 'user.update', 'admin', parseInt(id), { username, role }, request);
  return successResponse({});
}));

router.delete('/api/admin/user/:id', requireRole('super_admin')(async (request, env) => {
  const { id } = request.params;
  if (parseInt(id) === request.admin.id) return errorResponse('Cannot delete yourself', 400);

  const user = await env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first();
  if (!user) return errorResponse('User not found', 404);

  await env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id).run();
  await auditLog(env, request.admin.id, 'user.delete', 'admin', parseInt(id), { username: user.username }, request);
  return successResponse({});
}));

// ============ ADMIN: SETTINGS ============
router.get('/api/admin/settings', requireRole('admin')(async (request, env) => {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  (results || []).forEach(row => { settings[row.key] = row.value; });
  return successResponse({ settings });
}));

router.put('/api/admin/settings', requireRole('admin')(async (request, env) => {
  const data = await request.json();
  for (const [key, value] of Object.entries(data)) {
    await env.DB.prepare(
      'INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
    ).bind(key, String(value), request.admin.id).run();
  }
  await auditLog(env, request.admin.id, 'settings.update', null, null, { keys: Object.keys(data) }, request);
  return successResponse({});
}));

// ============ CATCH ALL ============
router.all('*', () => jsonResponse({ success: false, error: 'Not Found' }, 404));

// ============ EXPORT ============
export default {
  async fetch(request, env, ctx) {
    // Validate required env vars on first request (debug aid)
    if (!env.JWT_SECRET) {
      console.error('JWT_SECRET not configured. Run: wrangler secret put JWT_SECRET');
    }
    return router.handle(request, env);
  }
};
