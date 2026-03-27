const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { voiceId, text } = req.body;
  if (!voiceId || !text) return res.status(400).json({ error: 'Missing voiceId or text' });

  try {
    const audioBuffer = await generateSpeech(voiceId, text);
    const base64 = audioBuffer.toString('base64');
    res.json({ audio: base64 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function generateSpeech(voiceId, text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: 'eleven_v2_flash',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    });

    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      }
    }, (resp) => {
      if (resp.statusCode !== 200) {
        const chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => reject(new Error(`ElevenLabs error ${resp.statusCode}: ${Buffer.concat(chunks).toString()}`)));
        return;
      }
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
