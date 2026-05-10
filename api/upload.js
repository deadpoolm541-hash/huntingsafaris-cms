const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return verifyToken(auth.slice(7), process.env.ADMIN_PASSWORD);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Read raw body into memory
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'Missing multipart boundary' });

    const parts = parseMultipart(buffer, boundaryMatch[1]);
    if (!parts.file) return res.status(400).json({ error: 'No file uploaded' });

    const { filename, data } = parts.file;
    const targetDir = (parts.directory || 'photo_gallery').replace(/[^a-zA-Z0-9_\-/]/g, '');
    const baseName = path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const webpFilename = `${baseName}.webp`;
    const blurFilename = `${baseName}_blur.webp`;

    const isVercel = !!process.env.VERCEL;
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;

    // Convert to WebP entirely in memory — no disk writes
    let webpBuffer, blurBuffer;
    try {
      const sharp = require('sharp');
      webpBuffer = await sharp(data).webp({ quality: 82 }).toBuffer();
      blurBuffer = await sharp(data).resize(40).webp({ quality: 20 }).toBuffer();
    } catch (e) {
      // sharp unavailable — use original data
      webpBuffer = data;
      blurBuffer = data;
    }

    if (isVercel) {
      // Vercel: filesystem is read-only — commit directly to GitHub
      if (!githubToken || !githubRepo) {
        return res.status(500).json({ error: 'GITHUB_TOKEN and GITHUB_REPO must be set on Vercel' });
      }
      await commitFileToGitHub(githubToken, githubRepo, `static/${targetDir}/${webpFilename}`, webpBuffer);
      await commitFileToGitHub(githubToken, githubRepo, `static/${targetDir}/${blurFilename}`, blurBuffer);
    } else {
      // Local dev: write to static/ folder
      const outputDir = path.join(process.cwd(), 'static', targetDir);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, webpFilename), webpBuffer);
      fs.writeFileSync(path.join(outputDir, blurFilename), blurBuffer);

      if (githubToken && githubRepo) {
        commitFileToGitHub(githubToken, githubRepo, `static/${targetDir}/${webpFilename}`, webpBuffer).catch(console.error);
        commitFileToGitHub(githubToken, githubRepo, `static/${targetDir}/${blurFilename}`, blurBuffer).catch(console.error);
      }
    }

    return res.status(200).json({
      success: true,
      path: `${targetDir}/${webpFilename}`,
      blurPath: `${targetDir}/${blurFilename}`,
      format: 'webp'
    });

  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

function parseMultipart(buffer, boundary) {
  const result = {};
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(boundaryBuf) + boundaryBuf.length;

  while (true) {
    const nextBoundary = buffer.indexOf(boundaryBuf, start);
    if (nextBoundary === -1) break;

    const part = buffer.slice(start, nextBoundary);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = nextBoundary + boundaryBuf.length; continue; }

    const headers = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4, part.length - 2);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    if (nameMatch) {
      if (filenameMatch) {
        result.file = { filename: filenameMatch[1], data: body };
      } else {
        result[nameMatch[1]] = body.toString('utf-8').trim();
      }
    }

    start = nextBoundary + boundaryBuf.length;
  }

  return result;
}

async function commitFileToGitHub(token, repo, filePath, data) {
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'UHS-CMS'
  };

  let sha = null;
  try {
    const getRes = await fetch(apiBase, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;
  } catch (e) { /* file doesn't exist yet */ }

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `CMS: Upload ${path.basename(filePath)}`,
      content: Buffer.from(data).toString('base64'),
      ...(sha ? { sha } : {})
    })
  });

  if (!putRes.ok) {
    throw new Error(`GitHub upload failed: ${putRes.status} ${await putRes.text()}`);
  }
}
