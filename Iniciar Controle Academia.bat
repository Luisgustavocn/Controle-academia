@echo off
cd /d "%~dp0"
title Controle Academia

echo.
echo Iniciando Controle Academia...
echo.

call npm run start:local

if errorlevel 1 (
  echo.
  echo O sistema nao iniciou corretamente.
  pause
  exit /b %errorlevel%
)

echo.
echo Servidor encerrado.
pause
