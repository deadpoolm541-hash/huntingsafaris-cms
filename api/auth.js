const crypto = require('crypto');

module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured in environment' });
  }

  // Constant-time comparison to prevent timing attacks
  const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
  const storedHash = crypto.createHash('sha256').update(adminPassword).digest('hex');

  if (crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash))) {
    // Generate a simple session token
    const token = crypto.randomBytes(32).toString('hex');

    // Store token hash in memory (resets on cold start — fine for single admin)
    if (!global._adminTokens) global._adminTokens = new Set();
    global._adminTokens.add(crypto.createHash('sha256').update(token).digest('hex'));

    // Auto-expire after 24 hours
    setTimeout(() => {
      global._adminTokens.delete(crypto.createHash('sha256').update(token).digest('hex'));
    }, 24 * 60 * 60 * 1000);

    return res.status(200).json({ token });
  }

  return res.status(401).json({ error: 'Invalid password' });
};
