# Compiles against the real Windows/.NET Framework APIs and exercises the helper protocol.
# Does not hide or replace the runner's taskbar.
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dir = Join-Path ([IO.Path]::GetTempPath()) ('agenda-shell-test-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $dir | Out-Null
$dll = Join-Path $dir 'AgendaShell.dll'
$journal = Join-Path $dir 'recovery-test.txt'
$source = Join-Path $repo 'electron\native\AgendaShell.cs'
Add-Type -Path $source -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly (Join-Path $dir 'compile-check.dll')
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
$guard = $null
function Send-Command([int]$Id, [string]$Command) {
  $bytes = [Text.Encoding]::UTF8.GetBytes("$Id`t$Command`n")
  $child.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $child.StandardInput.BaseStream.Flush()
}
function Read-Reply {
  param([int]$RequestId = 0)
  for ($i=0; $i -lt 30; $i++) {
    $read = $child.StandardOutput.ReadLineAsync()
    if (!$read.Wait(10000)) { throw 'Native protocol timeout' }
    $line = $read.Result
    if (!$line) { throw ('Native process ended: ' + $child.StandardError.ReadToEnd()) }
    $message = $line | ConvertFrom-Json
    if ($message.ready -or $message.id -eq $RequestId) { return $message }
    if ($message.error -and !$message.id) { throw ("Request $RequestId failed: " + $message.error) }
  }
  throw 'Too many unsolicited messages'
}
try {
  if (!(Read-Reply).ready) { throw 'Expected ready handshake' }
  $watchdog = Join-Path $repo 'electron\native\watchdog.ps1'
  $info.Arguments = '-NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File "' + $watchdog + '" -OwnerPid ' + $PID + ' -HelperPid ' + $child.Id + ' -RecoveryFile "' + $journal + '" -AssemblyFile "' + $dll + '"'
  $guard = [Diagnostics.Process]::Start($info)
  $guardReady = $guard.StandardOutput.ReadLineAsync()
  if (!$guardReady.Wait(10000) -or !(($guardReady.Result | ConvertFrom-Json).ready)) { throw 'Recovery process did not start' }
  Send-Command 1 'heartbeat'
  if ((Read-Reply 1).result -ne 'ok') { throw 'Heartbeat failed' }
  Send-Command 2 'list'
  $snapshot = (Read-Reply 2).result | ConvertFrom-Json
  if ($null -eq $snapshot.wins -or $null -eq $snapshot.fg) { throw 'Invalid window snapshot' }
  Send-Command 3 'appbar 0 3 0 0 1920 1080 64'
  if (!(Read-Reply 3).error) { throw 'Invalid window handle should be rejected' }
  if (Test-Path $journal) { throw 'Invalid activation changed recovery state' }
  Send-Command 4 'restore'
  if ((Read-Reply 4).result -ne 'ok') { throw 'Restore failed' }
  $child.StandardInput.Close()
  if (!$child.WaitForExit(10000)) { throw 'Helper did not stop on EOF' }
  if ($child.ExitCode -ne 0) { throw $child.StandardError.ReadToEnd() }
  if (!$guard.WaitForExit(10000) -or $guard.ExitCode -ne 0) { throw 'Recovery process did not finish cleanly' }
  Write-Host 'PASS: Windows compilation, startup, heartbeat, snapshot, invalid HWND, restore, EOF, independent watchdog.'
} finally {
  if (!$child.HasExited) { $child.Kill(); $child.WaitForExit() }
  $child.Dispose()
  if ($guard) { if (!$guard.HasExited) { $guard.Kill(); $guard.WaitForExit() }; $guard.Dispose() }
  Remove-Item -Recurse -Force $dir
}
