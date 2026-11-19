@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
node tools\csv-to-js.js %*
echo.
pause
