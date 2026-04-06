const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { talkingPhotoId, mergedAudioUrl } = req.body;
  if (!talkingPhotoId || !mergedAudioUrl) {
    return res.status(400).json({ error: 'Missing talkingPhotoId or mergedAudioUrl' });
  }

  // talking_style: "stable" = classic mode, works with all talking photos including non-human
  // (default/expressive = "unlimited mode" which only works with human faces)
  const videoInputs = [{
    character: {
      type: 'talking_photo',
      talking_photo_id: talkingPhotoId,
      talking_style: 'stable'
    },
    voice: {
      type: 'audio',
      audio_url: mergedAudioUrl
    }
  }];

  try {
    const result = await heygenRequest('/v2/video/generate', {
      video_inputs: videoInputs,
      dimension: { width: 720, height: 1280 }
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
        const raw = Buffer.concat(chunks).toString();
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch {
          reject(new Error(`HeyGen returned non-JSON (HTTP ${resp.statusCode}): ${raw.substring(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
