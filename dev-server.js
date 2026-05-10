const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3457;
const DIST = path.join(__dirname, 'dist');

// Simple in-memory token store
global._adminTokens = new Set();

// Set admin password for local dev
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Import API handlers
const authHandler = require('./api/auth');
const contentHandler = require('./api/content');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain',
};

// Polyfill Vercel's Express-like req/res for our API handlers
function polyfillRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  return res;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { req.body = JSON.parse(body); } catch { req.body = {}; }
      resolve();
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = parsed.pathname;

  // Polyfill res for API routes
  polyfillRes(res);

  // API: Auth
  if (pathname === '/api/auth') {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).end();
    }
    await parseBody(req);
    req.query = parsed.query;
    return authHandler(req, res);
  }

  // API: Content
  if (pathname === '/api/content') {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(200).end();
    }
    await parseBody(req);
    req.query = parsed.query;
    return contentHandler(req, res);
  }

  // API: Upload
  if (pathname === '/api/upload') {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(200).end();
    }
    // Don't parse body - upload handler reads the raw stream itself
    req.query = parsed.query;
    const uploadHandler = require('./api/upload');
    return uploadHandler(req, res);
  }

  // Static files from dist/
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';
  if (pathname === '/') pathname = '/index.html';

  const STATIC = path.join(__dirname, 'static');

  // Try dist/ first, then static/ as fallback (for newly uploaded images)
  const candidates = [path.join(DIST, pathname), path.join(STATIC, pathname)];

  for (const filePath of candidates) {
    try {
      let targetPath = filePath;
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        targetPath = path.join(targetPath, 'index.html');
      }
      const ext = path.extname(targetPath);
      const content = fs.readFileSync(targetPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return res.end(content);
    } catch {
      continue; // Try next candidate
    }
  }

  res.writeHead(404);
  return res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n🟢 CMS Dev Server running at:`);
  console.log(`   Site:   http://localhost:${PORT}/`);
  console.log(`   Admin:  http://localhost:${PORT}/admin/`);
  console.log(`   Password: ${process.env.ADMIN_PASSWORD}\n`);
});
