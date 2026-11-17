@echo off
rem SGTH - Arranca el sistema. Lo ejecuta la tarea programada "SGTH - Sistema" (cuenta SYSTEM).
setlocal
set "LOG=C:\SGTH\logs\sgth.log"
set NO_COLOR=1
if not exist "C:\SGTH\logs" mkdir "C:\SGTH\logs"
rem Si el registro pasa de 10 MB se guarda como sgth.log.1 y se empieza uno nuevo
if exist "%LOG%" for %%A in ("%LOG%") do if %%~zA GTR 10485760 move /y "%LOG%" "%LOG%.1" >nul
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
cd /d C:\SGTH\app\backend
echo ==== %DATE% %TIME% Inicio del SGTH ====>> "%LOG%"
"%NODE%" C:\SGTH\app\backend\dist\main.js >> "%LOG%" 2>&1
set CODIGO=%ERRORLEVEL%
echo ==== %DATE% %TIME% El SGTH se detuvo (codigo %CODIGO%) ====>> "%LOG%"
exit /b %CODIGO%
