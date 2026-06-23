// Simple Router for Cloudflare Workers v2.2
// Supports: GET, POST, PUT, DELETE, PATCH, OPTIONS, wildcard "*"
export class Router {
  constructor() { this.routes = []; }

  _addRoute(method, pattern, handler) {
    const paramNames = [];
    let regexPattern = pattern
      .replace(/:([^/]+)/g, (match, name) => { paramNames.push(name); return '([^/]+)'; })
      .replace(/\*/g, '.*');
    regexPattern = '^' + regexPattern + '$';
    this.routes.push({ method: method.toUpperCase(), pattern: new RegExp(regexPattern), paramNames, handler });
  }

  get(pattern, handler) { this._addRoute('GET', pattern, handler); }
  post(pattern, handler) { this._addRoute('POST', pattern, handler); }
  put(pattern, handler) { this._addRoute('PUT', pattern, handler); }
  patch(pattern, handler) { this._addRoute('PATCH', pattern, handler); }
  delete(pattern, handler) { this._addRoute('DELETE', pattern, handler); }
  all(pattern, handler) { this._addRoute('*', pattern, handler); }

  async handle(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    for (const route of this.routes) {
      if (route.method !== '*' && route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
        request.params = params;
        try {
          return await route.handler(request, env);
        } catch (err) {
          console.error('Route handler error:', err);
          return new Response(JSON.stringify({ success: false, error: err.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Not Found', path: pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
