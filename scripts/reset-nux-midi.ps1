#Requires -Version 5.1
<#
  Reset NUX MG-30 MIDI stack without reboot.
  Run: powershell -ExecutionPolicy Bypass -File scripts/reset-nux-midi.ps1
#>
$ErrorActionPreference = 'Continue'

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Elevando para Administrador (aceite o UAC)...'
    $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args -Wait
    exit $LASTEXITCODE
  }
}

Assert-Admin
Write-Host '=== RESET NUX MIDI (admin) ===' -ForegroundColor Cyan

Write-Host "`n[1/5] Encerrando processos..."
@('QuickTone','ucore','NUXUSBAudioCpl','audiodg') | ForEach-Object {
  Get-Process -Name $_ -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host "`n[2/5] Reiniciando MidiSrv..."
try {
  Restart-Service MidiSrv -Force -ErrorAction Stop
  Write-Host '  MidiSrv OK'
} catch {
  sc.exe stop MidiSrv | Out-Null
  Start-Sleep 2
  sc.exe start MidiSrv | Out-Null
  Write-Host "  MidiSrv via sc: $((Get-Service MidiSrv).Status)"
}

Write-Host "`n[3/5] Removendo dispositivos NUX fantasma..."
Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match 'NUX|MG-30' } |
  ForEach-Object {
    Write-Host ("  remove [{0}] {1}" -f $_.Status, $_.FriendlyName)
    pnputil /remove-device $_.InstanceId 2>&1 | Out-Null
  }

Write-Host "`n[4/5] Reiniciando hubs USB..."
Get-PnpDevice -Class USB -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match 'Root Hub|Host Controller|xHCI' -and $_.Status -eq 'OK' } |
  ForEach-Object {
    Write-Host ("  restart {0}" -f $_.FriendlyName)
    pnputil /restart-device $_.InstanceId 2>&1 | Out-Null
  }

Start-Sleep 3

Write-Host "`n[5/5] Status NUX agora:"
Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match 'NUX|MG-30' } |
  Select-Object Status, FriendlyName |
  Format-Table -AutoSize

Write-Host @"

Pronto.
1) Se o pedal estiver ligado, DESCONECTE o USB e RECONECTE agora.
2) Espere o Windows reconhecer.
3) Rode: nux status

"@ -ForegroundColor Green

pause
