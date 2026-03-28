const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Fetch user's own voices and shared voice library in parallel
    const [ownData, sharedData] = await Promise.all([
      fetchJSON('api.elevenlabs.io', '/v1/voices', {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }),
      fetchJSON('api.elevenlabs.io', '/v1/shared-voices?page_size=100&sort=trending', {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      })
    ]);

    const mapVoice = v => ({
      voice_id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender || v.gender || 'unknown',
      accent: v.labels?.accent || v.accent || 'unknown',
      age: v.labels?.age || v.age || 'unknown',
      use_case: v.labels?.use_case || v.use_case || 'unknown',
      descriptive: v.labels?.descriptive || v.descriptive || '',
      description: v.description || '',
      preview_url: v.preview_url,
      labels: v.labels || {}
    });

    const ownVoices = (ownData.voices || []).map(mapVoice);
    const sharedVoices = (sharedData.voices || []).map(mapVoice);

    // Deduplicate by voice_id, own voices first
    const seen = new Set();
    const all = [];
    for (const v of [...ownVoices, ...sharedVoices]) {
      if (!seen.has(v.voice_id)) {
        seen.add(v.voice_id);
        all.push(v);
      }
    }

    res.json(all);
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
