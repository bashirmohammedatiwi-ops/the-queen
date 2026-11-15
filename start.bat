@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js غير مثبت - حمله من https://nodejs.org & pause & exit /b 1)
start "" http://localhost:3000/
node --no-warnings server.js
pause
