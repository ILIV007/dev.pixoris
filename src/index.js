// Pixoris CMS Worker API v2.1 — Production Ready
// Fixes: Secure JWT (Web Crypto HMAC-SHA256), password hashing, Products API, synced schema
import { Router } from './router.js';

const encoder = new TextEncoder();

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

const hashPassword = async (password, salt) => {
  const data = encoder.encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(hash);
};

const signJWT = async (payload, secret) => {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400
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

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
});

const errorResponse = (message, status = 400) => jsonResponse({ success: false, error: message }, status);

const getAuth = async (request, secret) => {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), secret);
};

const uploadToGitHub = async (filename, base64Content, token, repo, branch) => {
  const path = `assets/uploads/${filename}`;
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const checkRes = await fetch(url + `?ref=${branch}`, {
    headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  let sha = null;
  if (checkRes.status === 200) { const existing = await checkRes.json(); sha = existing.sha; }
  const body = { message: `Upload ${filename} via Pixoris CMS`, content: base64Content, branch, ...(sha && { sha }) };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`GitHub upload failed: ${err}`); }
  const data = await res.json();
  return data.content.download_url;
};

const router = new Router();

// ============ PUBLIC ROUTES ============
router.get('/api/health', () => jsonResponse({ status: 'ok', version: '2.1' }));

router.get('/api/posts', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const featured = searchParams.get('featured');
  const limit = parseInt(searchParams.get('limit')) || 50;
  const offset = parseInt(searchParams.get('offset')) || 0;
  let sql = `SELECT p.*, c.name as category_name, c.slug as category_slug, c.color as category_color FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.published = 1`;
  const params = [];
  if (category) { sql += ' AND c.slug = ?'; params.push(category); }
  if (featured === '1') sql += ' AND p.featured = 1';
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return jsonResponse({ success: true, posts: results || [] });
});

router.get('/api/post/:slug', async (request, env) => {
  const { slug } = request.params;
  const { results } = await env.DB.prepare(`SELECT p.*, c.name as category_name, c.slug as category_slug, c.color as category_color FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ? AND p.published = 1`).bind(slug).all();
  if (!results || results.length === 0) return errorResponse('Post not found', 404);
  await env.DB.prepare('UPDATE posts SET views = views + 1 WHERE slug = ?').bind(slug).run();
  const tagsResult = await env.DB.prepare(`SELECT t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?`).bind(results[0].id).all();
  return jsonResponse({ success: true, post: { ...results[0], tags: tagsResult.results || [] } });
});

router.get('/api/categories', async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  return jsonResponse({ success: true, categories: results || [] });
});

router.get('/api/featured', async (request, env) => {
  const { results } = await env.DB.prepare(`SELECT p.*, c.name as category_name, c.slug as category_slug, c.color as category_color FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.featured = 1 AND p.published = 1 ORDER BY p.created_at DESC LIMIT 6`).all();
  return jsonResponse({ success: true, posts: results || [] });
});

router.get('/api/search', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  if (!q || q.length < 2) return jsonResponse({ success: true, posts: [] });
  const { results } = await env.DB.prepare(`SELECT p.*, c.name as category_name, c.slug as category_slug FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.published = 1 AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?) ORDER BY p.created_at DESC LIMIT 20`).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return jsonResponse({ success: true, posts: results || [] });
});

// ============ PRODUCTS API ============
router.get('/api/products', async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order, id').all();
  return jsonResponse({ success: true, products: results || [] });
});

router.get('/api/product/:slug', async (request, env) => {
  const { slug } = request.params;
  const { results } = await env.DB.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').bind(slug).all();
  if (!results || results.length === 0) return errorResponse('Product not found', 404);
  return jsonResponse({ success: true, product: results[0] });
});

