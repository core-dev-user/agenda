// Integração não invasiva com Wallpaper Engine (Steam app 431960).
// Não extrai cenas do Workshop nem duplica o renderizador: o Widgy usa
// transparência nativa e deixa o Wallpaper Engine desenhar no desktop atrás.
const { app, shell } = require("electron")
const { execFile } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const STEAM_ID = 431960
const isEngine = (settings) =>
  settings?.wallpaper?.type === "engine" ||
  Object.values(settings?.wallpaperBy || {}).some((wall) => wall?.type === "engine")

function requiresTransparency(userDir) {
  if (process.platform !== "win32") return false
  for (const suffix of ["", ".exit.tmp", ".tmp"]) {
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(userDir, "agenda-data.json" + suffix), "utf8"))
      if (saved && saved.state && saved.state.settings) return isEngine(saved.state.settings)
    } catch {}
  }
  return false
}

function steamRoots() {
  const roots = new Set([
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam"),
  ])
  // Suporta instalações do Steam em outra unidade (libraryfolders.vdf).
  for (const root of [...roots]) {
    try {
      const txt = fs.readFileSync(path.join(root, "steamapps", "libraryfolders.vdf"), "utf8")
      for (const match of txt.matchAll(/"path"\s+"([^"]+)"/g)) {
        roots.add(match[1].replace(/\\\\/g, "\\"))
      }
    } catch {}
  }
  return [...roots]
}

function findExecutable() {
  if (process.platform !== "win32") return null
  for (const root of steamRoots()) {
    for (const exe of ["wallpaper64.exe", "wallpaper32.exe"]) {
      const full = path.join(root, "steamapps", "common", "wallpaper_engine", exe)
      if (fs.existsSync(full)) return full
    }
  }
  return null
}
function run(file, args, timeout = 2500) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 256 * 1024 }, (err, stdout) => {
      resolve(err ? "" : String(stdout || "").trim())
    })
  })
}

async function status() {
  if (process.platform !== "win32") return { supported: false, installed: false, running: false, wallpaper: "" }
  const executable = findExecutable()
  const processes = await run("tasklist.exe", ["/FO", "CSV", "/NH"])
  const running = /^"(?:wallpaper32|wallpaper64)\.exe"/im.test(processes)
  let wallpaper = ""
  if (running && executable) {
    const result = await run(executable, ["-control", "getWallpaper"], 2500)
    if (result && !result.includes("\n")) {
      // Somente nome do projeto, nunca a localização completa de arquivos do usuário.
      const folder = path.basename(path.dirname(result))
      const file = path.basename(result)
      wallpaper = file.toLowerCase() === "project.json" ? folder : file
    }
  }
  return { supported: true, installed: !!executable || running, running, wallpaper }
}

function register(ipcMain, onQuit, userDir) {
  ipcMain.handle("wallpaperEngine:status", status)
  ipcMain.handle("wallpaperEngine:open", async () => {
    if (process.platform !== "win32") return false
    try { await shell.openExternal("steam://rungameid/" + STEAM_ID); return true }
    catch { return false }
  })
  ipcMain.handle("wallpaperEngine:resume", async () => {
    // Nunca reiniciar wallpapers automaticamente: Wallpaper Engine pode tê-los
    // pausado de propósito durante um jogo ou em bateria.
    if (process.platform !== "win32" || process.env.AGENDA_SHOT || !userDir) return false
    if (require("./mode.cjs").mode() !== "desktop" || !requiresTransparency(userDir)) return false
    const exe = findExecutable()
    if (!exe || !(await status()).running) return false
    // Comando oficial "-control play"; não abrir uma segunda instância gráfica.
    return new Promise((resolve) => {
      execFile(exe, ["-control", "play"], { windowsHide: true, timeout: 3500, maxBuffer: 256 * 1024 },
        (err) => resolve(!err))
    })
  })
  ipcMain.handle("wallpaperEngine:restart", () => {
    // A transparência do Electron só pode ser definida ao criar a janela.
    if (process.platform !== "win32") return false
    if (process.env.AGENDA_SHOT) return false
    app.relaunch()
    onQuit()
    return true
  })
}

module.exports = { isEngine, requiresTransparency, steamRoots, findExecutable, status, register }
