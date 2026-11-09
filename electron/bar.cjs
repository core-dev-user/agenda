// Barra do Agenda como barra principal do Windows (só no modo "Área de trabalho").
// Uma janela fina sempre por cima, na borda de baixo da tela: esconde a barra do Windows,
// reserva o espaço dela (as janelas maximizadas param em cima da barra) e mostra os programas abertos.
const { app, BrowserWindow, screen, shell, globalShortcut, powerMonitor } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const { execFile } = require("node:child_process")
const winh = require("./winhelper.cjs")
const modes = require("./mode.cjs")
const { coalescedRunner } = require("./coalesced-runner.cjs")

const cfgFile = () => path.join(app.getPath("userData"), "bar.json")
let cfg = { on: false, height: 64, position: "bottom" }
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

const isDev = !!process.env.AGENDA_DEV
// a barra do Windows fica no monitor principal: só substitui quando o Agenda está nele
const available = () => modes.mode() === "desktop" && modes.isPrimary() && process.platform === "win32" && !process.env.AGENDA_SHOT
const active = () => cfg.on && available()

/** @type {BrowserWindow | null} */
let bar = null
let getMain = () => null
let menu = null // janela do menu aberto (Iniciar, programas…)
let lastSync = null
let lastFg = ""
let reconcile = null, createPromise = null, ready = false, lastError = "", generation = 0
let layoutRunner = null, windowRunner = null
let lastWindows = "", peekTimer = null
const APPBAR_CALLBACK = 0x8001
const status = () => ({ on: cfg.on, height: cfg.height, position: cfg.position, available: !!available(), active: ready, error: lastError })
function publish() { const m = getMain(); if (m && !m.isDestroyed()) m.webContents.send("bar:status", status()) }
function fail(error) { lastError = error.message || String(error); destroy(); publish() }
let barHidden = false

function rects() {
  const d = screen.getPrimaryDisplay()
  const b = d.bounds
  const H = Math.max(40, Math.min(120, Math.round(cfg.height)))
  const top = cfg.position === "top"
  const barRect = { x: b.x, y: top ? b.y : b.y + b.height - H, width: b.width, height: H }
  const work = { x: b.x, y: top ? b.y + H : b.y, width: b.width, height: b.height - H }
  return { d, H, top, barRect, work }
}

/** Reserva negociada com o Explorer via SHAppBarMessage, em pixels físicos. */
async function layout() {
  const target = bar
  if (!target || target.isDestroyed()) return
  const { d, H, top } = rects()
  const pixels = screen.dipToScreenRect(null, d.bounds)
  const strip = screen.dipToScreenRect(null, { ...d.bounds, height: H })
  const raw = await winh.call(`appbar ${winh.hwndOf(target)} ${top ? 1 : 3} ${pixels.x} ${pixels.y} ${pixels.width} ${pixels.height} ${strip.height}`)
  if (target !== bar || target.isDestroyed()) return
  if (!raw) throw new Error("Não foi possível reservar a barra no Windows. A barra original foi mantida.")
  const bounds = JSON.parse(raw)
  const barBounds = screen.screenToDipRect(null, bounds.bar)
  target.setBounds(barBounds)
  const m = getMain()
  if (m && !m.isDestroyed()) m.setBounds(screen.screenToDipRect(null, bounds.work))
}

/* ---------------- ícones dos programas ---------------- */
const icons = new Map()
async function iconOf(file) {
  if (!file) return ""
  const k = file.toLowerCase()
  if (icons.has(k)) return icons.get(k)
  let url = ""
  try { url = (await app.getFileIcon(file, { size: "large" })).toDataURL() } catch {}
  icons.set(k, url)
  return url
}
const nice = (exe) => path.basename(exe || "", ".exe").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

