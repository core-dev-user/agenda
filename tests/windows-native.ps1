# Compiles against the real Windows/.NET Framework APIs and exercises the helper protocol.
# Does not hide or replace the runner's taskbar.
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dir = Join-Path ([IO.Path]::GetTempPath()) ('agenda-shell-test-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $dir | Out-Null
$dll = Join-Path $dir 'AgendaShell.dll'
$journal = Join-Path $dir 'recovery-test.txt'
$source = Join-Path $repo 'electron\native\AgendaShell.cs'
Add-Type -Path $source -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly $dll
$hostScript = Join-Path $repo 'electron\native\host.ps1'
$info = New-Object Diagnostics.ProcessStartInfo
$info.FileName = 'powershell.exe'
$info.Arguments = '-NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File "' + $hostScript + '" -OwnerPid ' + $PID + ' -RecoveryFile "' + $journal + '" -AssemblyFile "' + $dll + '"'
$info.UseShellExecute = $false
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.CreateNoWindow = $true
$child = [Diagnostics.Process]::Start($info)
function Read-Reply {
  param([int]$RequestId = 0)
  for ($i=0; $i -lt 30; $i++) {
    $read = $child.StandardOutput.ReadLineAsync()
    if (!$read.Wait(10000)) { throw 'Native protocol timeout' }
    $line = $read.Result
    if (!$line) { throw ('Native process ended: ' + $child.StandardError.ReadToEnd()) }
    $message = $line | ConvertFrom-Json
    if ($message.ready -or $message.id -eq $RequestId) { return $message }
    if ($message.error -and !$message.id) { throw $message.error }
  }
  throw 'Too many unsolicited messages'
}
try {
  if (!(Read-Reply).ready) { throw 'Expected ready handshake' }
  $child.StandardInput.WriteLine("1`theartbeat")
  if ((Read-Reply 1).result -ne 'ok') { throw 'Heartbeat failed' }
  $child.StandardInput.WriteLine("2`tlist")
  $snapshot = (Read-Reply 2).result | ConvertFrom-Json
  if ($null -eq $snapshot.wins -or $null -eq $snapshot.fg) { throw 'Invalid window snapshot' }
  $child.StandardInput.WriteLine("3`tappbar 0 3 0 0 1920 1080 64")
  if (!(Read-Reply 3).error) { throw 'Invalid window handle should be rejected' }
  if (Test-Path $journal) { throw 'Invalid activation changed recovery state' }
  $child.StandardInput.WriteLine("4`trestore")
  if ((Read-Reply 4).result -ne 'ok') { throw 'Restore failed' }
  $child.StandardInput.Close()
  if (!$child.WaitForExit(10000)) { throw 'Helper did not stop on EOF' }
  if ($child.ExitCode -ne 0) { throw $child.StandardError.ReadToEnd() }
  Write-Host 'PASS: Windows compilation, startup, heartbeat, snapshot, invalid HWND, restore, EOF.'
} finally {
  if (!$child.HasExited) { $child.Kill(); $child.WaitForExit() }
  $child.Dispose()
  Remove-Item -Recurse -Force $dir
}
