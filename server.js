const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;

// Load API keys from .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const ELEVENLABS_KEY = envContent.match(/ELEVENLABS_API_KEY=(.*)/)?.[1]?.trim();
const HEYGEN_KEY = envContent.match(/HEYGEN_API_KEY=(.*)/)?.[1]?.trim();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'output')));

// ─── ElevenLabs: List voices ───
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

// ─── ElevenLabs: Generate audio for all script lines ───
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

// ─── Save character image locally ───
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

// ─── HeyGen: Upload asset (image or audio) ───
app.post('/api/heygen/upload', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const contentType = req.query.content_type || 'image/png';
  try {
    const result = await heygenUpload(req.body, contentType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HeyGen: Create photo avatar from uploaded image ───
app.post('/api/heygen/create-avatar', async (req, res) => {
  const { imageKey } = req.body;
  if (!imageKey) return res.status(400).json({ error: 'Missing imageKey' });

  try {
    const result = await heygenRequest('/v1/photo_avatar.generate', 'POST', {
      image_key: imageKey
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HeyGen: List talking photos ───
app.get('/api/heygen/talking-photos', async (req, res) => {
  try {
    const result = await heygenRequest('/v1/talking_photo.list', 'GET');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HeyGen: Generate video from character audio + photo avatar ───
app.post('/api/heygen/generate-video', async (req, res) => {
  const { projectName, photoAvatarId } = req.body;
  if (!projectName || !photoAvatarId) {
    return res.status(400).json({ error: 'Missing projectName or photoAvatarId' });
  }

  const outputDir = path.join(__dirname, 'output', projectName);
  if (!fs.existsSync(outputDir)) {
    return res.status(400).json({ error: 'Project not found. Generate audio first.' });
  }

  // Read the generated lines metadata
  const audioFiles = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.mp3'))
    .sort();

  if (audioFiles.length === 0) {
    return res.status(400).json({ error: 'No audio files found' });
  }

  // Upload all audio files to HeyGen and build video inputs
  const videoInputs = [];

  for (const file of audioFiles) {
    const isCharacter = file.includes('_character');
    const filepath = path.join(outputDir, file);
    const audioBuffer = fs.readFileSync(filepath);

    try {
      // Upload audio to HeyGen
      const uploadResult = await heygenUpload(audioBuffer, 'audio/mpeg');
      const audioUrl = uploadResult.data?.url;

      if (!audioUrl) {
        return res.status(500).json({ error: `Failed to upload ${file}: no URL returned` });
      }

      if (isCharacter) {
        // Character lines: animated talking photo
        videoInputs.push({
          character: {
            type: 'photo_avatar',
            photo_avatar_id: photoAvatarId
          },
          voice: {
            type: 'audio',
            input_audio: audioUrl
          }
        });
      } else {
        // User lines: still photo with audio playing
        videoInputs.push({
          character: {
            type: 'photo_avatar',
            photo_avatar_id: photoAvatarId
          },
          voice: {
            type: 'audio',
            input_audio: audioUrl
          }
        });
      }
    } catch (err) {
      return res.status(500).json({ error: `Failed uploading ${file}: ${err.message}` });
    }
  }

  try {
    const result = await heygenRequest('/v2/video/generate', 'POST', {
      video_inputs: videoInputs,
      dimension: { width: 1280, height: 720 }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HeyGen: Check video status ───
app.get('/api/heygen/video-status', async (req, res) => {
  const { video_id } = req.query;
  if (!video_id) return res.status(400).json({ error: 'Missing video_id' });

  try {
    const result = await heygenRequest(`/v1/video_status.get?video_id=${video_id}`, 'GET');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: ElevenLabs API request ───
function elevenLabsRequest(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: endpoint,
      method,
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try { resolve(JSON.parse(raw.toString())); }
        catch { resolve(raw); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Helper: ElevenLabs TTS ───
function generateSpeech(voiceId, text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: 'eleven_v2_flash',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          reject(new Error(`ElevenLabs error ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
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

// ─── Helper: HeyGen API request ───
function heygenRequest(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.heygen.com',
      path: endpoint,
      method,
      headers: {
        'X-Api-Key': HEYGEN_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try { resolve(JSON.parse(raw.toString())); }
        catch { resolve(raw); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Helper: HeyGen upload (raw binary) ───
function heygenUpload(buffer, contentType) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'upload.heygen.com',
      path: '/v1/asset',
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_KEY,
        'Content-Type': contentType,
        'Content-Length': buffer.length
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try { resolve(JSON.parse(raw.toString())); }
        catch { reject(new Error(`HeyGen upload error: ${raw.toString()}`)); }
      });
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

app.listen(PORT, () => {
  console.log(`Golden Examples app running at http://localhost:${PORT}`);
});