async function tick() {
  const target = bar
  if (!ready || !target || target.isDestroyed()) return
  const raw = await winh.call("list")
  if (target !== bar || target.isDestroyed()) return
  if (!raw) throw new Error("Não foi possível atualizar as janelas do Windows.")
  let j
  try { j = JSON.parse(raw) } catch { return }
  const own = process.execPath.toLowerCase()
  const wins = []
  for (const w of j.wins) {
    if ((w.exe || "").toLowerCase() === own) continue
    wins.push({ h: w.h, title: w.t, exe: w.exe, name: nice(w.exe), min: w.min, icon: await iconOf(w.exe) })
  }
  if (target !== bar || target.isDestroyed()) return
  if (wins.some((w) => w.h === j.fg)) lastFg = j.fg
  else if (j.fg !== "0" && !j.full) lastFg = ""
  // jogo ou vídeo em tela cheia: a barra some (como a do Windows)
  const hide = !!j.full && !menu
  if (hide !== barHidden) { barHidden = hide; hide ? bar.hide() : bar.showInactive() }
  const payload = { wins, fg: lastFg }
  const encoded = JSON.stringify(payload)
  if (encoded !== lastWindows) { lastWindows = encoded; target.webContents.send("bar:wins", payload) }
}

function create() {
  if (createPromise) return createPromise
  if (bar || !active()) return Promise.resolve()
  const epoch = ++generation
  winh.retry()
  lastError = ""
  createPromise = (async () => {
    const { barRect } = rects()
    const target = new BrowserWindow({
      ...barRect, frame: false, transparent: false, backgroundMaterial: "acrylic",
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false, roundedCorners: false,
      backgroundColor: "#00000000", title: "Agenda — barra",
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
    })
    bar = target
    target.setAlwaysOnTop(true, "pop-up-menu")
    target.once("closed", () => { if (bar === target) fail(new Error("A janela da barra foi fechada.")) })
    target.webContents.once("render-process-gone", () => { if (bar === target) fail(new Error("A interface da barra parou. A barra do Windows foi restaurada.")) })
    target.on("unresponsive", () => { if (bar === target) fail(new Error("A barra parou de responder.")) })
    // Register callbacks before ABM_NEW; Windows can immediately report a new work area.
    target.hookWindowMessage(APPBAR_CALLBACK, () => { layoutRunner?.request(); windowRunner?.request() })
    target.hookWindowMessage(0x0047, () => { if (ready) winh.call("position") }) // WM_WINDOWPOSCHANGED
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("A interface da barra não carregou a tempo.")), 20000)
      target.once("ready-to-show", () => { clearTimeout(timeout); resolve() })
      target.once("closed", () => { clearTimeout(timeout); reject(new Error("Barra encerrada durante a abertura.")) })
      const loading = isDev ? target.loadURL("http://localhost:5173/taskbar.html") : target.loadFile(path.join(__dirname, "..", "dist", "taskbar.html"))
      loading.catch((e) => { clearTimeout(timeout); reject(e) })
    })
    if (epoch !== generation || !active() || target !== bar) return
    await layout()
    if (epoch !== generation || !active() || target !== bar) return
    ready = true; barHidden = false; lastWindows = ""
    target.showInactive()
    cfg.hidTaskbar = true; save()
    layoutRunner = coalescedRunner(layout, fail)
    windowRunner = coalescedRunner(tick, fail)
    windowRunner.request()
    // Reconciliation covers missed OS events; ordinary updates come from WinEvent hooks.
    reconcile = setInterval(() => windowRunner?.request(), 30000)
    publish()
  })().catch((e) => { if (epoch === generation) fail(e) }).finally(() => { createPromise = null })
  return createPromise
}
function onDisplay() {
  if (!active()) { if (bar) destroy(); publish(); return }
  if (!bar) create(); else layoutRunner?.request()
}

