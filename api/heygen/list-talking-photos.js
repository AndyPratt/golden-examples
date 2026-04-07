const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await heygenGet('/v1/talking_photo.list');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function heygenGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.heygen.com',
      path,
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Accept': 'application/json'
      }
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`HeyGen returned non-JSON (HTTP ${resp.statusCode}): ${raw.substring(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}
