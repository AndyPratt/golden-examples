const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;

// Load API key from .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const API_KEY = envContent.match(/ELEVENLABS_API_KEY=(.*)/)?.[1]?.trim();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve generated audio files
app.use('/audio', express.static(path.join(__dirname, 'output')));

// Get available voices from ElevenLabs
app.get('/api/voices', async (req, res) => {
  try {
    const data = await elevenLabsRequest('/v1/voices', 'GET');
    const voices = data.voices.map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender || 'unknown',
      accent: v.labels?.accent || 'unknown',
      preview_url: v.preview_url
    }));
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate audio for a script
app.post('/api/generate', async (req, res) => {
  const { lines, characterVoiceId, userVoiceId, projectName } = req.body;

  if (!lines || !characterVoiceId || !userVoiceId || !projectName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const outputDir = path.join(__dirname, 'output', projectName);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const voiceId = line.speaker === 'CHARACTER' ? characterVoiceId : userVoiceId;
    const filename = `${String(i).padStart(3, '0')}_${line.speaker.toLowerCase()}.mp3`;
    const filepath = path.join(outputDir, filename);

    try {
      const audioBuffer = await generateSpeech(voiceId, line.text);
      fs.writeFileSync(filepath, audioBuffer);
      results.push({
        index: i,
        speaker: line.speaker,
        text: line.text,
        audioUrl: `/audio/${projectName}/${filename}`
      });
    } catch (err) {
      return res.status(500).json({ error: `Failed on line ${i}: ${err.message}` });
    }
  }

  res.json({ success: true, lines: results });
});

// Save character image
app.post('/api/upload-image', express.raw({ type: 'image/*', limit: '10mb' }), (req, res) => {
  const projectName = req.query.project;
  if (!projectName) return res.status(400).json({ error: 'Missing project name' });

  const outputDir = path.join(__dirname, 'output', projectName);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ext = req.headers['content-type']?.split('/')[1] || 'png';
  const filepath = path.join(outputDir, `character.${ext}`);
  fs.writeFileSync(filepath, req.body);
  res.json({ imageUrl: `/audio/${projectName}/character.${ext}` });
});

function elevenLabsRequest(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: endpoint,
      method,
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try {
          resolve(JSON.parse(raw.toString()));
        } catch {
          resolve(raw);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function generateSpeech(voiceId, text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: 'eleven_v2_flash',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          reject(new Error(`ElevenLabs API error ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        });
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

app.listen(PORT, () => {
  console.log(`Golden Examples app running at http://localhost:${PORT}`);
});
