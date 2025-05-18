# Best Frame Extractor Configuration

This document contains the environment configuration details for the Best Frame Extractor script.

## System Configuration Test Results

```bash
testResults
fs                  true
path                true
os                  true
child_process       true
util                true
fsOperationsTest    success
true
file                /tmp/n8n-fs-test.txt
data                n8n FS ✔
childProcessTest    pending
true
note                Exec runs async; check n8n logs for final status.
ffmpeg              true
ffmpegVersion       ffmpeg version 6.1.2 Copyright (c) 2000-2024 the FFmpeg developers
firecrawl           false
firecrawlError      Cannot find module 'firecrawl'
n8nVersion          1.91.1
```

## Required Dependencies

The Best Frame Extractor requires the following dependencies to be installed in your n8n Docker container:

1. **ffmpeg** - Used for video processing and frame extraction
   - Status: ✅ Installed (version 6.1.2)
   - Used for: Extracting frames, getting video metadata

2. **Node.js Modules**
   - fs: ✅ Available
   - path: ✅ Available
   - os: ✅ Available
   - child_process: ✅ Available
   - util: ✅ Available

## Configuration Notes

- The script uses the OPENAI_API_KEY environment variable
- The script is configured to extract exactly 5 frames from videos
- Frame selection uses scene detection with fallback to evenly spaced frames
- The script is optimized for n8n version 1.91.1

## Usage Instructions

1. Add a "Code" node to your n8n workflow
2. Copy the entire content of `best-frame-extractor.js` into the Code node
3. Connect a node that provides binary video data as input
4. The output will include:
   - Binary data of the best frame
   - JSON metadata with frame information and social media suggestions

## Troubleshooting

If you encounter any issues:

1. Verify ffmpeg is installed in your Docker container
2. Check that the OpenAI API key is valid
3. Ensure the input node provides binary video data
4. Check n8n logs for detailed error messages
