#Requires -RunAsAdministrator
<#
  SGTH - Paso 2: instalar o actualizar la versión EN USO (C:\SGTH\app).

  Toma el código de C:\Proyectos\SGTH (desarrollo), lo compila, corre las pruebas,
  y copia el resultado a C:\SGTH\app. El .env de producción no se toca.
  Úselo también cada vez que haya una versión nueva lista para usar.

  La primera vez crea C:\SGTH\app\backend\.env copiando las claves del .env de
  desarrollo, genera la clave de los respaldos y registra las tareas programadas.

  Uso (PowerShell como administrador):
    cd C:\Proyectos\SGTH\despliegue
    powershell -ExecutionPolicy Bypass -File .\2-instalar-o-actualizar.ps1

  Antes de actualizar, si la versión nueva trae cambios de base de datos
  (database\cambios\0XX_...sql), ejecútelos en HeidiSQL como root.
#>
param(
  [string]$Repositorio = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Destino = 'C:\SGTH\app',
  [switch]$SinPruebas
)
$ErrorActionPreference = 'Stop'
function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
function Falla($t) { Write-Host "`n    ERROR: $t" -ForegroundColor Red; exit 1 }
function Ejecutar($comando, $carpeta) {
  Push-Location $carpeta
  try {
    & cmd /c "$comando 2>&1"
    if ($LASTEXITCODE -ne 0) { Falla "Falló: $comando (en $carpeta)" }
  } finally { Pop-Location }
}
function Copiar($origen, $dest) {
  & robocopy $origen $dest /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
  if ($LASTEXITCODE -ge 8) { Falla "No se pudo copiar $origen a $dest" }
}
function LeerEnv($ruta) {
  $valores = @{}
  if (Test-Path $ruta) {
    foreach ($l in Get-Content $ruta) {
      if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$' -and -not $l.TrimStart().StartsWith('#')) { $valores[$Matches[1]] = $Matches[2] }
    }
  }
  return $valores
}
function PonerEnv($ruta, $clave, $valor) {
  $lineas = Get-Content $ruta
  $hecho = $false
  $nuevas = foreach ($l in $lineas) {
    if ($l -match "^\s*$clave\s*=") { "$clave=$valor"; $hecho = $true } else { $l }
  }
  if (-not $hecho) { $nuevas += "$clave=$valor" }
  [IO.File]::WriteAllLines($ruta, [string[]]$nuevas, (New-Object Text.UTF8Encoding($false)))
}
function NuevaClave([int]$largo) {
  $c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  $bytes = New-Object byte[] $largo
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $c[$_ % $c.Length] })
}

$backendRepo = Join-Path $Repositorio 'backend'
$frontendRepo = Join-Path $Repositorio 'frontend'
if (-not (Test-Path (Join-Path $backendRepo 'package.json'))) { Falla "No se encontró el proyecto en $Repositorio" }
$version = ''
try { $version = (& git -C $Repositorio log -1 --format='%h %s' 2>$null) } catch { }

Paso "Compilar el backend ($version)"
Ejecutar 'npm ci --no-audit --no-fund' $backendRepo
if (-not $SinPruebas) { Ejecutar 'npm test' $backendRepo; Ok 'Pruebas del backend correctas' }
Ejecutar 'npm run build' $backendRepo
Ok 'Backend compilado'

Paso 'Compilar el frontend'
Ejecutar 'npm ci --no-audit --no-fund' $frontendRepo
Ejecutar 'npx ng build --configuration production' $frontendRepo
Ok 'Frontend compilado'

Paso 'Detener la versión en uso'
$tarea = Get-ScheduledTask -TaskName 'SGTH - Sistema' -ErrorAction SilentlyContinue
if ($tarea) { Stop-ScheduledTask -InputObject $tarea -ErrorAction SilentlyContinue }
# Solo el proceso de la versión en uso (el de desarrollo en C:\Proyectos no se toca)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*C:\SGTH\app\backend\dist\main.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Ok 'Detenida'

Paso "Copiar a $Destino"
$backendApp = Join-Path $Destino 'backend'
New-Item -ItemType Directory -Force -Path $backendApp | Out-Null
Copiar (Join-Path $backendRepo 'dist') (Join-Path $backendApp 'dist')
Copiar (Join-Path $backendRepo 'assets') (Join-Path $backendApp 'assets')
Copiar (Join-Path $backendRepo 'scripts') (Join-Path $backendApp 'scripts')
Copy-Item (Join-Path $backendRepo 'package.json'), (Join-Path $backendRepo 'package-lock.json') $backendApp -Force
Copiar (Join-Path $frontendRepo 'dist\frontend\browser') (Join-Path $Destino 'frontend')
Copy-Item (Join-Path $PSScriptRoot 'iniciar-sgth.cmd'), (Join-Path $PSScriptRoot 'respaldo.cmd'), (Join-Path $PSScriptRoot 'vigilante.cmd') 'C:\SGTH\scripts' -Force
Ejecutar 'npm ci --omit=dev --no-audit --no-fund' $backendApp
Set-Content -Path (Join-Path $Destino 'VERSION.txt') -Value "$version`r`nInstalada: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -Encoding UTF8
Ok 'Copiado'

