<#
  SGTH - Paso 5: comprobar desde CUALQUIER PC de la oficina que el sistema funciona.
  No necesita permisos de administrador (salvo -AgregarHosts).

  Uso:
    powershell -ExecutionPolicy Bypass -File .\5-verificar.ps1 -Dominio sgth.miempresa.com

  Si el PC no encuentra el dominio (algunos routers bloquean las respuestas con IP
  interna), se puede agregar en el archivo hosts de ese PC (como administrador):
    .\5-verificar.ps1 -Dominio sgth.miempresa.com -AgregarHosts -IP 192.168.1.50
#>
param(
  [Parameter(Mandatory = $true)][string]$Dominio,
  [switch]$AgregarHosts,
  [string]$IP
)
function Ok($t) { Write-Host "  OK  $t" -ForegroundColor Green }
function Mal($t) { Write-Host "  XX  $t" -ForegroundColor Red }
function Aviso($t) { Write-Host "  !!  $t" -ForegroundColor Yellow }
$Dominio = $Dominio.Trim().ToLower()

if ($AgregarHosts) {
  if (-not $IP) { Mal 'Indique -IP con la IP fija del servidor'; exit 1 }
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { Mal 'Para -AgregarHosts abra PowerShell como administrador'; exit 1 }
  $hosts = "$env:WINDIR\System32\drivers\etc\hosts"
  $lineas = @(Get-Content $hosts | Where-Object { $_ -notmatch "\s$([regex]::Escape($Dominio))\s*$" })
  $lineas += "$IP`t$Dominio"
  Set-Content -Path $hosts -Value $lineas -Encoding ASCII
  Ok "Agregado al archivo hosts: $IP $Dominio"
}

Write-Host "`nComprobando https://$Dominio desde $env:COMPUTERNAME`n"
$ipDns = $null
try {
  $ipDns = ([Net.Dns]::GetHostAddresses($Dominio) | Where-Object AddressFamily -eq 'InterNetwork' | Select-Object -First 1).IPAddressToString
  Ok "El nombre $Dominio corresponde a $ipDns"
} catch {
  Mal "Este PC no encuentra $Dominio."
  Aviso 'Revise el registro A en GoDaddy, o use -AgregarHosts -IP <IP del servidor> en este PC.'
  exit 1
}

$tcp = Test-NetConnection -ComputerName $ipDns -Port 443 -WarningAction SilentlyContinue
if ($tcp.TcpTestSucceeded) { Ok 'El puerto 443 del servidor responde' }
else { Mal 'No hay conexión al puerto 443. ¿El portátil está prendido y en la misma red? ¿El firewall tiene la regla "SGTH - HTTPS"?'; exit 1 }

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $req = [Net.HttpWebRequest]::Create("https://$Dominio/api/salud")
  $req.Timeout = 8000
  $resp = $req.GetResponse()
  $lector = New-Object IO.StreamReader($resp.GetResponseStream())
  $cuerpo = $lector.ReadToEnd()
  $resp.Close()
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($req.ServicePoint.Certificate)
  $dias = [int]($cert.NotAfter - (Get-Date)).TotalDays
  Ok "Certificado válido, emitido por $($cert.Issuer.Split(',')[0] -replace 'CN=',''); vence en $dias días"
  if ($cuerpo -match '"baseDatos"\s*:\s*"ok"') { Ok 'El SGTH y la base de datos funcionan' }
  else { Aviso "El SGTH responde pero la base de datos no: $cuerpo" }
} catch {
  Mal "No se pudo abrir https://$Dominio : $($_.Exception.InnerException.Message) $($_.Exception.Message)"
  exit 1
}
Write-Host "`nListo: en este PC se entra con https://$Dominio" -ForegroundColor Green
