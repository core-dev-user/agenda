// Spotify/Deezer/etc. use the Windows Global System Media Transport Controls (SMTC).
// A single PowerShell worker reads all sessions; each widget independently chooses a source.
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")
const { pickSession, mergeArtwork, retainRecentSessions } = require("./media-utils.cjs")

const PS = "$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [Text.Encoding]::UTF8\nAdd-Type -AssemblyName System.Runtime.WindowsRuntime\n$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {\n  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and\n  $_.GetParameters()[0].ParameterType.Name -eq ('IAsyncOperation' + [char]96 + '1')\n})[0]\nfunction Await($operation, [Type]$resultType) {\n  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))\n  if (-not $task.Wait(5000)) { throw 'Timeout ao ler a central de midia' }\n  return $task.Result\n}\n$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]\n$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]\n$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]\n$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]\ntry {\n  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])\n} catch {\n  '{\"sessions\":[],\"error\":\"A central de mídia do Windows não está disponível.\"}'\n  exit 1\n}\n$keys = @{}\n$covers = @{}\n$attempts = @{}\n$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())\n$pending = $null\n\nfunction ReadCover($thumbnail) {\n  if (-not $thumbnail) { return $null }\n  $stream = $null\n  $reader = $null\n  $inputStream = $null\n  try {\n    $stream = Await ($thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])\n    if (-not $stream) { return $null }\n    $length = [long]$stream.Size\n    if ($length -le 0 -or $length -gt 2097152) { return $null }\n    $inputStream = $stream.GetInputStreamAt([uint64]0)\n    $reader = [Windows.Storage.Streams.DataReader]::new($inputStream)\n    $loaded = Await ($reader.LoadAsync([uint32]$length)) ([uint32])\n    if ($loaded -le 0) { return $null }\n    $bytes = New-Object 'System.Byte[]' ([int]$loaded)\n    $reader.ReadBytes($bytes)\n    $contentType = [string]$stream.ContentType\n    if (-not $contentType.StartsWith('image/')) { $contentType = 'image/jpeg' }\n    return 'data:' + $contentType + ';base64,' + [Convert]::ToBase64String($bytes)\n  } catch {\n    return $null\n  } finally {\n    if ($reader) { $reader.Dispose() }\n    if ($inputStream) { $inputStream.Dispose() }\n    if ($stream) { $stream.Dispose() }\n  }\n}\nfunction Lookup($id) {\n  if (-not $id) { return $null }\n  return @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -eq $id } | Select-Object -First 1)[0]\n}\n\nwhile ($true) {\n  try {\n    # stdin is polled asynchronously so media updates never block waiting for commands.\n    while ($true) {\n      if ($null -eq $pending) { $pending = $stdin.ReadLineAsync() }\n      if (-not $pending.IsCompleted) { break }\n      $line = $pending.Result\n      $pending = $null\n      if ($null -eq $line) { exit 0 }\n      $parts = $line.Split(' ')\n      if ($parts.Count -lt 2) { continue }\n      $command = $parts[0]\n      if ($command -notin @('toggle', 'next', 'prev', 'seek')) { continue }\n      $id = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))\n      $s = Lookup $id\n      if (-not $s) { continue }\n      try {\n        switch ($command) {\n          'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }\n          'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }\n          'prev' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }\n          'seek' {\n            $seconds = if ($parts.Count -gt 2) { [double]$parts[2] } else { 0 }\n            $ticks = [long][Math]::Round([Math]::Max(0, $seconds) * 10000000)\n            $null = Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])\n          }\n        }\n      } catch {}\n    }\n    $current = $manager.GetCurrentSession()\n    $currentId = if ($current) { [string]$current.SourceAppUserModelId } else { '' }\n    $items = New-Object System.Collections.Generic.List[object]\n    foreach ($s in @($manager.GetSessions())) {\n      try {\n        $id = [string]$s.SourceAppUserModelId\n        if (-not $id -or $id -match '(?i)(widgy|agenda)(\\.exe|!|$)') { continue }\n        $media = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])\n        if (-not $media -or -not $media.Title) { continue }\n        $pb = $s.GetPlaybackInfo()\n        $timeline = $s.GetTimelineProperties()\n        $key = \"$id|$($media.Title)|$($media.Artist)|$($media.AlbumTitle)\"\n        if ($keys[$id] -ne $key) {\n          $keys[$id] = $key\n          $covers[$id] = $null\n          $attempts[$id] = [datetime]::MinValue\n        }\n        $art = $null\n        if (-not $covers[$id] -and $media.Thumbnail -and [DateTime]::UtcNow -ge $attempts[$id]) {\n          $attempts[$id] = [DateTime]::UtcNow.AddSeconds(6)\n          $art = ReadCover $media.Thumbnail\n          if ($art) { $covers[$id] = $art }\n        }\n        $record = [ordered]@{\n          app = $id\n          primary = ($id -eq $currentId)\n          title = [string]$media.Title\n          artist = [string]$media.Artist\n          album = [string]$media.AlbumTitle\n          playing = ($pb.PlaybackStatus -eq 4)\n          pos = [Math]::Max(0, [Math]::Round($timeline.Position.TotalSeconds, 1))\n          dur = [Math]::Max(0, [Math]::Round($timeline.EndTime.TotalSeconds, 1))\n          canNext = [bool]$pb.Controls.IsNextEnabled\n          canPrev = [bool]$pb.Controls.IsPreviousEnabled\n          canSeek = [bool]$pb.Controls.IsPlaybackPositionEnabled\n        }\n        if ($art) { $record.art = $art }\n        $items.Add($record)\n      } catch {\n        # A session can disappear between GetSessions and querying metadata.\n      }\n    }\n    @{ sessions = @($items.ToArray()) } | ConvertTo-Json -Compress -Depth 5\n  } catch {\n    '{\"sessions\":[],\"error\":\"Falha temporária ao consultar o Windows.\"}'\n  }\n  Start-Sleep -Milliseconds 1100\n}\n"

