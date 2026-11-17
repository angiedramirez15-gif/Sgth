@echo off
rem SGTH - Respaldo diario cifrado. Lo ejecuta la tarea programada "SGTH - Respaldo diario".
setlocal
set "LOG=C:\SGTH\logs\respaldo.log"
if not exist "C:\SGTH\logs" mkdir "C:\SGTH\logs"
if exist "%LOG%" for %%A in ("%LOG%") do if %%~zA GTR 5242880 move /y "%LOG%" "%LOG%.1" >nul
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
cd /d C:\SGTH\app\backend
"%NODE%" scripts\respaldo.mjs >> "%LOG%" 2>&1
exit /b %ERRORLEVEL%
