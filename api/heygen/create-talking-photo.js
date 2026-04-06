const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });

  const attempts = [];

  // Attempt 1: POST /v2/talking_photo (v2 API - most likely what the dashboard uses)
  try {
    const result = await heygenRequest('api.heygen.com', '/v2/talking_photo', {
      image_url: imageUrl
    });
    if (result.data?.talking_photo_id || result.data?.id) {
      return res.json(result);
    }
    attempts.push({ endpoint: '/v2/talking_photo', result });
  } catch (err) {
    attempts.push({ endpoint: '/v2/talking_photo', error: err.message });
  }

  // Attempt 2: POST /v1/talking_photo with JSON body (not binary upload)
  try {
    const result = await heygenRequest('api.heygen.com', '/v1/talking_photo', {
      image_url: imageUrl
    });
    if (result.data?.talking_photo_id || result.data?.id) {
      return res.json(result);
    }
    attempts.push({ endpoint: '/v1/talking_photo', result });
  } catch (err) {
    attempts.push({ endpoint: '/v1/talking_photo', error: err.message });
  }

  // Attempt 3: POST /v1/talking_photo.create (older endpoint)
  try {
    const result = await heygenRequest('api.heygen.com', '/v1/talking_photo.create', {
      image_url: imageUrl
    });
    if (result.data?.talking_photo_id || result.data?.id) {
      return res.json(result);
    }
    attempts.push({ endpoint: '/v1/talking_photo.create', result });
  } catch (err) {
    attempts.push({ endpoint: '/v1/talking_photo.create', error: err.message });
  }

  // All attempts failed — return details for debugging
  res.status(500).json({
    error: 'All talking photo creation endpoints failed',
    attempts
  });
};

function heygenRequest(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`HeyGen non-JSON (HTTP ${resp.statusCode}): ${raw.substring(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
