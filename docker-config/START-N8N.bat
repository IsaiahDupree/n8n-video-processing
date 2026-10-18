@echo off
echo ===============================================
echo    N8N Video Processing Environment Startup
echo ===============================================
echo.

REM Change to the script directory
cd /d "%~dp0"

REM Run the PowerShell startup script
powershell -ExecutionPolicy Bypass -File "start-n8n-environment.ps1"

pause
