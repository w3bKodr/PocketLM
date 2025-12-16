const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEFAULT_TARGET = process.env.TARGET || 'http://174.116.95.195:1234';
const app = express();

// Basic CORS for all incoming requests (preflight + simple requests)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target');
  // short-circuit preflight
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Helper to resolve the target server for this request.
function resolveTarget(req) {
  const hdr = req.headers['x-target'];
  if (typeof hdr === 'string' && hdr.length > 0) return hdr;
  if (req.query && req.query.target) return String(req.query.target);
  return DEFAULT_TARGET;
}

// Proxy both OpenAI-compatible `/v1` paths and LM Studio REST `/api/v0` paths
app.use(['/v1', '/api/v0'], createProxyMiddleware({
  target: DEFAULT_TARGET,
  changeOrigin: true,
  logLevel: 'info',
  router: (req) => resolveTarget(req),
  onProxyReq(proxyReq, req, res) {
    // keep original headers like Authorization; nothing additional required here
  },
  onProxyRes(proxyRes, req, res) {
    // Ensure the proxied response also exposes CORS headers to the browser.
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,OPTIONS,PATCH';
    proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Target';
  },
  onError(err, req, res) {
    console.error('Proxy error', err && err.message ? err.message : err);
    // Ensure error responses include CORS so the browser can see them.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target');
    res.status(502).send('Bad gateway');
  },
}));

const port = process.env.PORT || 5173;
app.listen(port, () => console.log(`Proxy listening on http://localhost:${port} -> ${DEFAULT_TARGET}`));
