/**
 * Best Frame Extractor v2.0 – n8n Code node
 * 
 * Extracts 5 key frames from a video and selects the best one for social media
 * Compatible with n8n v1.91.1 and later
 * 
 * Inputs  : item 0 carries binary "data" (video file)
 * Outputs : bestFrame (binary), frameMetadata (JSON), socialMediaSuggestions
 *
 * Requires: ffmpeg installed in Docker container
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

async function safeExec(cmd) {
  try {
    return await exec(cmd, { maxBuffer: 1024 * 1024 * 10 }); // 10 MB stdout cap
  } catch (error) {
    console.error(`Command execution failed: ${cmd}`);
    console.error(`Error: ${error.message}`);
    throw new Error(`Command failed: ${error.message}`);
  }
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

// Create temporary directory and save video
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-'));
const tmpVid = path.join(tmpDir, 'input.mp4');
await fs.writeFile(tmpVid, binBuf);

// Verify the file was written successfully
const stat = await fs.stat(tmpVid);
if (stat.size === 0) throw new Error('Temp video file is empty – check upstream node.');

// Configuration options
const frameCount = 5; // Extract exactly 5 frames for analysis
const visionModel = 'gpt-4o';
const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];

/* ---------- 1. Get video metadata ---------- */
console.log('Getting video metadata...');

// Ensure paths are properly escaped for shell commands
const escapedTmpVid = tmpVid.replace(/\\/g, '/').replace(/"/g, '\"');

// give the file system a split-second in case the temp copy is large
await new Promise(r => setTimeout(r, 250));

// Get duration using robust ffprobe command
const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "${escapedTmpVid}"`;

let duration = 0;
try {
  const { stdout } = await safeExec(ffprobeCmd);
  duration = parseFloat(stdout.trim());
  if (isNaN(duration) || duration === 0) throw new Error('bad duration');
} catch (e) {
  throw new Error(`ffprobe failed (${e.message}). Is ffprobe installed and is the input a valid video?`);
}

// Get dimensions
const { stdout: dimensionsOutput } = await safeExec(
  `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${escapedTmpVid}"`
);
const dimensions = dimensionsOutput.trim();
const [widthStr, heightStr] = dimensions.split('x');
const width = parseInt(widthStr);
const height = parseInt(heightStr);

console.log(`Video dimensions: ${dimensions}, Duration: ${duration}s`);

/* ---------- 2. Extract exactly 5 frames for analysis ---------- */
console.log('Extracting 5 key frames for best frame selection...');

// Create frames directory
const framesDir = path.join(tmpDir, 'frames');
await fs.mkdir(framesDir, { recursive: true });
const escapedFramesDir = framesDir.replace(/\\/g, '/').replace(/"/g, '\"');

try {
  // Use scene detection to find significant changes in the video
  // This helps identify key moments rather than just evenly spaced frames
  await safeExec(
    `ffmpeg -i "${escapedTmpVid}" -vf "select='gt(scene,0.4)',fps=1/1" -vsync vfr -q:v 2 "${escapedFramesDir}/scene_%03d.jpg" -hide_banner -loglevel error`
  );
  
  // Check if we got at least 5 frames from scene detection
  let frameFiles = (await fs.readdir(framesDir)).filter(f => f.endsWith('.jpg')).sort();
  
  // If scene detection didn't give us enough frames, extract evenly spaced frames
  if (frameFiles.length < 5) {
    console.log(`Scene detection only found ${frameFiles.length} frames, extracting evenly spaced frames instead`);
    
    // Calculate interval to get exactly 5 frames
    const interval = duration / 4; // 4 intervals = 5 frames
    
    // Get framerate
    const { stdout: framerateOutput } = await safeExec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${escapedTmpVid}"`
    );
    const framerateFraction = framerateOutput.trim();
    const [numerator, denominator] = framerateFraction.split('/').map(Number);
    const fps = denominator ? (numerator / denominator) : 25; // Default to 25 fps if calculation fails
    
    await safeExec(
      `ffmpeg -i "${escapedTmpVid}" -vf "select='eq(n,0)+eq(n,${Math.floor(duration*fps/4)})+eq(n,${Math.floor(duration*fps/2)})+eq(n,${Math.floor(3*duration*fps/4)})+eq(n,${Math.floor(duration*fps-1)})'" -vsync vfr -q:v 2 "${escapedFramesDir}/frame_%03d.jpg" -hide_banner -loglevel error`
    );
    
    // If that didn't work, try a simpler approach with fps filter
    frameFiles = (await fs.readdir(framesDir)).filter(f => f.endsWith('.jpg')).sort();
    if (frameFiles.length < 5) {
      console.log('Trying alternative frame extraction method');
      await safeExec(
        `ffmpeg -i "${escapedTmpVid}" -vf "fps=1/${duration/4}" -vsync vfr -q:v 2 "${escapedFramesDir}/frame_%03d.jpg" -hide_banner -loglevel error`
      );
    }
  }
  
  // Get the final list of frames
  frameFiles = (await fs.readdir(framesDir)).filter(f => f.endsWith('.jpg')).sort();
  
  // If we have more than 5 frames, select 5 evenly distributed ones
  if (frameFiles.length > 5) {
    console.log(`Found ${frameFiles.length} frames, selecting 5 representative frames`);
    
    // Select 5 evenly distributed frames
    const selectedFrames = [];
    const step = (frameFiles.length - 1) / 4; // 4 steps = 5 frames
    
    for (let i = 0; i < 5; i++) {
      const index = Math.min(Math.floor(i * step), frameFiles.length - 1);
      selectedFrames.push(frameFiles[index]);
    }
    
    // Delete the frames we're not using
    for (const frame of frameFiles) {
      if (!selectedFrames.includes(frame)) {
        await fs.unlink(path.join(framesDir, frame));
      }
    }
    
    frameFiles = selectedFrames;
  }
  
  // If we still don't have exactly 5 frames, throw an error
  if (frameFiles.length !== 5) {
    throw new Error(`Failed to extract exactly 5 frames, got ${frameFiles.length} instead`);
  }
  
  console.log('Successfully extracted 5 key frames for analysis');
} catch (error) {
  console.error('Error during frame extraction:', error);
  throw new Error(`Frame extraction failed: ${error.message}`);
}

