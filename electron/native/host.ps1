param([int]$OwnerPid, [string]$RecoveryFile, [string]$AssemblyFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
  if (!(Test-Path $AssemblyFile)) {
    Add-Type -Path (Join-Path $PSScriptRoot 'AgendaShell.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly $AssemblyFile
  }
  Add-Type -Path $AssemblyFile
  [AgWin]::Run($OwnerPid, $RecoveryFile)
} catch {
  [Console]::WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
}
