const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  return verifyToken(token, process.env.ADMIN_PASSWORD);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const contentDir = path.join(process.cwd(), 'content');

  if (req.method === 'GET') {
    // GET /api/content?page=homepage
    const page = req.query.page;
    if (!page || !/^[a-z]+$/.test(page)) {
      return res.status(400).json({ error: 'Invalid page parameter' });
    }

    const filePath = path.join(contentDir, `${page}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return res.status(200).json(content);
  }

  if (req.method === 'PUT') {
    const page = req.query.page;
    if (!page || !/^[a-z]+$/.test(page)) {
      return res.status(400).json({ error: 'Invalid page parameter' });
    }

    const content = req.body;
    if (!content || typeof content !== 'object') {
      return res.status(400).json({ error: 'Invalid content body' });
    }

    const contentString = JSON.stringify(content, null, 2);
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;
    const isVercel = !!process.env.VERCEL;

    if (isVercel) {
      // On Vercel: filesystem is read-only — MUST use GitHub API
      if (!githubToken || !githubRepo) {
        return res.status(500).json({ error: 'GITHUB_TOKEN and GITHUB_REPO must be set on Vercel' });
      }
      try {
        await commitToGitHub(githubToken, githubRepo, `content/${page}.json`, contentString);
        return res.status(200).json({ success: true, committed: true });
      } catch (err) {
        console.error('GitHub commit failed:', err.message);
        return res.status(500).json({ error: 'GitHub commit failed: ' + err.message });
      }
    } else {
      // Local dev: write directly to filesystem
      const filePath = path.join(contentDir, `${page}.json`);
      fs.writeFileSync(filePath, contentString, 'utf-8');

      // Also commit to GitHub if configured locally
      if (githubToken && githubRepo) {
        commitToGitHub(githubToken, githubRepo, `content/${page}.json`, contentString)
          .catch(err => console.error('GitHub commit failed:', err.message));
      }
      return res.status(200).json({ success: true });
    }
  }


  return res.status(405).json({ error: 'Method not allowed' });
};

async function commitToGitHub(token, repo, filePath, content) {
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'UHS-CMS'
  };

  // Get current file SHA (needed for updates)
  let sha = null;
  try {
    const getRes = await fetch(apiBase, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (e) {
    // File doesn't exist yet — that's fine
  }

  const body = {
    message: `CMS: Update ${filePath}`,
    content: Buffer.from(content).toString('base64'),
    ...(sha ? { sha } : {})
  };

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub API error: ${putRes.status} ${errText}`);
  }
}
