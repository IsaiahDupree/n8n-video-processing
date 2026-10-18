# N8N Video Processing Environment Startup Script
# This script starts Docker Desktop and the n8n video processing environment

Write-Host "=== N8N Video Processing Environment Startup ===" -ForegroundColor Green

# Function to check if Docker is running
function Test-DockerRunning {
    try {
        docker version > $null 2>&1
        return $true
    }
    catch {
        return $false
    }
}

# Function to wait for Docker to be ready
function Wait-ForDocker {
    $maxAttempts = 30
    $attempt = 0
    
    Write-Host "Waiting for Docker to be ready..." -ForegroundColor Yellow
    
    while ($attempt -lt $maxAttempts) {
        if (Test-DockerRunning) {
            Write-Host "Docker is ready!" -ForegroundColor Green
            return $true
        }
        
        $attempt++
        Write-Host "Attempt $attempt/$maxAttempts - Docker not ready yet..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
    
    Write-Host "Docker failed to start within timeout period" -ForegroundColor Red
    return $false
}

# Check if Docker Desktop is running
if (-not (Test-DockerRunning)) {
    Write-Host "Docker is not running. Starting Docker Desktop..." -ForegroundColor Yellow
    
    # Start Docker Desktop
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
    
    # Wait for Docker to be ready
    if (-not (Wait-ForDocker)) {
        Write-Host "Failed to start Docker. Please start Docker Desktop manually." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "Docker is already running!" -ForegroundColor Green
}

# Change to the docker-compose directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Starting n8n video processing environment..." -ForegroundColor Yellow

# Stop any existing containers
Write-Host "Stopping existing containers..." -ForegroundColor Yellow
docker-compose down --remove-orphans

# Start the environment
Write-Host "Starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Check if containers started successfully
Start-Sleep -Seconds 5

$containers = docker-compose ps --services
$runningContainers = docker-compose ps --services --filter status=running

Write-Host "`n=== Container Status ===" -ForegroundColor Green
docker-compose ps

if ($runningContainers.Count -eq $containers.Count) {
    Write-Host "`n✅ All containers started successfully!" -ForegroundColor Green
    Write-Host "🌐 N8N Interface: http://localhost:5678" -ForegroundColor Cyan
    Write-Host "🔧 Flask Drive API: http://localhost:5002" -ForegroundColor Cyan
    Write-Host "📊 Database: localhost:5432" -ForegroundColor Cyan
    
    # Wait a moment and then open n8n in browser
    Write-Host "`nOpening n8n interface..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:5678"
    
} else {
    Write-Host "`n❌ Some containers failed to start. Check the logs above." -ForegroundColor Red
    Write-Host "Run 'docker-compose logs' for more details." -ForegroundColor Yellow
}

Write-Host "`n=== Environment Ready ===" -ForegroundColor Green
Write-Host "To stop the environment, run: docker-compose down" -ForegroundColor Yellow
Read-Host "Press Enter to continue"
