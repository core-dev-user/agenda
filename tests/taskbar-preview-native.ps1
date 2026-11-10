# Only thumbnail commands are exposed; the real taskbar and keyboard are untouched.
$ErrorActionPreference = 'Stop'
$source = Get-Content (Join-Path $PSScriptRoot '../electron/winhelper.cjs') -Raw -Encoding UTF8
$match = [regex]::Match($source, '(?s)const CS = String\.raw`(.*?)`')
if (-not $match.Success) { throw 'Native source missing' }
Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms -TypeDefinition $match.Groups[1].Value
[AgWin]::Dpi()
$flags = [Reflection.BindingFlags]'NonPublic,Static'
$thumbs = [AgWin].GetField('thumbs', $flags)
$peeks = [AgWin].GetField('peeks', $flags)
'ready'
try {
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    $a = $line.Split(' ')
    if ($a[0] -eq 'pshow') {
      [AgWin]::PeekShow($a[1], [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], ($a[6] -eq '1'))
      'shown:' + $peeks.GetValue($null).Count + ':' + $thumbs.GetValue($null).Count
    } elseif ($a[0] -eq 'phide') {
      [AgWin]::PeekHide()
      'hidden:' + $peeks.GetValue($null).Count + ':' + $thumbs.GetValue($null).Count
    } else { throw "Unexpected test command: $line" }
  }
} finally { [AgWin]::PeekHide() }
