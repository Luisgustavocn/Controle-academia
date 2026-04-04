@echo off
setlocal
title Controle Academia - Instalar Atualizar e Iniciar

set "ROOT=%~dp0"
set "LOCAL_SCRIPT=%ROOT%scripts\windows-install-update-start.ps1"
set "TEMP_SCRIPT=%TEMP%\controle-academia-instalar-atualizar-iniciar.ps1"
set "RAW_URL=https://raw.githubusercontent.com/Luisgustavocn/Controle-academia/main/scripts/windows-install-update-start.ps1"

echo.
echo Instalando, atualizando e iniciando Controle Academia...
echo.

if exist "%LOCAL_SCRIPT%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCAL_SCRIPT%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%RAW_URL%' -OutFile '%TEMP_SCRIPT%'; & '%TEMP_SCRIPT%'"
)

if errorlevel 1 (
  echo.
  echo O sistema nao conseguiu instalar, atualizar ou iniciar corretamente.
  pause
  exit /b %errorlevel%
)

echo.
echo Servidor encerrado.
pause
