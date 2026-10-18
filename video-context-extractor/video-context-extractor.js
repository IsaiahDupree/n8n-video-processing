/**
 * Enhanced Video Context Extractor v3.0 – n8n Code node
 * 
 * Compatible with n8n v1.91.1 and later
 * 
 * Inputs  : item 0 carries binary "data"
 * Outputs : transcriptContext, frameContext, combinedContext, dimensions, topics with timestamps
 *
 * Requires host: ffmpeg & ffprobe
 */

// Import required modules
const fs     = require('fs').promises;
const path   = require('path');
const os     = require('os');
const cp     = require('child_process');
const util   = require('util');
const https  = require('https');

// Get the OpenAI API key from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

const exec = util.promisify(cp.exec);

// Simple retry function
async function retry(fn, options = {}) {
  const retries = options.retries || 3;
  const minTimeout = options.minTimeout || 1000;
  
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed, retrying in ${minTimeout}ms...`);
      await new Promise(resolve => setTimeout(resolve, minTimeout));
    }
  }
  throw lastError;
}

// Helper function for HTTP requests
async function makeHttpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject(new Error(`API error: ${parsedData.error?.message || JSON.stringify(parsedData)}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

// Format seconds to HH:MM:SS
function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/* ---------- runtime config ---------- */
// Get input data
const items = $input.all();
if (items.length === 0) {
  throw new Error('No input items found');
}

// Get binary buffer safely
const binaryKeys = items[0].binary ? Object.keys(items[0].binary) : [];
if (binaryKeys.length === 0) throw new Error('No binary data on item');

const binaryProperty = binaryKeys[0];
console.log(`Using binary property: ${binaryProperty}`);

// In n8n 1.91+, use the proper binary data buffer method with index and property name
const binBuf = await this.helpers.getBinaryDataBuffer(0, binaryProperty);
if (!binBuf) throw new Error(`Binary field "${binaryProperty}" is empty.`);

const videoName = items[0].json?.videoName ?? `video_${Date.now()}.mp4`;
const frameCount = items[0].json?.frameCount ?? 5;
const visionModel = 'gpt-4o';

/* ---------- helpers ---------- */
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-'));
const tmpVid = path.join(tmpDir, 'input.mp4');
await fs.writeFile(tmpVid, binBuf);

async function safeExec(cmd) {
  try {
    return await exec(cmd, { maxBuffer: 1024 * 1024 * 10 }); // 10 MB stdout cap
  } catch (error) {
    console.error(`Command execution failed: ${cmd}`);
    console.error(`Error: ${error.message}`);
    throw new Error(`Command failed: ${error.message}`);
  }
}

async function extractAudio(src, out) {
  // Ensure paths are properly escaped for shell commands
  const escapedSrc = src.replace(/\\/g, '/').replace(/"/g, '\"');
  const escapedOut = out.replace(/\\/g, '/').replace(/"/g, '\"');
  
  await safeExec(
    `ffmpeg -i "${escapedSrc}" -vn -ac 1 -ar 16000 -b:a 64k -y "${escapedOut}" -hide_banner -loglevel error`
  );
}

/* ---------- 1. Get video metadata ---------- */
console.log('Getting video metadata...');

// Ensure paths are properly escaped for shell commands
const escapedTmpVid = tmpVid.replace(/\\/g, '/').replace(/"/g, '\"');

// Get duration
const { stdout: durationOutput } = await safeExec(
  `ffprobe -v error -show_entries format=duration -of csv=p=0 "${escapedTmpVid}"`
);
const duration = parseFloat(durationOutput.trim());

// Get dimensions
const { stdout: dimensionsOutput } = await safeExec(
  `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${escapedTmpVid}"`
);
const dimensions = dimensionsOutput.trim();

// Get bitrate
const { stdout: bitrateOutput } = await safeExec(
  `ffprobe -v error -select_streams v:0 -show_entries stream=bit_rate -of csv=p=0 "${escapedTmpVid}"`
);
const bitrate = parseInt(bitrateOutput.trim()) || 'unknown';

// Get framerate
const { stdout: framerateOutput } = await safeExec(
  `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${escapedTmpVid}"`
);
const framerateFraction = framerateOutput.trim();
const [numerator, denominator] = framerateFraction.split('/').map(Number);
const framerate = denominator ? (numerator / denominator).toFixed(2) : framerateFraction;

console.log(`Video dimensions: ${dimensions}, Duration: ${duration}s, Framerate: ${framerate}fps`);

/* ---------- 2. Whisper transcription with timestamps ---------- */
console.log('Extracting audio for transcription...');
const audioPath = path.join(tmpDir, 'audio.mp3');
await extractAudio(tmpVid, audioPath);
const audioStat = await fs.stat(audioPath);
if (audioStat.size > 25 * 1024 * 1024) {
  throw new Error('Audio track exceeds Whisper 25 MB limit - split first.');
}

// For Whisper API, we need to use a different approach since FormData is not available in Node.js
// We'll use a multipart/form-data boundary approach
const audioData = await fs.readFile(audioPath);
const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;

// Create multipart form-data manually
const formDataPayload = Buffer.concat([
  // Add the model field
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`),
  // Add the response_format field for timestamps
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
  // Add the timestamp_granularities field
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[0]"\r\n\r\nword\r\n`),
  // Add the file field
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
  // Add the file content
  audioData,
  // Close the boundary
  Buffer.from(`\r\n--${boundary}--\r\n`)
]);

// Call Whisper API with timestamps
console.log('Calling Whisper API for transcription with timestamps...');
const transcriptResponse = await retry(async () => {
  const options = {
    hostname: 'api.openai.com',
    path: '/v1/audio/transcriptions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': formDataPayload.length
    }
  };
  
  return makeHttpRequest(options, formDataPayload);
});

const transcriptText = transcriptResponse.text;
const segments = transcriptResponse.segments || [];

// Create a formatted transcript with timestamps
let formattedTranscript = '';
for (const segment of segments) {
  const startTime = formatTimestamp(segment.start);
  formattedTranscript += `[${startTime}] ${segment.text}\n`;
}

/* ---------- 3. Frame extraction ---------- */
console.log('Extracting frames for visual analysis...');
try {
  // Extract frames evenly distributed throughout the video
  const interval = duration / frameCount;
  const escapedTmpDir = tmpDir.replace(/\\/g, '/').replace(/"/g, '\"');
  await safeExec(
    `ffmpeg -i "${escapedTmpVid}" -vf "fps=1/${interval}" -vsync vfr -q:v 2 "${escapedTmpDir}/frame_%03d.jpg" -hide_banner -loglevel error`
  );
  console.log('Frame extraction completed successfully');
} catch (error) {
  console.error('Error during frame extraction:', error);
  throw new Error(`Frame extraction failed: ${error.message}`);
}

const frameFiles = (await fs.readdir(tmpDir))
  .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
  .sort();

if (frameFiles.length === 0) {
  throw new Error('No frames were extracted from the video');
}

const b64Frames = await Promise.all(
  frameFiles.map(async (f) => {
    const data = await fs.readFile(path.join(tmpDir, f), { encoding: 'base64' });
    return { name: f, data };
  })
);

/* ---------- 4. Visual analysis ---------- */
console.log('Analyzing frames with Vision API...');
const visionPrompt = [
  { 
    type: 'text', 
    text: 'Analyze these video frames and provide a detailed description of what is happening. Focus on the visual elements, setting, and any notable changes between frames.'
  },
  ...b64Frames.map(frame => ({ 
    type: 'image_url', 
    image_url: { url: `data:image/jpeg;base64,${frame.data}` } 
  })),
];

// Call Vision API
const frameResponse = await retry(async () => {
  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  
  const data = JSON.stringify({
    model: visionModel,
    messages: [{ role: 'user', content: visionPrompt }]
  });
  
  return makeHttpRequest(options, data);
});

const frameCtx = frameResponse.choices[0].message.content.trim();

/* ---------- 5. Topic segmentation ---------- */
console.log('Segmenting transcript into topics...');
const topicPrompt = `
Analyze this transcript and segment it into distinct topics or sections.
For each topic:
1. Provide a concise title
2. Include the timestamp where the topic begins
3. Write a brief summary of what's discussed

Transcript with timestamps:
${formattedTranscript}

Format your response as a JSON array:
[
  {
    "title": "Topic title",
    "timestamp": "HH:MM:SS",
    "summary": "Brief summary of this topic section"
  },
  ...
]
`;

// Call GPT for topic segmentation
const topicResponse = await retry(async () => {
  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  
  const data = JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: topicPrompt }],
    response_format: { type: "json_object" }
  });
  
  return makeHttpRequest(options, data);
});

