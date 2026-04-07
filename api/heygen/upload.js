const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentType = req.query.content_type || 'image/png';

  // Collect raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Empty body — file may have been too large or not sent correctly' });
  }

  try {
    const asTalkingPhoto = req.query.as_talking_photo === 'true';
    const uploadPath = asTalkingPhoto ? '/v1/talking_photo' : '/v1/asset';
    const result = await heygenUpload(buffer, contentType, uploadPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, bufferSize: buffer.length, contentType, path: req.query.as_talking_photo === 'true' ? '/v1/talking_photo' : '/v1/asset' });
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
