#Requires -RunAsAdministrator
<#
  SGTH - Paso 1: preparar el portátil como servidor (se ejecuta una sola vez).

  Qué hace:
   - Crea C:\SGTH (app, archivos, respaldos, logs, certificado, scripts) y deja
     el acceso solo a SYSTEM y a los administradores (hay datos sensibles).
   - Renombra el equipo a SGTH-SERVIDOR (requiere reiniciar).
   - Nunca suspender ni hibernar con el cargador, y no hacer nada al cerrar la tapa.
   - Horario activo de Windows Update (no reinicia entre 6 a. m. y 8 p. m.).
   - Red como "Privada" y reglas del firewall: 443 y 80 solo desde la red local;
     bloquea MariaDB (3306) desde otros equipos.
   - Revisa Node.js, el servicio de MariaDB, BitLocker y que los puertos estén libres.
   - Muestra la MAC y la IP actual para pedirle a TI la IP fija.

  Uso (PowerShell como administrador):
    cd C:\Proyectos\SGTH\despliegue
    powershell -ExecutionPolicy Bypass -File .\1-preparar-servidor.ps1
#>
param(
  [string]$NombreEquipo = 'SGTH-SERVIDOR',
  [int]$HoraInicio = 6,
  [int]$HoraFin = 20
)
$ErrorActionPreference = 'Stop'
function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
$reiniciar = $false

Paso 'Carpetas en C:\SGTH'
foreach ($c in 'C:\SGTH', 'C:\SGTH\app', 'C:\SGTH\archivos', 'C:\SGTH\respaldos', 'C:\SGTH\logs', 'C:\SGTH\certificado', 'C:\SGTH\scripts') {
  New-Item -ItemType Directory -Force -Path $c | Out-Null
}
# Solo SYSTEM (S-1-5-18) y Administradores (S-1-5-32-544): los usuarios normales no ven los documentos ni las claves
& icacls 'C:\SGTH' /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C /Q | Out-Null
Ok 'Carpetas creadas; acceso solo para SYSTEM y administradores'

Paso "Nombre del equipo: $NombreEquipo"
if ($env:COMPUTERNAME -ieq $NombreEquipo) {
  Ok 'El equipo ya tiene ese nombre'
} else {
  Rename-Computer -NewName $NombreEquipo -Force
  $reiniciar = $true
  Aviso "El equipo se llamará $NombreEquipo después de reiniciar"
}

Paso 'Energía (con el cargador conectado)'
& powercfg /change standby-timeout-ac 0
& powercfg /change hibernate-timeout-ac 0
& powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
& powercfg /setactive SCHEME_CURRENT
Ok 'No se suspende ni hiberna, y sigue funcionando con la tapa cerrada'

Paso "Windows Update: horario activo de $HoraInicio a $HoraFin"
$ruta = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
if (-not (Test-Path $ruta)) { New-Item -Path $ruta -Force | Out-Null }
Set-ItemProperty -Path $ruta -Name ActiveHoursStart -Value $HoraInicio -Type DWord
Set-ItemProperty -Path $ruta -Name ActiveHoursEnd -Value $HoraFin -Type DWord
Set-ItemProperty -Path $ruta -Name SmartActiveHoursState -Value 0 -Type DWord
Ok 'Windows no reiniciará solo en horario laboral'

Paso 'Red y firewall'
foreach ($p in Get-NetConnectionProfile) {
  if ($p.NetworkCategory -eq 'Public') {
    try {
      Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
      Ok "La red '$($p.Name)' quedó como Privada"
    } catch {
      Aviso "No se pudo poner la red '$($p.Name)' como Privada. Hágalo en Configuración > Red e Internet."
    }
  } else {
    Ok "Red '$($p.Name)': $($p.NetworkCategory)"
  }
}
Get-NetFirewallRule -DisplayName 'SGTH*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'SGTH - HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Domain, Private -RemoteAddress LocalSubnet | Out-Null
New-NetFirewallRule -DisplayName 'SGTH - HTTP (pasa a HTTPS)' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain, Private -RemoteAddress LocalSubnet | Out-Null
New-NetFirewallRule -DisplayName 'SGTH - Bloquear MariaDB desde la red' -Direction Inbound -Protocol TCP -LocalPort 3306 -Action Block -Profile Any | Out-Null
Ok 'Puertos 443 y 80 abiertos solo para la red local; MariaDB bloqueado desde otros equipos'

Paso 'Puertos 443 y 80 libres'
$ocupados = Get-NetTCPConnection -State Listen -LocalPort 443, 80 -ErrorAction SilentlyContinue
$ajenos = @($ocupados | Where-Object {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
  -not ($proc -and $proc.CommandLine -like '*C:\SGTH\app*')
})
if ($ajenos.Count -eq 0) { Ok 'Libres' } else {
  foreach ($o in $ajenos) {
    $n = (Get-Process -Id $o.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Aviso "El puerto $($o.LocalPort) lo usa '$n' (proceso $($o.OwningProcess)). Ciérrelo o desactívelo (por ejemplo IIS o Skype)."
  }
}

Paso 'Programas necesarios'
try {
  $v = (& node --version).Trim()
  if ([int]($v.TrimStart('v').Split('.')[0]) -ge 20) { Ok "Node.js $v" } else { Aviso "Node.js $v es antiguo: instale la versión LTS actual" }
} catch { Aviso 'No se encontró Node.js. Instálelo desde nodejs.org (versión LTS) para todos los usuarios.' }
$maria = Get-Service -Name 'MariaDB*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($maria) {
  if ($maria.StartType -ne 'Automatic') { Set-Service -Name $maria.Name -StartupType Automatic }
  Ok "Servicio $($maria.Name): $($maria.Status), arranque automático"
} else { Aviso 'No se encontró el servicio de MariaDB' }

Paso 'Cifrado del disco (BitLocker)'
try {
  $bl = Get-BitLockerVolume -MountPoint 'C:'
  if ($bl.ProtectionStatus -eq 'On') { Ok 'El disco C: está cifrado con BitLocker' }
  else { Aviso 'El disco C: NO está cifrado. Si roban el portátil, se pueden leer los datos. Pida a TI activar BitLocker.' }
} catch { Aviso 'No se pudo revisar BitLocker (pida a TI que confirme que el disco está cifrado)' }

Paso 'Datos para pedir la IP fija a TI'
Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {
  $ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
  Write-Host ("    Adaptador: {0,-25} MAC: {1}   IP actual: {2}" -f $_.Name, $_.MacAddress, $ip)
}
Write-Host '    Pida a TI reservar una IP fija para esa MAC (reserva DHCP en el router).'

Write-Host ''
if ($reiniciar) { Aviso 'Reinicie el equipo para aplicar el nombre nuevo y luego siga con el paso 2.' }
else { Ok 'Listo. Siga con el paso 2 (2-instalar-o-actualizar.ps1).' }
