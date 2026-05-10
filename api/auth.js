const crypto = require('crypto');

// Create an HMAC-signed token using the admin password as the secret.
// This works across stateless serverless functions — no shared memory needed.
function createToken(adminPassword) {
  const payload = Date.now().toString();
  const sig = crypto.createHmac('sha256', adminPassword).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token, adminPassword) {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    // Check signature
    const expected = crypto.createHmac('sha256', adminPassword).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    // Check expiry: 24 hours
    const age = Date.now() - parseInt(payload);
    return age < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

module.exports = (req, res) => {
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
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
  const storedHash = crypto.createHash('sha256').update(adminPassword).digest('hex');

  if (crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash))) {
    const token = createToken(adminPassword);
    return res.status(200).json({ token });
  }

  return res.status(401).json({ error: 'Invalid password' });
};

module.exports.verifyToken = verifyToken;
