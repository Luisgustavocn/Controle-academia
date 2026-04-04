@echo off
cd /d "%~dp0"
title Controle Academia - Iniciar Manual

echo.
echo Iniciando Controle Academia manualmente...
echo.

echo 1. Atualizando dependencias...
call npm install
if errorlevel 1 goto error

echo.
echo 2. Aplicando migracoes do banco...
call npx prisma migrate deploy
if errorlevel 1 goto error

echo.
echo 3. Gerando build de producao...
call npm run build
if errorlevel 1 goto error

echo.
echo 4. Iniciando servidor...
call npm start

goto end

:error
echo.
echo Ocorreu um erro. Verifique as mensagens acima.
pause

:end
echo.
echo Servidor encerrado.
pause