// ============ ADMIN AUTH ============
router.post('/api/admin/login', async (request, env) => {
  const { username, password } = await request.json();
  if (!username || !password) return errorResponse('Username and password required');
  const { results } = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).all();
  if (!results || results.length === 0) return errorResponse('Invalid credentials', 401);
  const admin = results[0];

  let passwordValid = false;
  if (admin.password_hash.startsWith('sha256:')) {
    const [, salt, hash] = admin.password_hash.split(':');
    const inputHash = await hashPassword(password, salt);
    passwordValid = inputHash === hash;
  } else {
    passwordValid = admin.password_hash === password;
  }

  if (!passwordValid) return errorResponse('Invalid credentials', 401);

  // Migrate legacy password to hashed
  if (!admin.password_hash.startsWith('sha256:')) {
    const newSalt = crypto.randomUUID();
    const newHash = await hashPassword(password, newSalt);
    await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(`sha256:${newSalt}:${newHash}`, admin.id).run();
  }

  const token = await signJWT({ id: admin.id, username: admin.username, role: admin.role }, env.JWT_SECRET);
  return jsonResponse({ success: true, token, admin: { id: admin.id, username: admin.username, role: admin.role } });
});

const adminAuth = (handler) => async (request, env) => {
  const auth = await getAuth(request, env.JWT_SECRET);
  if (!auth) return errorResponse('Unauthorized', 401);
  request.admin = auth;
  return handler(request, env);
};

// ============ ADMIN POSTS ============
router.get('/api/admin/posts', adminAuth(async (request, env) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  let sql = `SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id`;
  if (status === 'published') sql += ' WHERE p.published = 1';
  else if (status === 'draft') sql += ' WHERE p.published = 0';
  sql += ' ORDER BY p.updated_at DESC';
  const { results } = await env.DB.prepare(sql).all();
  return jsonResponse({ success: true, posts: results || [] });
}));

router.get('/api/admin/post/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { results } = await env.DB.prepare(`SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?`).bind(id).all();
  if (!results || results.length === 0) return errorResponse('Post not found', 404);
  const tagsResult = await env.DB.prepare(`SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?`).bind(id).all();
  return jsonResponse({ success: true, post: { ...results[0], tags: tagsResult.results || [] } });
}));

router.post('/api/admin/post', adminAuth(async (request, env) => {
  const data = await request.json();
  const { title, slug, excerpt, content, image_url, category_id, featured, published, tags } = data;
  if (!title || !slug || !content) return errorResponse('Title, slug and content are required');
  const existing = await env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).all();
  if (existing.results && existing.results.length > 0) return errorResponse('Slug already exists');
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO posts (title, slug, excerpt, content, image_url, category_id, featured, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(title, slug, excerpt || '', content, image_url || '', category_id || null, featured ? 1 : 0, published ? 1 : 0, now, now).run();
  const postId = result.meta?.last_row_id;
  if (tags && tags.length > 0 && postId) {
    for (const tagName of tags) {
      const tagSlug = tagName.toLowerCase().replace(/\s+/g, '-');
      await env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(tagName, tagSlug).run();
      const tagResult = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(tagSlug).all();
      if (tagResult.results && tagResult.results[0]) {
        await env.DB.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagResult.results[0].id).run();
      }
    }
  }
  return jsonResponse({ success: true, id: postId, message: 'Post created successfully' });
}));