Paso 'Configuración (.env de producción)'
$envProd = Join-Path $backendApp '.env'
if (-not (Test-Path $envProd)) {
  Copy-Item (Join-Path $PSScriptRoot 'env-produccion.ejemplo') $envProd
  $dev = LeerEnv (Join-Path $backendRepo '.env')
  foreach ($k in 'DB_USER', 'DB_PASSWORD', 'JWT_SECRETO') { if ($dev[$k]) { PonerEnv $envProd $k $dev[$k] } }
  # Mientras no haya certificado (paso 4) funciona en http, puerto 80
  PonerEnv $envProd 'PORT' '80'
  # Clave de cifrado de los respaldos: se muestra una sola vez
  $claveRespaldo = NuevaClave 28
  PonerEnv $envProd 'RESPALDO_CLAVE' $claveRespaldo
  $onedrive = $env:OneDriveCommercial
  if ($onedrive) { PonerEnv $envProd 'RESPALDO_DESTINO' (Join-Path $onedrive 'SGTH-Respaldos') }
  $seg = Read-Host 'Clave del usuario sgth_respaldo de MariaDB (la que puso en el script 012)' -AsSecureString
  $plano = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
  PonerEnv $envProd 'RESPALDO_DB_CLAVE' $plano
  Write-Host ''
  Write-Host '    =========================================================' -ForegroundColor Yellow
  Write-Host '    CLAVE DE LOS RESPALDOS (guárdela fuera de este portátil):' -ForegroundColor Yellow
  Write-Host "        $claveRespaldo" -ForegroundColor White
  Write-Host '    Sin ella no se pueden restaurar los respaldos.' -ForegroundColor Yellow
  Write-Host '    =========================================================' -ForegroundColor Yellow
  Read-Host '    Cuando la haya guardado, presione Enter'
  if (-not $onedrive) { Aviso 'No se encontró OneDrive de la empresa: escriba RESPALDO_DESTINO en el .env' }
  Ok "Creado $envProd"
}
$cfg = LeerEnv $envProd
$faltan = @('DB_PASSWORD', 'JWT_SECRETO', 'RESPALDO_CLAVE', 'RESPALDO_DB_CLAVE', 'RESPALDO_DESTINO') | Where-Object { -not $cfg[$_] }
if ($faltan) { Aviso "Faltan en el .env: $($faltan -join ', '). Ábralo con: notepad $envProd" }
if (-not $cfg['HTTPS_CERT']) { Aviso 'Todavía sin certificado: el sistema queda en http. Haga el paso 4 (4-certificado.ps1).' }

Paso 'Tareas programadas'
# Se registran siempre (si ya existen se actualizan): así una actualización agrega las tareas nuevas
& (Join-Path $PSScriptRoot '3-tareas-programadas.ps1')

Paso 'Iniciar el SGTH'
if ($faltan) { Aviso 'No se inicia hasta completar el .env. Después ejecute: Start-ScheduledTask -TaskPath \SGTH\ -TaskName "SGTH - Sistema"'; exit 0 }
Start-ScheduledTask -TaskPath '\SGTH\' -TaskName 'SGTH - Sistema'
$https = [bool]$cfg['HTTPS_CERT']
$url = if ($https) { 'https://localhost/api/salud' } else { "http://localhost:$($cfg['PORT'])/api/salud" }
$listo = $false
for ($i = 0; $i -lt 30 -and -not $listo; $i++) {
  Start-Sleep -Seconds 2
  $r = & curl.exe -sk --max-time 3 $url 2>$null
  if ($r -match '"backend"') { $listo = $true }
}
if ($listo -and $r -match '"baseDatos"\s*:\s*"ok"') { Ok "El SGTH responde en $url" }
elseif ($listo) { Aviso 'El SGTH responde pero no se conecta a MariaDB. Revise el servicio de MariaDB y DB_PASSWORD en el .env' }
else { Aviso "El SGTH no respondió todavía. Revise C:\SGTH\logs\sgth.log" }
Write-Host "`n    Versión instalada: $version" -ForegroundColor Green
