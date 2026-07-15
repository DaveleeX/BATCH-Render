@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

if not exist .env (
  echo 缺少 .env，正在从 .env.example 复制...
  copy .env.example .env >nul
  echo 请先用记事本编辑 vision-assistant\.env ，填入：
  echo   AI_PROVIDER=doubao
  echo   ARK_API_KEY=你的豆包Key
  echo   DOUBAO_MODEL=doubao-seed-2-0-lite-260428
  echo   AMAP_WEB_KEY=你的高德Web服务Key
  notepad .env
  pause
  exit /b 1
)

where docker >nul 2>nul
if %errorlevel%==0 (
  echo 使用 Docker 启动...
  docker compose up -d --build
  echo.
  echo 本机访问: http://127.0.0.1:3000
  echo 手机同一 WiFi 访问: http://你的电脑局域网IP:3000
  goto :eof
)

where npm >nul 2>nul
if %errorlevel%==0 (
  echo 使用 Node 启动...
  call npm install
  call npm run build
  call npm run start -- -p 3000
  goto :eof
)

echo 请先安装 Docker Desktop 或 Node.js 22+
pause
