param([int]$OwnerPid, [string]$RecoveryFile, [string]$AssemblyFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
try {
  if (!(Test-Path $AssemblyFile)) {
    Add-Type -Path (Join-Path $PSScriptRoot 'AgendaShell.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly $AssemblyFile
  }
  try { Add-Type -Path $AssemblyFile } catch { Remove-Item -Force $AssemblyFile -ErrorAction SilentlyContinue; throw }
  [AgWin]::Run($OwnerPid, $RecoveryFile)
} catch {
  [Console]::WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
}