let worker = null
let buffer = ""
let sessions = []
let error = ""
let retryTimer = null
const subscribers = new Map()
const coverCache = new Map()
const lastSeen = new Map()
let getWin = () => null

const current = (id) => {
  if (process.platform !== "win32") return { widgetId: id, none: true, unsupported: true }
  const match = pickSession(sessions, subscribers.get(id))
  return match ? { ...match, widgetId: id } : { widgetId: id, none: true, error: error || undefined }
}
function notify() {
  const window = getWin()
  if (!window || window.isDestroyed()) return
  for (const id of subscribers.keys()) window.webContents.send("media:state", current(id))
}
function parse(line) {
  let payload
  try { payload = JSON.parse(line) } catch { return }
  if (!payload || !Array.isArray(payload.sessions)) return
  error = typeof payload.error === "string" ? payload.error : ""
  sessions = retainRecentSessions(sessions, payload.sessions.map((item) => mergeArtwork(item, coverCache)), lastSeen)
  const live = new Set(sessions.map((s) => s.app))
  for (const id of coverCache.keys()) if (!live.has(id)) coverCache.delete(id)
  notify()
}
function start() {
  if (worker || !subscribers.size || process.platform !== "win32") return
  clearTimeout(retryTimer)
  const file = path.join(os.tmpdir(), "widgy-media-v2.ps1")
  try { fs.writeFileSync(file, "\uFEFF" + PS, "utf8") }
  catch (e) { error = "Não foi possível iniciar o leitor de mídia."; notify(); return }
  let proc
  try {
    proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
  } catch (e) {
    error = "PowerShell indisponível no Windows."
    notify()
    return
  }
  worker = proc
  buffer = ""
  proc.stdout.on("data", (data) => {
    if (worker !== proc) return
    buffer += data.toString("utf8")
    if (buffer.length > 16 * 1024 * 1024) buffer = ""
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ""
    for (const line of lines) if (line.trim().startsWith("{")) parse(line)
  })
  proc.stderr.on("data", (data) => {
    const msg = data.toString("utf8").trim()
    if (msg) console.warn("Widgy pcmedia:", msg.slice(0, 500))
  })
  proc.on("error", (e) => { error = "Leitor de mídia indisponível."; console.warn("Widgy pcmedia:", e.message); notify() })
  proc.on("exit", () => {
    if (worker !== proc) return
    worker = null
    // Preserve the last track during a worker restart; a new poll or the grace timer will expire it.
    error = "Conexão com a central de mídia interrompida."
    notify()
    if (subscribers.size) {
      retryTimer = setTimeout(start, 3500)
      setTimeout(() => {
        if (worker || !subscribers.size) return
        sessions = retainRecentSessions(sessions, [], lastSeen)
        notify()
      }, 9500)
    }
  })
}
function stop() {
  clearTimeout(retryTimer)
  retryTimer = null
  const proc = worker
  worker = null
  if (proc) try { proc.kill() } catch {}
  sessions = []
  coverCache.clear()
  lastSeen.clear()
  error = ""
}
function register(ipcMain, windowGetter) {
  getWin = windowGetter
  ipcMain.handle("media:sub", (_event, id, app) => {
    id = String(id || "").slice(0, 120)
    if (!id) return null
    subscribers.set(id, String(app || "").trim().toLowerCase().slice(0, 64))
    start()
    return current(id)
  })
  ipcMain.handle("media:unsub", (_event, id) => {
    subscribers.delete(String(id || ""))
    if (!subscribers.size) stop()
  })
  ipcMain.handle("media:cmd", (_event, cmd, id, arg) => {
    if (!worker || !subscribers.has(id) || !["toggle", "next", "prev", "seek"].includes(cmd)) return false
    const session = pickSession(sessions, subscribers.get(id))
    if (!session) return false
    if (cmd === "seek" && !session.canSeek) return false
    const seconds = Math.max(0, Math.min(Number(session.dur) || 86400, Number(arg) || 0))
    const code = Buffer.from(session.app, "utf8").toString("base64")
    try {
      worker.stdin.write(cmd + " " + code + (cmd === "seek" ? " " + seconds.toFixed(2) : "") + "\n")
      return true
    } catch { return false }
  })
}
module.exports = { register, PS }