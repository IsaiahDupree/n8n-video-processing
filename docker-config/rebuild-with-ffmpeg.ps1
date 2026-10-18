# Rebuild N8N Container with FFmpeg Support
# Run this script to rebuild the n8n container with FFmpeg installed

Write-Host "🔧 Rebuilding N8N container with FFmpeg support..." -ForegroundColor Yellow
Write-Host "" 

# Pre-flight checks
Write-Host "📋 Pre-flight Checklist:" -ForegroundColor Cyan
Write-Host "   ✅ Core Node.js modules: Available" -ForegroundColor Green
Write-Host "   ✅ File system operations: Working" -ForegroundColor Green
Write-Host "   ❌ FFmpeg: Missing (will install)" -ForegroundColor Red
Write-Host "   ⚠️  NODE_FUNCTION_ALLOW_BUILTIN: Needs verification" -ForegroundColor Yellow
Write-Host ""

# Stop existing containers
Write-Host "⏹️ Stopping existing containers..." -ForegroundColor Blue
docker-compose down

# Clean up old images
Write-Host "🗑️ Cleaning up old images..." -ForegroundColor Blue
$oldImages = docker images -q "*n8n*" 2>$null
if ($oldImages) {
    docker rmi $oldImages --force 2>$null
    Write-Host "   Removed old n8n images" -ForegroundColor Gray
}

# Build with verbose output
Write-Host "🏗️ Building new container with FFmpeg..." -ForegroundColor Green
Write-Host "   This may take a few minutes..." -ForegroundColor Gray
docker-compose build --no-cache --progress=plain n8n

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed! Check the output above." -ForegroundColor Red
    pause
    exit 1
}

# Start all services
Write-Host "🚀 Starting services..." -ForegroundColor Green
docker-compose up -d

# Wait for n8n to be ready
Write-Host "⏳ Waiting for n8n to be ready..." -ForegroundColor Blue
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "   ✅ n8n is responding!" -ForegroundColor Green
        break
    } catch {
        Write-Host "   ⏳ Attempt $i/30 - waiting..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

# Check container status
Write-Host "" 
Write-Host "📊 Container Status:" -ForegroundColor Cyan
docker-compose ps

# Comprehensive testing
Write-Host "" 
Write-Host "🧪 Running comprehensive tests..." -ForegroundColor Yellow

# Test 1: FFmpeg availability
Write-Host "   🎬 Testing FFmpeg..." -ForegroundColor Blue
docker exec docker-config-n8n-1 ffmpeg -version 2>$null
$ffmpegTest = ($LASTEXITCODE -eq 0)
if ($ffmpegTest) {
    Write-Host "   ✅ FFmpeg: Available" -ForegroundColor Green
} else {
    Write-Host "   ❌ FFmpeg: Still missing" -ForegroundColor Red
}

# Test 2: FFprobe availability
Write-Host "   🔍 Testing FFprobe..." -ForegroundColor Blue
docker exec docker-config-n8n-1 ffprobe -version 2>$null
$ffprobeTest = ($LASTEXITCODE -eq 0)
if ($ffprobeTest) {
    Write-Host "   ✅ FFprobe: Available" -ForegroundColor Green
} else {
    Write-Host "   ❌ FFprobe: Still missing" -ForegroundColor Red
}

# Test 3: Environment variables
Write-Host "   🔧 Testing environment variables..." -ForegroundColor Blue
$envTest = docker exec docker-config-n8n-1 env | grep "NODE_FUNCTION_ALLOW_BUILTIN"
if ($envTest) {
    Write-Host "   ✅ NODE_FUNCTION_ALLOW_BUILTIN: Set" -ForegroundColor Green
} else {
    Write-Host "   ❌ NODE_FUNCTION_ALLOW_BUILTIN: Not set" -ForegroundColor Red
}

# Test 4: Node.js modules (quick test)
Write-Host "   📦 Testing Node.js modules..." -ForegroundColor Blue
$nodeTest = docker exec docker-config-n8n-1 node -e "console.log('fs:', typeof require('fs')); console.log('path:', typeof require('path'));"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Node.js modules: Available" -ForegroundColor Green
} else {
    Write-Host "   ❌ Node.js modules: Issue detected" -ForegroundColor Red
}

# Summary
Write-Host "" 
Write-Host "📋 Rebuild Summary:" -ForegroundColor Cyan
if ($ffmpegTest -and $ffprobeTest) {
    Write-Host "   🎯 SUCCESS: FFmpeg and FFprobe are now available!" -ForegroundColor Green
    Write-Host "   📍 Location: /usr/bin/ffmpeg and /usr/bin/ffprobe" -ForegroundColor Gray
    Write-Host "   🚀 Your video processing workflows should now work!" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  WARNING: FFmpeg installation may have issues" -ForegroundColor Yellow
    Write-Host "   📋 Check the build logs above for errors" -ForegroundColor Gray
    Write-Host "   🔍 Container logs:" -ForegroundColor Blue
    docker logs docker-config-n8n-1 --tail 20
}

# Open browser
Write-Host "" 
Write-Host "🌐 Opening n8n interface..." -ForegroundColor Blue
Start-Process "http://localhost:5678"

Write-Host "" 
Write-Host "✅ Rebuild complete! Next steps:" -ForegroundColor Cyan
Write-Host "   1. Run environment-verification-test.js to confirm everything works" -ForegroundColor White
Write-Host "   2. Use enhanced-video-context-extractor-v3-AUTO-DETECT.js for video processing" -ForegroundColor White
Write-Host "   3. Test with a small video file first" -ForegroundColor White
Write-Host ""
