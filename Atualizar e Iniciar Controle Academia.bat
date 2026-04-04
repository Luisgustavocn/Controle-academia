@echo off
cd /d "%~dp0"
title Controle Academia - Atualizar e Iniciar

echo.
echo Atualizando e iniciando Controle Academia...
echo.

call npm run update:start:local

if errorlevel 1 (
  echo.
  echo O sistema nao conseguiu atualizar ou iniciar corretamente.
  pause
  exit /b %errorlevel%
)

echo.
echo Servidor encerrado.
pause
