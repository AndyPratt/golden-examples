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
    https.request({
      hostname: 'api.heygen.com',
      path,
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Content-Type': 'application/json'
      }
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(new Error('Invalid response')); }
      });
    }).on('error', reject).end();
  });
}
