#Requires -RunAsAdministrator
<#
  SGTH - Paso 4: certificado HTTPS gratuito de Let's Encrypt con el dominio de la empresa.

  Usa win-acme (wacs.exe) y la validación "acme-dns": se crea UNA SOLA VEZ un registro
  CNAME en GoDaddy y desde ahí win-acme renueva el certificado solo (tarea programada
  propia de win-acme). El SGTH carga el certificado renovado sin reiniciarse.

  Antes:
   1. Descargue win-acme desde https://www.win-acme.com (versión x64 "trimmed") y
      descomprímalo en C:\SGTH\win-acme (debe quedar C:\SGTH\win-acme\wacs.exe).
      TI debe permitir wacs.exe en el antivirus.
   2. En GoDaddy, registro A:  sgth  →  IP fija del portátil   (ver la guía)
   3. Ya debe estar instalado el SGTH (paso 2).

  Uso (PowerShell como administrador):
    .\4-certificado.ps1 -Dominio sgth.miempresa.com -Correo sistemas@miempresa.com

  Si todavía no hay certificado, el script abre el menú de win-acme y muestra en
  pantalla qué elegir. win-acme muestra un registro CNAME: se crea en GoDaddy, se
  espera unos minutos y se presiona Enter. Al terminar, el script configura el SGTH.
  (La primera vez tiene que ser con el menú: win-acme no permite registrar acme-dns
  de forma automática. Las renovaciones sí son automáticas.)
#>
param(
  [Parameter(Mandatory = $true)][string]$Dominio,
  [Parameter(Mandatory = $true)][string]$Correo,
  [string]$Wacs = 'C:\SGTH\win-acme\wacs.exe',
  [string]$Carpeta = 'C:\SGTH\certificado',
  [string]$EnvProduccion = 'C:\SGTH\app\backend\.env'
)
$ErrorActionPreference = 'Stop'
function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
function Falla($t) { Write-Host "`n    ERROR: $t" -ForegroundColor Red; exit 1 }

$Dominio = $Dominio.Trim().ToLower()
if ($Dominio -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)+$') { Falla "Dominio no válido: $Dominio" }
if (-not (Test-Path $Wacs)) { Falla "No se encontró $Wacs. Descargue win-acme y descomprímalo en C:\SGTH\win-acme" }
if (-not (Test-Path $EnvProduccion)) { Falla 'Primero instale el SGTH (paso 2)' }

Paso "Comprobar que $Dominio apunta a este equipo"
try {
  $ipDns = (Resolve-DnsName -Name $Dominio -Type A -ErrorAction Stop | Where-Object Type -eq 'A' | Select-Object -First 1).IPAddress
  $propias = (Get-NetIPAddress -AddressFamily IPv4).IPAddress
  if ($propias -contains $ipDns) { Ok "$Dominio → $ipDns (este equipo)" }
  else { Aviso "$Dominio apunta a $ipDns, que no es una IP de este equipo ($($propias -join ', ')). Revise el registro A en GoDaddy." }
} catch { Aviso "$Dominio todavía no existe en el DNS. Cree el registro A en GoDaddy (el certificado se puede pedir igual)." }

