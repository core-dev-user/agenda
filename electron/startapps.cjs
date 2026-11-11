// A complete Windows Start catalog requires both classic .lnk shortcuts and
// registered AppsFolder (UWP/MSIX) entries. Portable apps are included when they
// have a shortcut on the desktop or a registered App Paths executable.
const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { execFile } = require("node:child_process")

const OMIT = /^(?:uninstall|desinstalar|unins\d*|readme|leia.me|help|ajuda|website|documentation|documenta[cç][aã]o)(?:\s|$)/i
const normalize = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()

function shortcutRoots(env = process.env) {
  const appdata = env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  const programdata = env.ProgramData || "C:\\ProgramData"
  const user = env.USERPROFILE || os.homedir()
  return [
    path.join(programdata, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(env.PUBLIC || "C:\\Users\\Public", "Desktop"),
    path.join(user, "Desktop"),
  ]
}
function add(map, name, target) {
  if (typeof name !== "string" || typeof target !== "string") return
  name = name.trim()
  target = target.trim()
  if (!name || !target || OMIT.test(name) || name.length > 180 || target.length > 2048) return
  const key = normalize(name)
  // Prefer normal Start Menu shortcuts over AppsFolder and registry duplicates.
  if (!map.has(key)) map.set(key, { name, path: target })
}
async function scanShortcuts(map, roots, fsApi = fs) {
  const seen = new Set()
  async function walk(dir, depth) {
    if (depth > 8 || seen.has(dir) || seen.size > 3000) return
    seen.add(dir)
    let entries
    try { entries = await fsApi.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && depth < 8) await walk(full, depth + 1)
      else if (entry.isFile() && /\.(lnk|url)$/i.test(entry.name)) {
        add(map, entry.name.replace(/\.(lnk|url)$/i, ""), full)
      }
    }
  }
  for (const dir of roots) await walk(dir, 0)
}

const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$items = New-Object 'System.Collections.Generic.List[object]'
Get-StartApps | ForEach-Object {
  if ($_.Name -and $_.AppID) {
    $items.Add([pscustomobject]@{ Name=[string]$_.Name; Target='shell:AppsFolder\' + [string]$_.AppID })
  }
}
foreach ($root in @(
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths'
)) {
  Get-ChildItem -Path $root | ForEach-Object {
    try {
      $exe = [Environment]::ExpandEnvironmentVariables([string]$_.GetValue(''))
      if ($exe -and (Test-Path -LiteralPath $exe -PathType Leaf) -and $exe.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) {
        $items.Add([pscustomobject]@{ Name=[IO.Path]::GetFileNameWithoutExtension($_.PSChildName); Target=$exe })
      }
    } catch {}
  }
}
ConvertTo-Json -InputObject @($items.ToArray()) -Compress -Depth 3
`;
function queryWindowsApps() {
  return new Promise((resolve) => {
    // Encode command in UTF-16LE to avoid regional shell quoting problems.
    const encoded = Buffer.from(PS, "utf16le").toString("base64")
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { windowsHide: true, timeout: 13000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
        if (error) return resolve([])
        try {
          const raw = JSON.parse(String(stdout).trim())
          resolve(Array.isArray(raw) ? raw : raw ? [raw] : [])
        } catch { resolve([]) }
      })
  })
}
function isAppsFolderTarget(target) {
  return typeof target === "string" &&
    /^shell:AppsFolder\\[^\\\r\n"'<>|]+$/i.test(target) &&
    !target.includes("..")
}
async function collectStartApps({ roots = shortcutRoots(), fsApi = fs, query = queryWindowsApps } = {}) {
  const map = new Map()
  await scanShortcuts(map, roots, fsApi)
  // Discover Store/MSIX apps and registered executables only on Windows.
  let windowsApps = []
  try { windowsApps = await query() } catch {}
  for (const a of Array.isArray(windowsApps) ? windowsApps : []) {
    const target = a && (a.Target || a.target)
    if (isAppsFolderTarget(target) || (typeof target === "string" && path.win32.isAbsolute(target) && /\.exe$/i.test(target))) {
      add(map, a.Name || a.name, target)
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}
module.exports = { collectStartApps, shortcutRoots, isAppsFolderTarget, scanShortcuts, queryWindowsApps }
