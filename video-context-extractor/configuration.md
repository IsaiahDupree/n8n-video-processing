# Enhanced Video Context Extractor v3.0 Configuration

This document contains the environment configuration details for the Enhanced Video Context Extractor script.

## System Configuration Test Results

```bash
testResults
fs                  true
path                true
os                  true
child_process       true
util                true
https               true
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

The Enhanced Video Context Extractor requires the following dependencies to be installed in your n8n Docker container:

1. **ffmpeg** - Used for video processing, frame extraction, and audio extraction
   - Status: ✅ Installed (version 6.1.2)
   - Used for: Extracting frames, getting video metadata, extracting audio

2. **ffprobe** - Used for video metadata extraction
   - Status: ✅ Installed (part of ffmpeg package)
   - Used for: Getting video duration, dimensions, bitrate, and framerate

3. **Node.js Modules**
   - fs: ✅ Available
   - path: ✅ Available
   - os: ✅ Available
   - child_process: ✅ Available
   - util: ✅ Available
   - https: ✅ Available

## Key Features

1. **Whisper API Integration**
   - Transcribes video audio with word-level timestamps
   - Uses verbose_json format for detailed transcript data
   - Handles audio extraction and format optimization

2. **GPT-4o Vision Analysis**
   - Analyzes extracted video frames for visual context
   - Provides detailed descriptions of visual elements and settings
   - Identifies changes and progression across frames

3. **Topic Segmentation**
   - Automatically segments transcript into distinct topics
   - Generates timestamps for each topic section
   - Creates concise titles and summaries for each segment

4. **Combined Context Generation**
   - Blends transcript and visual analysis for comprehensive understanding
   - Balances audio and visual elements (50/50)
   - Creates a unified narrative of the video content

## Configuration Notes

- The script uses the OPENAI_API_KEY environment variable
- Default frame count is 5, but can be customized via input
- Audio is extracted at 16kHz mono for optimal Whisper API compatibility
- Maximum audio size is limited to 25MB (Whisper API limit)
- Temporary files are automatically cleaned up after processing

## Usage Instructions

1. Add a "Code" node to your n8n workflow
2. Copy the entire content of `video-context-extractor.js` into the Code node
3. Connect a node that provides binary video data as input
4. Optionally provide `videoName` and `frameCount` parameters in the input JSON
5. The output will include:
   - Raw transcript text
   - Formatted transcript with timestamps
   - Frame context (visual analysis)
   - Combined context (transcript + visual)
   - Topic segments with timestamps
   - Video metadata (dimensions, duration, bitrate, framerate)

## Troubleshooting

If you encounter any issues:

1. Verify ffmpeg and ffprobe are installed in your Docker container
2. Check that the OpenAI API key is valid
3. Ensure the input node provides binary video data
4. For videos with audio tracks larger than 25MB, split the video first
5. Check n8n logs for detailed error messages

## Performance Considerations

- Processing time depends on video length and complexity
- OpenAI API calls include automatic retry logic (3 attempts)
- Memory usage is optimized with streaming and cleanup procedures
- For very large videos, consider increasing n8n memory allocation
