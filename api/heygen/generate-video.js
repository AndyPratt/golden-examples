const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { talkingPhotoId, mergedAudioUrl } = req.body;
  if (!talkingPhotoId || !mergedAudioUrl) {
    return res.status(400).json({ error: 'Missing talkingPhotoId or mergedAudioUrl' });
  }

  try {
    // Try v1 API first — uses classic/stable mode by default, no Avatar IV
    const v1Result = await heygenRequest('/v1/video.generate', {
      background: '#000000',
      clips: [{
        avatar_id: talkingPhotoId,
        input_audio: mergedAudioUrl,
        scale: 1,
        offset: { x: 0, y: 0 }
      }],
      dimension: { width: 720, height: 1280 }
    });

    // If v1 succeeded (has video_id), return it
    if (v1Result.data?.video_id) {
      return res.json(v1Result);
    }

    // If v1 failed, try v2 with stable/classic mode settings
    const v2Result = await heygenRequest('/v2/video/generate', {
      video_inputs: [{
        character: {
          type: 'talking_photo',
          talking_photo_id: talkingPhotoId,
          talking_style: 'stable',
          use_avatar_iv_model: false
        },
        voice: {
          type: 'audio',
          audio_url: mergedAudioUrl
        }
      }],
      dimension: { width: 720, height: 1280 }
    });

    res.json(v2Result);
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
