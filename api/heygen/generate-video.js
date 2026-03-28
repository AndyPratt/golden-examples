const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { talkingPhotoId, mergedAudioUrl } = req.body;
  if (!talkingPhotoId || !mergedAudioUrl) {
    return res.status(400).json({ error: 'Missing talkingPhotoId or mergedAudioUrl' });
  }

  // Single video input with merged audio = one seamless video, no cuts
  const videoInputs = [{
    character: {
      type: 'talking_photo',
      talking_photo_id: talkingPhotoId,
      use_avatar_iv_model: true,
      talking_style: 'expressive',
      super_resolution: true
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
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(new Error('Invalid response')); }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
