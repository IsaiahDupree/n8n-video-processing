FROM n8nio/n8n:1.91.1

USER root

# Install ffmpeg and other dependencies
RUN apk add --no-cache ffmpeg

# Install additional npm packages
WORKDIR /usr/local/lib/node_modules/n8n
RUN npm install --no-save fluent-ffmpeg

# Return to node user for security
USER node

# Set environment variables for binary file handling
ENV N8N_DEFAULT_BINARY_DATA_MODE=filesystem
ENV N8N_BINARY_DATA_STORAGE_PATH=/home/node/.n8n/binaryData
ENV N8N_PAYLOAD_SIZE_MAX=1024
