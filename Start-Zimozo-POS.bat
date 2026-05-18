@echo off
echo Starting Zimozo Offline POS...
cd /d "%~dp0"
npm run electron:dev
pause