/* ---------- 3. Analyze frames to select the best one ---------- */
console.log('Analyzing frames to find the best one for social media...');

// Get the 5 extracted frames
const frameFiles = (await fs.readdir(framesDir))
  .filter(f => f.endsWith('.jpg'))
  .sort();

// Convert frames to base64 for Vision API
const b64Frames = await Promise.all(
  frameFiles.map(async (f, index) => {
    const data = await fs.readFile(path.join(framesDir, f), { encoding: 'base64' });
    const timestamp = formatTimestamp(duration * (index / 4)); // Estimate timestamp based on position
    return { 
      name: f, 
      data, 
      path: path.join(framesDir, f),
      timestamp
    };
  })
);

// Create prompt for best frame selection
const bestFramePrompt = [
  { 
    type: 'text', 
    text: `Analyze these 5 video frames and select the SINGLE BEST frame for social media posts.
    
Consider these criteria:
1. Visual appeal and composition
2. Clear subject focus
3. Good lighting and colors
4. Minimal motion blur
5. Suitable for social media (Instagram, Twitter, Facebook, LinkedIn)
6. Represents the video content well

Respond with a JSON object containing:
1. "bestFrameIndex": The index (0-based) of the best frame
2. "reasoning": Why this frame is the best choice
3. "socialMediaSuggestions": Brief suggestions for how to use this frame on each platform`
  },
  ...b64Frames.map((frame, index) => ({ 
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${frame.data}` }
  })),
];

// Call Vision API for best frame analysis
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
    messages: [{ role: 'user', content: bestFramePrompt }],
    response_format: { type: "json_object" }
  });
  
  return makeHttpRequest(options, data);
});

// Parse the response to get the best frame
let bestFrameAnalysis;
try {
  const content = frameResponse.choices[0].message.content.trim();
  bestFrameAnalysis = JSON.parse(content);
  
  if (!('bestFrameIndex' in bestFrameAnalysis)) {
    throw new Error('Response missing bestFrameIndex field');
  }
} catch (error) {
  console.error('Error parsing best frame analysis:', error);
  throw new Error(`Failed to parse best frame analysis: ${error.message}`);
}

const bestFrameIndex = bestFrameAnalysis.bestFrameIndex;
if (bestFrameIndex < 0 || bestFrameIndex >= b64Frames.length) {
  throw new Error(`Invalid best frame index: ${bestFrameIndex}`);
}

const bestFrame = b64Frames[bestFrameIndex];
console.log(`Selected frame ${bestFrameIndex + 1} of ${b64Frames.length} as the best frame`);
console.log(`Best frame reasoning: ${bestFrameAnalysis.reasoning}`);

/* ---------- 4. Prepare output ---------- */
// Read the best frame file
const bestFrameBuffer = await fs.readFile(bestFrame.path);

// Prepare metadata
const bestFrameMetadata = {
  frameNumber: bestFrameIndex + 1,
  totalFrames: b64Frames.length,
  fileName: bestFrame.name,
  timestamp: bestFrame.timestamp,
  dimensions: dimensions,
  width: width,
  height: height,
  reasoning: bestFrameAnalysis.reasoning,
  socialMediaSuggestions: bestFrameAnalysis.socialMediaSuggestions || {},
  processedAt: new Date().toISOString()
};

/* ---------- 5. Return & cleanup ---------- */
try {
  // Create binary data for the best frame
  const binaryData = await this.helpers.prepareBinaryData(
    bestFrameBuffer,
    bestFrame.name,
    'image/jpeg'
  );
  
  return [{
    json: bestFrameMetadata,
    binary: {
      bestFrame: binaryData
    }
  }];
} finally {
  // Clean up temporary files
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
    console.log('Temporary files cleaned up');
  } catch (error) {
    console.warn(`Failed to clean up temporary files: ${error.message}`);
  }
}
