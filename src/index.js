// Pixoris CMS Worker API v2.0
import { Router } from './router.js';

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

const encodeBase64 = (str) => btoa(str);
const decodeBase64 = (str) => atob(str);

const signJWT = (payload, secret) => {
  const header = encodeBase64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = encodeBase64(JSON.stringify({ ...payload, exp: Date.now() + 86400000 }));
  const signature = encodeBase64(header + '.' + body + secret);
  return `${header}.${body}.${signature}`;
};

const verifyJWT = (token, secret) => {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const expected = encodeBase64(header + '.' + body + secret);
    if (signature !== expected) return null;
    const payload = JSON.parse(decodeBase64(body));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
};

const getAuth = (request) => {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), JWT_SECRET);
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

router.get('/api/health', () => jsonResponse({ status: 'ok', version: '2.0' }));

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

router.post('/api/admin/login', async (request, env) => {
  const { username, password } = await request.json();
  if (!username || !password) return errorResponse('Username and password required');
  const { results } = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).all();
  if (!results || results.length === 0) return errorResponse('Invalid credentials', 401);
  const admin = results[0];
  if (admin.password_hash !== password) return errorResponse('Invalid credentials', 401);
  const token = signJWT({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET);
  return jsonResponse({ success: true, token, admin: { id: admin.id, username: admin.username, role: admin.role } });
});

const adminAuth = (handler) => async (request, env) => {
  const auth = getAuth(request);
  if (!auth) return errorResponse('Unauthorized', 401);
  request.admin = auth;
  return handler(request, env);
};

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

router.get('/api/admin/stats', adminAuth(async (request, env) => {
  const postsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM posts').first();
  const publishedCount = await env.DB.prepare('SELECT COUNT(*) as count FROM posts WHERE published = 1').first();
  const draftCount = await env.DB.prepare('SELECT COUNT(*) as count FROM posts WHERE published = 0').first();
  const categoriesCount = await env.DB.prepare('SELECT COUNT(*) as count FROM categories').first();
  const totalViews = await env.DB.prepare('SELECT SUM(views) as count FROM posts').first();
  return jsonResponse({ success: true, stats: { totalPosts: postsCount?.count || 0, published: publishedCount?.count || 0, drafts: draftCount?.count || 0, categories: categoriesCount?.count || 0, totalViews: totalViews?.count || 0 } });
}));

router.post('/api/admin/upload', adminAuth(async (request, env) => {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('No file uploaded');
  const bytes = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  try {
    const url = await uploadToGitHub(filename, base64, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH);
    await env.DB.prepare('INSERT INTO media (filename, url, size, mime_type) VALUES (?, ?, ?, ?)').bind(filename, url, bytes.byteLength, file.type).run();
    return jsonResponse({ success: true, url, filename });
  } catch (err) { return errorResponse(err.message, 500); }
}));

router.get('/api/admin/media', adminAuth(async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM media ORDER BY uploaded_at DESC').all();
  return jsonResponse({ success: true, media: results || [] });
}));

router.all('*', () => jsonResponse({ error: 'Not Found' }, 404));

export default {
  async fetch(request, env, ctx) {
    globalThis.JWT_SECRET = env.JWT_SECRET || 'pixoris-default-secret';
    globalThis.GITHUB_TOKEN = env.GITHUB_TOKEN;
    globalThis.GITHUB_REPO = env.GITHUB_REPO || 'ILIV007/Pixoris';
    globalThis.GITHUB_BRANCH = env.GITHUB_BRANCH || 'main';
    return router.handle(request, env);
  }
};
