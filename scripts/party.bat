@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo.
echo  Up^&Down — вечеринка (порт 3001)
echo  Закрой Cursor на время игры. Семья — только QR / :3001/play/
echo  НЕ открывайте :5173
echo.
call npm run party
pause
