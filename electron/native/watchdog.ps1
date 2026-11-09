param([int]$OwnerPid, [int]$HelperPid, [string]$RecoveryFile, [string]$AssemblyFile)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -Path $AssemblyFile
  $owner = Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue
  $helper = Get-Process -Id $HelperPid -ErrorAction SilentlyContinue
  [Console]::WriteLine('{"ready":true}')
  while ($owner -and $helper -and !$owner.HasExited -and !$helper.HasExited) {
    Start-Sleep -Milliseconds 1000
  }
} finally {
  # Processo independente: funciona mesmo se Electron e ajudante forem encerrados à força.
  [AgWin]::Recover($RecoveryFile, $HelperPid)
}