router.put('/api/admin/post/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const data = await request.json();
  const { title, slug, excerpt, content, image_url, category_id, featured, published, tags } = data;
  if (!title || !slug || !content) return errorResponse('Title, slug and content are required');
  const existing = await env.DB.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').bind(slug, id).all();
  if (existing.results && existing.results.length > 0) return errorResponse('Slug already exists');
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE posts SET title = ?, slug = ?, excerpt = ?, content = ?, image_url = ?, category_id = ?, featured = ?, published = ?, updated_at = ? WHERE id = ?`).bind(title, slug, excerpt || '', content, image_url || '', category_id || null, featured ? 1 : 0, published ? 1 : 0, now, id).run();
  if (tags && tags.length > 0) {
    await env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
    for (const tagName of tags) {
      const tagSlug = tagName.toLowerCase().replace(/\s+/g, '-');
      await env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(tagName, tagSlug).run();
      const tagResult = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(tagSlug).all();
      if (tagResult.results && tagResult.results[0]) {
        await env.DB.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(id, tagResult.results[0].id).run();
      }
    }
  }
  return jsonResponse({ success: true, message: 'Post updated successfully' });
}));

router.delete('/api/admin/post/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  await env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true, message: 'Post deleted successfully' });
}));

// ============ ADMIN CATEGORIES ============
router.get('/api/admin/categories', adminAuth(async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  return jsonResponse({ success: true, categories: results || [] });
}));

router.post('/api/admin/category', adminAuth(async (request, env) => {
  const { name, slug, color, sort_order } = await request.json();
  if (!name || !slug) return errorResponse('Name and slug required');
  const result = await env.DB.prepare('INSERT INTO categories (name, slug, color, sort_order) VALUES (?, ?, ?, ?)').bind(name, slug, color || '#4ee5ff', sort_order || 0).run();
  return jsonResponse({ success: true, id: result.meta?.last_row_id });
}));

router.put('/api/admin/category/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { name, slug, color, sort_order } = await request.json();
  await env.DB.prepare('UPDATE categories SET name = ?, slug = ?, color = ?, sort_order = ? WHERE id = ?').bind(name, slug, color, sort_order, id).run();
  return jsonResponse({ success: true });
}));

router.delete('/api/admin/category/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true });
}));

// ============ ADMIN PRODUCTS ============
router.get('/api/admin/products', adminAuth(async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY sort_order, id').all();
  return jsonResponse({ success: true, products: results || [] });
}));

router.post('/api/admin/product', adminAuth(async (request, env) => {
  const { title, slug, description, price, image_url, category, featured, active, sort_order } = await request.json();
  if (!title || !slug) return errorResponse('Title and slug required');
  const result = await env.DB.prepare('INSERT INTO products (title, slug, description, price, image_url, category, featured, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(title, slug, description || '', price || 0, image_url || '', category || '', featured ? 1 : 0, active ? 1 : 1, sort_order || 0).run();
  return jsonResponse({ success: true, id: result.meta?.last_row_id });
}));

router.put('/api/admin/product/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  const { title, slug, description, price, image_url, category, featured, active, sort_order } = await request.json();
  await env.DB.prepare('UPDATE products SET title = ?, slug = ?, description = ?, price = ?, image_url = ?, category = ?, featured = ?, active = ?, sort_order = ? WHERE id = ?').bind(title, slug, description, price, image_url, category, featured ? 1 : 0, active ? 1 : 1, sort_order || 0, id).run();
  return jsonResponse({ success: true });
}));

router.delete('/api/admin/product/:id', adminAuth(async (request, env) => {
  const { id } = request.params;
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true });
}));

// ============ ADMIN STATS ============
router.get('/api/admin/stats', adminAuth(async (request, env) => {
  const postsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM posts').first();
  const publishedCount = await env.DB.prepare('SELECT COUNT(*) as count FROM posts WHERE published = 1').first();
  const draftCount = await env.DB.prepare('SELECT COUNT(*) as count FROM posts WHERE published = 0').first();
  const categoriesCount = await env.DB.prepare('SELECT COUNT(*) as count FROM categories').first();
  const productsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM products').first();
  const totalViews = await env.DB.prepare('SELECT SUM(views) as count FROM posts').first();
  return jsonResponse({ success: true, stats: { totalPosts: postsCount?.count || 0, published: publishedCount?.count || 0, drafts: draftCount?.count || 0, categories: categoriesCount?.count || 0, products: productsCount?.count || 0, totalViews: totalViews?.count || 0 } });
}));

// ============ ADMIN MEDIA ============
router.post('/api/admin/upload', adminAuth(async (request, env) => {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('No file uploaded');
  const bytes = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  try {
    const url = await uploadToGitHub(filename, base64, env.GITHUB_TOKEN, env.GITHUB_REPO, env.GITHUB_BRANCH);
    await env.DB.prepare('INSERT INTO media (filename, url, size, mime_type) VALUES (?, ?, ?, ?)').bind(filename, url, bytes.byteLength, file.type).run();
    return jsonResponse({ success: true, url, filename });
  } catch (err) { return errorResponse(err.message, 500); }
}));

router.get('/api/admin/media', adminAuth(async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM media ORDER BY uploaded_at DESC').all();
  return jsonResponse({ success: true, media: results || [] });
}));

// ============ CATCH ALL ============
router.all('*', () => jsonResponse({ error: 'Not Found' }, 404));

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env);
  }
};