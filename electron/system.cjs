// Integração com o Windows: bandeja (perto do relógio), atalho global, iniciar com o Windows e backup na nuvem.
const { app, Tray, Menu, globalShortcut, nativeImage, dialog } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")

const cfgFile = () => path.join(app.getPath("userData"), "system.json")
const DEFAULTS = { closeToTray: true, hotkey: "Control+Alt+Space", cloudDir: "", cloudOn: false, lastCloud: 0, cloudError: "" }
let cfg = { ...DEFAULTS }
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
const saveCfg = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

let getMain = () => null
let tray = null
let quitting = false
const startHidden = process.argv.includes("--hidden")

const uiMode = () => require("./mode.cjs").mode()
function show() {
  const w = getMain()
  if (!w || w.isDestroyed()) return
  const m = uiMode()
  if (!w.isVisible()) { w.show(); if ((m === "screen" || !m) && !w.isMaximized()) w.maximize() }
  if (w.isMinimized()) w.restore()
  // modo área de trabalho: o atalho/bandeja abre a busca rápida por cima de tudo
  if (m === "desktop") { w.webContents.send("app:summon"); return }
  w.focus()
}
function toggle() {
  const w = getMain()
  if (!w || w.isDestroyed()) return
  if (uiMode() === "desktop") return show()
  if (w.isVisible() && w.isFocused() && !w.isMinimized()) { cfg.closeToTray ? w.hide() : w.minimize() }
  else show()
}
function quit() { quitting = true; app.quit() }

function makeTray() {
  if (tray) return
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png")).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip("Agenda")
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir o Agenda", click: show },
    { type: "separator" },
    { label: "Sair do Agenda", click: () => { quitting = true; app.quit() } },
  ]))
  tray.on("click", show)
}

let registered = ""
function applyHotkey() {
  if (registered) { try { globalShortcut.unregister(registered) } catch {} registered = "" }
  if (!cfg.hotkey) return true
  try {
    const ok = globalShortcut.register(cfg.hotkey, toggle)
    if (ok) registered = cfg.hotkey
    return ok
  } catch { return false }
}

/** Lugares prováveis de pastas sincronizadas com a nuvem */
function cloudGuesses() {
  const home = os.homedir()
  const out = []
  const add = (p, label) => { try { if (p && fs.existsSync(p)) out.push({ path: p, label }) } catch {} }
  add(process.env.OneDrive, "OneDrive")
  add(process.env.OneDriveConsumer, "OneDrive")
  add(path.join(home, "OneDrive"), "OneDrive")
  for (const d of "DEFGHIJ") { add(`${d}:\\Meu Drive`, "Google Drive"); add(`${d}:\\My Drive`, "Google Drive") }
  add(path.join(home, "Google Drive"), "Google Drive")
  add(path.join(home, "Dropbox"), "Dropbox")
  const seen = new Set()
  return out.filter((x) => (seen.has(x.path.toLowerCase()) ? false : (seen.add(x.path.toLowerCase()), true)))
}

/** Copia um arquivo de dados para a pasta da nuvem (chamado junto com as cópias de segurança locais). */
async function cloudCopy(src, name) {
  if (!cfg.cloudOn || !cfg.cloudDir) return
  try {
    const dir = path.join(cfg.cloudDir, "Agenda backup")
    await fsp.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10)
    // uma cópia "atual" + uma por dia (guarda os últimos 30 dias)
    await fsp.copyFile(src, path.join(dir, name))
    const ext = path.extname(name)
    await fsp.copyFile(src, path.join(dir, `${path.basename(name, ext)}-${stamp}${ext}`))
    const olds = (await fsp.readdir(dir)).filter((f) => f.startsWith(path.basename(name, ext) + "-")).sort().reverse().slice(30)
    for (const f of olds) fsp.unlink(path.join(dir, f)).catch(() => {})
    cfg.lastCloud = Date.now(); cfg.cloudError = ""; saveCfg()
  } catch (e) { cfg.cloudError = String((e && e.message) || e); saveCfg() }
}

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  if (!process.env.AGENDA_SHOT) app.whenReady().then(() => { makeTray(); applyHotkey() })
  app.on("will-quit", () => globalShortcut.unregisterAll())
  app.on("before-quit", () => { quitting = true })

  ipcMain.handle("sys:get", () => ({ ...cfg, guesses: cloudGuesses(), hotkeyOk: !cfg.hotkey || registered === cfg.hotkey }))
  ipcMain.handle("sys:set", (_e, patch) => {
    const p = patch || {}
    for (const k of ["closeToTray", "hotkey", "cloudDir", "cloudOn"]) if (k in p) cfg[k] = p[k]
    saveCfg()
    const hotkeyOk = "hotkey" in p ? applyHotkey() : !cfg.hotkey || registered === cfg.hotkey
    return { ...cfg, guesses: cloudGuesses(), hotkeyOk }
  })
  ipcMain.handle("sys:pickCloud", async () => {
    const r = await dialog.showOpenDialog(getMain(), { title: "Pasta da nuvem para o backup", properties: ["openDirectory", "createDirectory"] })
    return r.canceled ? "" : r.filePaths[0]
  })
  ipcMain.handle("sys:cloudNow", async () => {
    const dir = app.getPath("userData")
    await cloudCopy(path.join(dir, "agenda-data.json"), "agenda-data.json")
    if (fs.existsSync(path.join(dir, "finance.dat"))) await cloudCopy(path.join(dir, "finance.dat"), "finance.dat")
    return { ...cfg }
  })
  ipcMain.handle("app:show", () => show())
  ipcMain.handle("app:quit", () => { quitting = true; app.quit() })
  // iniciar com o Windows: o atalho roda o electron.exe com a pasta do app — precisa passar a pasta junto
  ipcMain.handle("app:autostart", (_e, on) => {
    const args = app.isPackaged ? ["--hidden"] : [app.getAppPath(), "--hidden"]
    if (typeof on === "boolean") app.setLoginItemSettings({ openAtLogin: on, args })
    return app.getLoginItemSettings({ args }).openAtLogin
  })
}

/** Fechar a janela: vai para a bandeja (o YouTube Music e as calls continuam) */
function attachWindow(win) {
  win.on("close", (e) => {
    // a área de trabalho não "fecha" (Alt+F4 nela não derruba o Agenda)
    if (!quitting && uiMode() === "desktop") { e.preventDefault(); return }
    if (!quitting && cfg.closeToTray && tray) { e.preventDefault(); win.hide() }
  })
}

module.exports = { register, attachWindow, cloudCopy, startHidden, show, quit, isQuitting: () => quitting }
