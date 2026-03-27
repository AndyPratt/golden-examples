const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { photoAvatarId, audioUrls } = req.body;
  if (!photoAvatarId || !audioUrls || !audioUrls.length) {
    return res.status(400).json({ error: 'Missing photoAvatarId or audioUrls' });
  }

  // Build video inputs - one segment per audio clip
  const videoInputs = audioUrls.map(item => ({
    character: {
      type: 'photo_avatar',
      photo_avatar_id: photoAvatarId
    },
    voice: {
      type: 'audio',
      input_audio: item.url
    }
  }));

  try {
    const result = await heygenRequest('/v2/video/generate', {
      video_inputs: videoInputs,
      dimension: { width: 1280, height: 720 }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function heygenRequest(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.heygen.com',
      path,
      method: 'POST',
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
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
