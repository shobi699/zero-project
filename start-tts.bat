@echo off
title Zero TTS Servers

echo Starting Python TTS Engine (Port 8000)...
start "Zero Python Engine" cmd /c "cd /d %~dp0zero-server\python-engines\tts && python server.py"

echo Starting NestJS Server (Port 3000)...
start "Zero NestJS Server" cmd /c "cd /d %~dp0zero-server && npm run start:dev"

echo Servers are starting in background windows.
echo Please wait a few seconds and then try the TTS Panel again.
pause
