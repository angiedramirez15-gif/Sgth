@echo off
rem SGTH - Vigilante: revisa cada 15 minutos que el sistema responda. Lo ejecuta la tarea "SGTH - Vigilante".
setlocal
set "LOG=C:\SGTH\logs\vigilante.log"
if not exist "C:\SGTH\logs" mkdir "C:\SGTH\logs"
if exist "%LOG%" for %%A in ("%LOG%") do if %%~zA GTR 1048576 move /y "%LOG%" "%LOG%.1" >nul
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
cd /d C:\SGTH\app\backend
"%NODE%" scripts\vigilante.mjs %* >> "%LOG%" 2>&1
exit /b %ERRORLEVEL%