let topics = [];
try {
  // Parse the JSON response
  const topicContent = topicResponse.choices[0].message.content.trim();
  const parsedContent = JSON.parse(topicContent);
  topics = parsedContent.topics || parsedContent;
  
  if (!Array.isArray(topics)) {
    console.warn('Topics not in expected format, using empty array');
    topics = [];
  }
} catch (error) {
  console.error('Error parsing topics:', error);
  topics = [];
}

/* ---------- 6. Combined context ---------- */
console.log('Generating combined context...');
// Call Chat API for combining contexts
const combineResponse = await retry(async () => {
  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  
  const data = JSON.stringify({
    model: visionModel,
    messages: [
      { role: 'system', content: 'Blend transcript (50%) and visual (50%) insights to create a comprehensive understanding of the video content.' },
      { role: 'user', content: `Transcript:\n${transcriptText}\n\nFrames:\n${frameCtx}` }
    ]
  });
  
  return makeHttpRequest(options, data);
});

const combineCtx = combineResponse.choices[0].message.content.trim();

/* ---------- 7. Return & cleanup ---------- */
try {
  const videoMetadata = {
    dimensions,
    duration: formatTimestamp(duration),
    durationSeconds: duration,
    bitrate: typeof bitrate === 'number' ? `${(bitrate / 1000000).toFixed(2)} Mbps` : bitrate,
    framerate: `${framerate} fps`
  };
  
  const out = {
    videoName,
    metadata: videoMetadata,
    transcriptRaw: transcriptText,
    transcriptWithTimestamps: formattedTranscript,
    frameContext: frameCtx,
    combinedContext: combineCtx,
    topics: topics,
    processedAt: new Date().toISOString()
  };

  return [{ json: out }];
} finally {
  // Clean up temporary files
  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log('Temporary files cleaned up');
}
