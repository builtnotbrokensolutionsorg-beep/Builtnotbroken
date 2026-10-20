// Runs an existing Vercel-style handler (req, res) as a Netlify Function.
// Lets the /api/*.js files stay exactly as they are.

export function adapt(handler) {
  return async (request) => {
    let body;
    const text = await request.text();
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }

    const req = {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body,
      query: Object.fromEntries(new URL(request.url).searchParams),
    };

    let statusCode = 200;
    const headers = {};
    let payload = null;

    const res = {
      status(code) { statusCode = code; return res; },
      setHeader(k, v) { headers[k] = v; return res; },
      json(obj) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(obj);
        return res;
      },
      send(data) {
        payload = typeof data === 'string' ? data : JSON.stringify(data);
        return res;
      },
      end(data) { if (data !== undefined) payload = data; return res; },
    };

    await handler(req, res);
    return new Response(payload, { status: statusCode, headers });
  };
}
