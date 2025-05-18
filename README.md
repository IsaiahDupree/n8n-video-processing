# N8N Video Processing Code Nodes

A collection of custom code nodes for n8n to enhance video processing workflows. These nodes provide advanced video analysis, frame extraction, and metadata generation capabilities.

## Components

### 1. Best Frame Extractor

Extracts 5 key frames from a video and selects the best one for social media using OpenAI's GPT-4o Vision.

**Features:**
- Scene detection for intelligent frame selection
- Visual appeal and composition analysis
- Social media platform-specific suggestions
- Detailed metadata for each extracted frame

**Files:**
- `best-frame-extractor/best-frame-extractor.js` - Main code node script
- `best-frame-extractor/configuration.md` - Configuration documentation

### 2. Video Context Extractor

Extracts comprehensive context from videos including transcripts, visual analysis, and topic segmentation.

**Features:**
- Word-level timestamp transcription using Whisper API
- Visual frame analysis with GPT-4o Vision
- Automatic topic segmentation with timestamps
- Combined transcript and visual context

**Files:**
- `video-context-extractor/video-context-extractor.js` - Main code node script
- `video-context-extractor/configuration.md` - Configuration documentation

### 3. Docker Configuration

Docker setup for n8n with ffmpeg and other required dependencies pre-installed.

**Files:**
- `docker-config/docker-compose.yml` - Docker Compose configuration
- `docker-config/n8n.Dockerfile` - Custom Dockerfile for n8n with ffmpeg

## Requirements

- n8n v1.91.1 or later
- Docker and Docker Compose
- FFmpeg installed in the container
- OpenAI API key

## Setup Instructions

1. Clone this repository
2. Navigate to the repository directory
3. Start the Docker container:
   ```
   cd docker-config
   docker-compose up -d
   ```
4. Access n8n at http://localhost:5678
5. Create a new workflow and add a "Code" node
6. Copy the content of the desired script into the Code node
7. Configure the workflow as described in the configuration documentation

## Environment Variables

The following environment variables are recommended for optimal performance:

```
N8N_DEFAULT_BINARY_DATA_MODE=filesystem
N8N_BINARY_DATA_STORAGE_PATH=/tmp/n8n-binary-data
N8N_PAYLOAD_SIZE_MAX=1024
```

## License

MIT

## Author

Created for video processing workflows in n8n.
