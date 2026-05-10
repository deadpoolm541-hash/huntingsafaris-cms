const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return global._adminTokens && global._adminTokens.has(tokenHash);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Parse multipart form data manually for Vercel serverless
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Extract boundary from content-type
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);

    if (!boundaryMatch) {
      return res.status(400).json({ error: 'Missing multipart boundary' });
    }

    const boundary = boundaryMatch[1];
    const parts = parseMultipart(buffer, boundary);

    if (!parts.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, data } = parts.file;
    const targetDir = parts.directory || 'photo_gallery';

    // Validate directory - prevent path traversal
    if (!/^[a-zA-Z0-9_/-]+$/.test(targetDir)) {
      return res.status(400).json({ error: 'Invalid directory path' });
    }

    // Convert to WebP using sharp
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      // If sharp isn't available, save as-is
      const outputDir = path.join(process.cwd(), 'static', targetDir);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(outputDir, filename);
      fs.writeFileSync(outputPath, data);

      return res.status(200).json({
        success: true,
        path: `${targetDir}/${filename}`,
        format: path.extname(filename).slice(1)
      });
    }

    const baseName = path.basename(filename, path.extname(filename));
    const webpFilename = `${baseName}.webp`;
    const blurFilename = `${baseName}_blur.webp`;

    const outputDir = path.join(process.cwd(), 'static', targetDir);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Convert to high-quality WebP
    await sharp(data)
      .webp({ quality: 82 })
      .toFile(path.join(outputDir, webpFilename));

    // Generate blur placeholder
    await sharp(data)
      .resize(40) // Tiny size for blur placeholder
      .webp({ quality: 20 })
      .toFile(path.join(outputDir, blurFilename));

    // If GitHub integration is configured, commit the images
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;

    if (githubToken && githubRepo) {
      const webpData = fs.readFileSync(path.join(outputDir, webpFilename));
      const blurData = fs.readFileSync(path.join(outputDir, blurFilename));

      await commitFileToGitHub(githubToken, githubRepo, `static/${targetDir}/${webpFilename}`, webpData);
      await commitFileToGitHub(githubToken, githubRepo, `static/${targetDir}/${blurFilename}`, blurData);
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
  const parts = [];
  let start = buffer.indexOf(boundaryBuf) + boundaryBuf.length;

  while (true) {
    const nextBoundary = buffer.indexOf(boundaryBuf, start);
    if (nextBoundary === -1) break;

    const part = buffer.slice(start, nextBoundary);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = nextBoundary + boundaryBuf.length; continue; }

    const headers = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4, part.length - 2); // Remove trailing \r\n

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
    if (getRes.ok) {
      const d = await getRes.json();
      sha = d.sha;
    }
  } catch (e) { /* file doesn't exist yet */ }

  const body = {
    message: `CMS: Upload ${path.basename(filePath)}`,
    content: data.toString('base64'),
    ...(sha ? { sha } : {})
  };

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    throw new Error(`GitHub upload failed: ${putRes.status}`);
  }
}
