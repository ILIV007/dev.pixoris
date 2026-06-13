// Simple Router for Cloudflare Workers
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
  delete(pattern, handler) { this._addRoute('DELETE', pattern, handler); }
  all(pattern, handler) { this._addRoute('*', pattern, handler); }

  async handle(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        try { return await route.handler(request, env); }
        catch (err) {
          return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
