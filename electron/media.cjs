// "O que está tocando" de qualquer player do PC (Spotify, Deezer, Apple Music, navegador…)
// pela central de mídia do Windows (a mesma do controle de volume do Windows).
// Só roda enquanto algum widget está inscrito.
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")

const PS = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $null = $task.Wait(5000); $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$lastKey = ''
$want = ''
function Pick() {
  $all = @($mgr.GetSessions())
  if ($want) { $m = $all | Where-Object { $_.SourceAppUserModelId -like "*$want*" } | Select-Object -First 1; if ($m) { return $m } }
  # sem preferência: o que estiver tocando, senão o atual do Windows (ignora o próprio Agenda)
  $others = $all | Where-Object { $_.SourceAppUserModelId -notlike '*agenda*' }
  $p = $others | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 4 } | Select-Object -First 1
  if ($p) { return $p }
  $c = $mgr.GetCurrentSession(); if ($c -and $c.SourceAppUserModelId -notlike '*agenda*') { return $c }
  return ($others | Select-Object -First 1)
}
# [Console]::In bloqueia no ReadLineAsync; um leitor próprio da entrada padrão é assíncrono de verdade
$in = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $null
while ($true) {
  # comandos: "want spotify", "toggle", "next", "prev"
  while ($true) {
    if ($pending -eq $null) { $pending = $in.ReadLineAsync() }
    if (-not $pending.IsCompleted) { break }
    $cmd = $pending.Result; $pending = $null
    if ($cmd -eq $null) { exit }
    $s = Pick
    switch -Wildcard ($cmd) {
      'want *' { $want = $cmd.Substring(5).Trim(); $lastKey = '' }
      'toggle' { if ($s) { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) } }
      'next'   { if ($s) { $null = Await ($s.TrySkipNextAsync()) ([bool]) } }
      'prev'   { if ($s) { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) } }
    }
  }
  $s = Pick
  if (-not $s) { '{"none":true}'; Start-Sleep -Milliseconds 1500; continue }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $pb = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
  $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
  $art = $null
  if ($key -ne $lastKey -and $p.Thumbnail) {
    $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if ($st) {
      $ns = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
      $ms = New-Object System.IO.MemoryStream; $ns.CopyTo($ms)
      $art = 'data:' + $st.ContentType + ';base64,' + [Convert]::ToBase64String($ms.ToArray())
      $ns.Dispose(); $ms.Dispose()
    }
  }
  $o = [ordered]@{
    app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle
    playing = ($pb.PlaybackStatus -eq 4); pos = [math]::Round($tl.Position.TotalSeconds, 1); dur = [math]::Round($tl.EndTime.TotalSeconds, 1)
    canNext = $pb.Controls.IsNextEnabled; canPrev = $pb.Controls.IsPreviousEnabled
  }
  if ($key -ne $lastKey) { $o.art = $art; $o.newTrack = $true; $lastKey = $key }
  ($o | ConvertTo-Json -Compress)
  Start-Sleep -Milliseconds 1000
}
`

let ps = null
let buf = ""
let want = ""
let last = null
const subs = new Set()
let getWin = () => null

function start() {
  if (ps || process.platform !== "win32") return
  const file = path.join(os.tmpdir(), "agenda-media.ps1")
  try { fs.writeFileSync(file, "﻿" + PS, "utf8") } catch { return }
  try {
    ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true })
  } catch { ps = null; return }
  if (want) ps.stdin.write("want " + want + "\n")
  ps.stdout.on("data", (d) => {
    buf += d.toString("utf8")
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ""
    for (const l of lines) {
      if (!l.trim().startsWith("{")) continue
      try {
        const o = JSON.parse(l)
        // a capa só vem quando a música muda: guarda para quem se inscrever depois
        if (o.newTrack) last = o
        else if (last && !o.none) o.art = last.art
        if (o.none) last = null
        const w = getWin()
        if (w && !w.isDestroyed()) w.webContents.send("media:state", o)
      } catch {}
    }
  })
  ps.on("exit", () => { ps = null })
}
function stop() { if (ps) { try { ps.kill() } catch {} ps = null } }

function register(ipcMain, winGetter) {
  getWin = winGetter
  ipcMain.handle("media:sub", (_e, id, app) => {
    subs.add(id)
    if (typeof app === "string" && app !== want) { want = app; if (ps) ps.stdin.write("want " + app + "\n") }
    start()
    return last
  })
  ipcMain.handle("media:unsub", (_e, id) => { subs.delete(id); if (!subs.size) stop() })
  ipcMain.handle("media:cmd", (_e, cmd) => { if (ps && ["toggle", "next", "prev"].includes(cmd)) ps.stdin.write(cmd + "\n") })
}

module.exports = { register }
