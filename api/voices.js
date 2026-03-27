const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = await fetchJSON('api.elevenlabs.io', '/v1/voices', {
      'xi-api-key': process.env.ELEVENLABS_API_KEY
    });
    const voices = data.voices.map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender || 'unknown',
      accent: v.labels?.accent || 'unknown',
      age: v.labels?.age || 'unknown',
      use_case: v.labels?.use_case || 'unknown',
      descriptive: v.labels?.descriptive || '',
      description: v.description || '',
      preview_url: v.preview_url,
      labels: v.labels || {}
    }));
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function fetchJSON(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    https.request({ hostname, path, method: 'GET', headers: { ...headers, 'Content-Type': 'application/json' } }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(new Error('Invalid JSON response')); }
      });
    }).on('error', reject).end();
  });
}
