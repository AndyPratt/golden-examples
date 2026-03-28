const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentType = req.query.content_type || 'image/png';
  const asTalkingPhoto = req.query.as_talking_photo === 'true';

  // Collect raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  try {
    // Upload as talking photo (for character images) or as regular asset (for audio)
    const uploadPath = asTalkingPhoto ? '/v1/talking_photo' : '/v1/asset';
    const result = await heygenUpload(buffer, contentType, uploadPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function heygenUpload(buffer, contentType, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'upload.heygen.com',
      path,
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Content-Type': contentType,
        'Content-Length': buffer.length
      }
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('HeyGen upload error: ' + raw)); }
      });
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}
