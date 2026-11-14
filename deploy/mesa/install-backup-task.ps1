# Registra (ou substitui) a tarefa agendada "Mesa - Backup": todo dia às 04:00,
# roda deploy/mesa/backup.sh na pasta do servidor pelo Git Bash. Se o PC estiver
# desligado ou dormindo nessa hora, roda assim que der (StartWhenAvailable).
# Roda como o usuário atual e só com ele conectado, porque o Docker Desktop
# precisa estar aberto.
#   powershell -ExecutionPolicy Bypass -File deploy\mesa\install-backup-task.ps1

$ErrorActionPreference = 'Stop'

$bash = 'C:\Program Files\Git\bin\bash.exe'
$command = 'cd /c/Users/Usuario/MesaServer && bash deploy/mesa/backup.sh'

$action = New-ScheduledTaskAction -Execute $bash -Argument "-lc `"$command`""
$trigger = New-ScheduledTaskTrigger -Daily -At '04:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName 'Mesa - Backup' -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host 'Tarefa "Mesa - Backup" registrada: todo dia, 04:00.'
