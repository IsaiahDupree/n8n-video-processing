@echo off
echo 🔧 Rebuilding N8N with FFmpeg Support...
echo.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "rebuild-with-ffmpeg.ps1"
echo.
pause
