const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const TARGET = 'http://174.116.95.195:1234';
const app = express();

app.use((req, res, next) => {
  // Allow all origins for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/v1', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  logLevel: 'warn',
  onProxyReq(proxyReq, req, res) {
    // leave auth headers untouched
  },
  onError(err, req, res) {
    console.error('Proxy error', err);
    res.status(502).send('Bad gateway');
  },
}));

const port = process.env.PORT || 5173;
app.listen(port, () => console.log(`Proxy listening on http://localhost:${port} -> ${TARGET}`));