Paso 'Certificado de Let''s Encrypt'
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
function Buscar() {
  $c = Get-ChildItem $Carpeta -Filter '*-chain.pem' -ErrorAction SilentlyContinue | Where-Object Name -notlike '*chain-only*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $k = Get-ChildItem $Carpeta -Filter '*-key.pem' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  return @($c, $k)
}
$cadena, $llave = Buscar
if (-not $cadena) {
  Write-Host ''
  Write-Host '    Se abrirá win-acme. Elija, en este orden:' -ForegroundColor Yellow
  Write-Host '     1. "M: Create certificate (full options)"'
  Write-Host '     2. Origen de los dominios: "Manual input"'
  Write-Host "     3. Escriba el dominio: $Dominio   (nombre amigable: Enter)"
  Write-Host '     4. Validación: "[dns] Create verification records with acme-dns"'
  Write-Host '     5. Servidor acme-dns: https://auth.acme-dns.io'
  Write-Host '     6. win-acme muestra un registro CNAME. Créelo en GoDaddy:'
  Write-Host "          Tipo: CNAME   Nombre: _acme-challenge.$($Dominio.Split('.')[0])   Valor: el que muestra (termina en .auth.acme-dns.io)"
  Write-Host '        Espere 10 a 15 minutos y presione Enter en win-acme (si falla la verificación, espere más y reintente).'
  Write-Host '     7. Tipo de llave: deje la opción por defecto'
  Write-Host '     8. Dónde guardar: "PEM encoded files (Apache, nginx, etc.)"'
  Write-Host "        Ruta: $Carpeta    Contraseña: ninguna (Enter)"
  Write-Host '     9. ¿Guardar en otro lugar también?: "No (additional) store steps"'
  Write-Host '    10. Instalación: "No (additional) installation steps"'
  Write-Host "    11. Acepte los términos y escriba el correo: $Correo"
  Write-Host '    12. Al terminar, salga con "Q: Quit"'
  Read-Host "`n    Presione Enter para abrir win-acme"
  Push-Location (Split-Path $Wacs)
  try { & $Wacs } finally { Pop-Location }
  $cadena, $llave = Buscar
}
if (-not $cadena -or -not $llave) { Falla "No se encontró el certificado en $Carpeta. Vuelva a ejecutar este script y siga los pasos de win-acme." }
Ok "Certificado: $($cadena.FullName)"

# La llave privada solo la pueden leer SYSTEM y los administradores
& icacls $Carpeta /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C /Q | Out-Null

Paso 'Configurar el SGTH para usar HTTPS'
function PonerEnv($ruta, $clave, $valor) {
  $lineas = Get-Content $ruta
  $hecho = $false
  $nuevas = foreach ($l in $lineas) { if ($l -match "^\s*$clave\s*=") { "$clave=$valor"; $hecho = $true } else { $l } }
  if (-not $hecho) { $nuevas += "$clave=$valor" }
  [IO.File]::WriteAllLines($ruta, [string[]]$nuevas, (New-Object Text.UTF8Encoding($false)))
}
PonerEnv $EnvProduccion 'HTTPS_CERT' $cadena.FullName
PonerEnv $EnvProduccion 'HTTPS_KEY' $llave.FullName
PonerEnv $EnvProduccion 'PORT' '443'
PonerEnv $EnvProduccion 'HTTP_REDIRECCION_PUERTO' '80'
Ok '.env actualizado (HTTPS en el puerto 443; http://... pasa a https)'

Paso 'Reiniciar el SGTH'
Stop-ScheduledTask -TaskPath '\SGTH\' -TaskName 'SGTH - Sistema' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*C:\SGTH\app\backend\dist\main.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskPath '\SGTH\' -TaskName 'SGTH - Sistema'
Start-Sleep -Seconds 8
$r = & curl.exe -s --max-time 5 "https://$Dominio/api/salud" 2>&1
if ($r -match '"backend"') { Ok "https://$Dominio responde con certificado válido" }
else { Aviso "Todavía no responde https://$Dominio ($r). Revise C:\SGTH\logs\sgth.log y el registro A en GoDaddy." }

$renovacion = Get-ScheduledTask -TaskName 'win-acme*' -ErrorAction SilentlyContinue
if ($renovacion) { Ok "Renovación automática: tarea '$($renovacion[0].TaskName)'" }
else { Aviso 'No se encontró la tarea de renovación de win-acme. Ejecute wacs.exe y elija "Create scheduled task".' }

Write-Host "`n    Falta: en el SGTH, Configuración > Dirección del sistema = https://$Dominio (para los QR)." -ForegroundColor Cyan
