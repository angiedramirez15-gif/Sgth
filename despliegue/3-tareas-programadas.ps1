#Requires -RunAsAdministrator
<#
  SGTH - Paso 3: tareas programadas de Windows (lo llama el paso 2 la primera vez).

   - "SGTH - Sistema": arranca el SGTH al encender el equipo, aunque nadie inicie
     sesión en Windows (cuenta SYSTEM). Si se detiene por un error, se reinicia
     solo cada minuto.
   - "SGTH - Respaldo diario": respaldo cifrado a las 12:30 p. m. Si el portátil
     estaba apagado a esa hora, se hace apenas se encienda.
   - "SGTH - Vigilante": cada 15 minutos revisa que el sistema responda y, si
     se cae, avisa por correo (y otra vez cuando vuelve a funcionar).

  Ver o cambiar: Programador de tareas > Biblioteca > SGTH.
#>
param([string]$HoraRespaldo = '12:30')
$ErrorActionPreference = 'Stop'
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }

$sistema = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

# --- SGTH - Sistema ---
$accion = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\cmd.exe" -Argument '/c "C:\SGTH\scripts\iniciar-sgth.cmd"' -WorkingDirectory 'C:\SGTH\app\backend'
$alEncender = New-ScheduledTaskTrigger -AtStartup
$alEncender.Delay = 'PT1M' # espera un minuto a que arranque MariaDB
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'SGTH - Sistema' -TaskPath '\SGTH\' -Action $accion -Trigger $alEncender -Settings $ajustes -Principal $sistema `
  -Description 'Sistema de Gestión de Talento Humano. Arranca al encender el equipo y se reinicia solo si se detiene.' -Force | Out-Null
Ok 'Tarea "SGTH - Sistema": al encender el equipo'

# --- SGTH - Respaldo diario ---
$accion = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\cmd.exe" -Argument '/c "C:\SGTH\scripts\respaldo.cmd"' -WorkingDirectory 'C:\SGTH\app\backend'
$diario = New-ScheduledTaskTrigger -Daily -At $HoraRespaldo
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'SGTH - Respaldo diario' -TaskPath '\SGTH\' -Action $accion -Trigger $diario -Settings $ajustes -Principal $sistema `
  -Description 'Respaldo cifrado de la base de datos y los documentos del SGTH a OneDrive.' -Force | Out-Null
Ok "Tarea ""SGTH - Respaldo diario"": todos los días a las $HoraRespaldo"

# --- SGTH - Vigilante ---
$accion = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\cmd.exe" -Argument '/c "C:\SGTH\scripts\vigilante.cmd"' -WorkingDirectory 'C:\SGTH\app\backend'
$cada15 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 15)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'SGTH - Vigilante' -TaskPath '\SGTH\' -Action $accion -Trigger $cada15 -Settings $ajustes -Principal $sistema `
  -Description 'Revisa cada 15 minutos que el SGTH responda y avisa por correo si se cae.' -Force | Out-Null
Ok 'Tarea "SGTH - Vigilante": cada 15 minutos'