let menuKind = ""
let menuClosedAt = 0
function closeMenu() {
  if (menu && !menu.isDestroyed()) menu.destroy()
  menu = null
  menuKind = ""
  menuClosedAt = Date.now()
  if (bar && !bar.isDestroyed()) bar.webContents.send("bar:menuState", "")
}
function openMenu(kind, anchorX, w, h) {
  // clicar de novo no mesmo botão fecha (o clique que tirou o foco já fechou: não reabre)
  if (menuKind === kind || (!menu && Date.now() - menuClosedAt < 250 && lastMenuKind === kind)) { closeMenu(); return }
  closeMenu()
  if (!bar) return
  const { barRect, top, d } = rects()
  const room = top ? d.bounds.y + d.bounds.height - (barRect.y + barRect.height) - 16 : barRect.y - d.bounds.y - 16
  const W = Math.max(280, Math.min(900, Math.round(w) || 560))
  const H = Math.max(200, Math.min(room, Math.round(h) || 600))
  const x = Math.max(barRect.x + 8, Math.min(barRect.x + barRect.width - W - 8, Math.round(barRect.x + anchorX - W / 2)))
  const y = top ? barRect.y + barRect.height + 8 : barRect.y - H - 8
  menu = new BrowserWindow({
    x, y, width: W, height: H,
    frame: false, transparent: false, backgroundMaterial: "acrylic", resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, roundedCorners: true, backgroundColor: "#00000000", title: "Agenda — menu",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  })
  menu.setAlwaysOnTop(true, "pop-up-menu")
  const q = { view: "menu", kind: String(kind) }
  if (isDev) menu.loadURL("http://localhost:5173/taskbar.html?" + new URLSearchParams(q))
  else menu.loadFile(path.join(__dirname, "..", "dist", "taskbar.html"), { query: q })
  menu.once("ready-to-show", () => { if (menu) { menu.show(); menu.focus() } })
  menu.on("blur", () => { lastMenuKind = menuKind; closeMenu() })
  menuKind = kind
  bar.webContents.send("bar:menuState", kind)
}
let lastMenuKind = ""
function destroy() {
  generation++
  ready = false
  clearInterval(reconcile); reconcile = null
  clearTimeout(peekTimer); peekTimer = null
  layoutRunner?.stop(); windowRunner?.stop(); layoutRunner = null; windowRunner = null
  closeMenu()
  const old = bar; bar = null
  if (old && !old.isDestroyed()) old.destroy()
  // The helper/independent watchdog also restores Explorer if this request cannot complete.
  winh.call("restore").then(() => {
    if (bar) return
    cfg.hidTaskbar = false; save()
    const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(modes.workArea())
  })
  publish()
}

