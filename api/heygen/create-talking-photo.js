const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { storageKey } = req.body;
  if (!storageKey) return res.status(400).json({ error: 'Missing storageKey' });

  try {
    const result = await createTalkingPhoto(storageKey);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function createTalkingPhoto(storageKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ storage_key: storageKey });
    const req = https.request({
      hostname: 'api.heygen.com',
      path: '/v1/talking_photo.create',
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('HeyGen create talking photo error: ' + raw)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
