const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { talkingPhotoId, audioUrls } = req.body;
  if (!talkingPhotoId || !audioUrls || !audioUrls.length) {
    return res.status(400).json({ error: 'Missing talkingPhotoId or audioUrls' });
  }

  // Build video inputs:
  // - CHARACTER lines: animated talking photo with audio
  // - USER lines: silent/idle character for the duration of the user audio
  const videoInputs = audioUrls.map(item => {
    if (item.speaker === 'CHARACTER') {
      return {
        character: {
          type: 'talking_photo',
          talking_photo_id: talkingPhotoId
        },
        voice: {
          type: 'audio',
          audio_url: item.url
        }
      };
    } else {
      // User line: character stays idle, we'll overlay user audio in the player
      return {
        character: {
          type: 'talking_photo',
          talking_photo_id: talkingPhotoId
        },
        voice: {
          type: 'silence',
          duration: item.duration || 3
        }
      };
    }
  });

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