/* ---------------- apps do Menu Iniciar ---------------- */
let appsCache = null
async function startApps() {
  if (appsCache) return appsCache
  const roots = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
  ]
  const out = new Map()
  const walk = async (dir, depth) => {
    let items = []
    try { items = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const it of items) {
      const p = path.join(dir, it.name)
      if (it.isDirectory() && depth < 3) await walk(p, depth + 1)
      else if (/\.(lnk|url)$/i.test(it.name)) {
        const name = it.name.replace(/\.(lnk|url)$/i, "")
        // tira desinstaladores, ajudas e sites
        if (/uninstall|desinstalar|readme|leia-me|help|ajuda|website|documenta/i.test(name)) continue
        if (!out.has(name.toLowerCase())) out.set(name.toLowerCase(), { name, path: p })
      }
    }
  }
  for (const r of roots) await walk(r, 0)
  appsCache = [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  setTimeout(() => { appsCache = null }, 5 * 60 * 1000)
  return appsCache
}

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  app.whenReady().then(() => {
    if (cfg.hidTaskbar) winh.call("recover")
    create()
    globalShortcut.register("Control+Alt+Home", () => { if (ready) openMenu("start", 90, 640, 660) })
    globalShortcut.register("Control+Alt+Backspace", () => { cfg.on = false; save(); destroy() })
    for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, onDisplay)
    powerMonitor.on("resume", () => { layoutRunner?.request(); windowRunner?.request() })
    powerMonitor.on("unlock-screen", () => { layoutRunner?.request(); windowRunner?.request() })
  })
  app.on("before-quit", () => { if (bar) destroy() })
  winh.on("windows", () => windowRunner?.request())
  winh.on("shell-restarted", () => { layoutRunner?.request(); windowRunner?.request() })
  winh.on("unavailable", (reason) => { if (bar) fail(new Error(reason)) })
  winh.on("bar-lost", () => { if (bar) fail(new Error("O Windows removeu a janela da barra.")) })
  winh.on("expired", () => { if (bar) fail(new Error("A comunicação com o Windows expirou.")) })
  winh.on("peek-ended", () => { if (bar && !bar.isDestroyed()) bar.webContents.send("bar:peekState", false) })

  ipcMain.handle("bar:get", () => status())
  ipcMain.handle("bar:set", async (_e, p) => {
    const q = p || {}
    if (typeof q.on === "boolean") cfg.on = q.on
    if (Number.isFinite(q.height)) cfg.height = Math.max(40, Math.min(120, Math.round(q.height)))
    if (q.position === "top" || q.position === "bottom") cfg.position = q.position
    save()
    if (active()) { if (!bar) await create(); else layoutRunner?.request() }
    else if (bar) destroy()
    publish()
    return status()
  })
  // a janela principal manda tema, fixados e avisos; a barra recebe
  ipcMain.on("bar:sync", (_e, data) => { lastSync = data; if (bar && !bar.isDestroyed()) bar.webContents.send("bar:sync", data) })
  ipcMain.handle("bar:hello", () => lastSync)
  // pedidos da barra para a janela principal (abrir aba, busca, fixar…)
  ipcMain.on("bar:main", (_e, msg) => { const m = getMain(); if (m && !m.isDestroyed()) m.webContents.send("bar:main", msg) })
  // menus (Iniciar, avisos…): janelinha acrílica em cima da barra, fecha ao clicar fora
  ipcMain.handle("bar:menu", (_e, kind, anchorX, w, h) => openMenu(kind, anchorX, w, h))
  ipcMain.handle("bar:closeMenu", () => closeMenu())
  ipcMain.handle("bar:click", (_e, h, wasMin) => {
    if (h === lastFg && !wasMin) return winh.call("minimize " + h)
    lastFg = h
    return winh.call("activate " + h)
  })
  ipcMain.handle("bar:win", (_e, cmd, h) => { if (["activate", "minimize", "close"].includes(cmd) && /^\d+$/.test(String(h))) return winh.call(cmd + " " + h) })
  ipcMain.handle("bar:desktop", () => winh.call("desktop"))
  ipcMain.handle("bar:peek", async (_e, on) => {
    if (!ready) return ""
    clearTimeout(peekTimer)
    const result = await winh.call("peek " + (on ? 1 : 0))
    // Bring Explorer above the Agenda bar while accessing the original notification area.
    if (bar && !bar.isDestroyed()) { bar.setAlwaysOnTop(!on, "pop-up-menu"); if (!on) bar.showInactive() }
    if (on) peekTimer = setTimeout(() => {
      winh.call("peek 0")
      if (bar && !bar.isDestroyed()) { bar.setAlwaysOnTop(true, "pop-up-menu"); bar.webContents.send("bar:peekState", false) }
    }, 12000)
    return result
  })
  ipcMain.handle("bar:apps", () => startApps())
  ipcMain.handle("bar:icon", (_e, file) => iconOf(String(file || "")))
  ipcMain.handle("bar:launch", (_e, file) => { if (typeof file === "string" && file) return shell.openPath(file) })
  ipcMain.handle("bar:power", (_e, kind) => {
    const run = (cmd, args) => execFile(cmd, args, { windowsHide: true }, () => {})
    if (kind === "lock") run("rundll32.exe", ["user32.dll,LockWorkStation"])
    else if (kind === "sleep") run("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"])
    else if (kind === "restart") run("shutdown.exe", ["/r", "/t", "0"])
    else if (kind === "shutdown") run("shutdown.exe", ["/s", "/t", "0"])
    else if (kind === "settings") shell.openExternal("ms-settings:")
    else if (kind === "volume") shell.openExternal("ms-settings:sound")
    else if (kind === "network") shell.openExternal("ms-settings:network")
  })
}

module.exports = { register, isActive: () => ready }
