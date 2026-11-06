// Barra do Agenda como barra principal do Windows (só no modo "Área de trabalho").
// Uma janela fina sempre por cima, na borda de baixo da tela: esconde a barra do Windows,
// reserva o espaço dela (as janelas maximizadas param em cima da barra) e mostra os programas abertos.
const { app, BrowserWindow, screen, shell } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const { execFile } = require("node:child_process")
const winh = require("./winhelper.cjs")
const modes = require("./mode.cjs")

const cfgFile = () => path.join(app.getPath("userData"), "bar.json")
let cfg = { on: false, height: 64, position: "bottom" }
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

const isDev = !!process.env.AGENDA_DEV
const active = () => cfg.on && modes.mode() === "desktop" && process.platform === "win32" && !process.env.AGENDA_SHOT

/** @type {BrowserWindow | null} */
let bar = null
let getMain = () => null
let menu = null // janela do menu aberto (Iniciar, programas…)
let lastSync = null
let lastFg = ""
let poll = null
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

/** reserva a área da barra (em pixels reais) e reposiciona */
function layout() {
  if (!bar || bar.isDestroyed()) return
  const { barRect, work } = rects()
  bar.setBounds(barRect)
  const p = screen.dipToScreenRect(null, work)
  winh.call(`work ${p.x} ${p.y} ${p.x + p.width} ${p.y + p.height}`)
  // a área de trabalho do Agenda acompanha a área livre nova
  setTimeout(() => { const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(work) }, 150)
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
  if (!bar || bar.isDestroyed()) return
  const raw = await winh.call("list")
  if (!raw) return
  let j
  try { j = JSON.parse(raw) } catch { return }
  const own = process.execPath.toLowerCase()
  const wins = []
  for (const w of j.wins) {
    if ((w.exe || "").toLowerCase() === own) continue
    wins.push({ h: w.h, title: w.t, exe: w.exe, name: nice(w.exe), min: w.min, icon: await iconOf(w.exe) })
  }
  if (wins.some((w) => w.h === j.fg)) lastFg = j.fg
  else if (j.fg !== "0" && !j.full) lastFg = ""
  // jogo ou vídeo em tela cheia: a barra some (como a do Windows)
  const hide = !!j.full && !menu
  if (hide !== barHidden) { barHidden = hide; hide ? bar.hide() : bar.showInactive() }
  if (!bar.isDestroyed()) bar.webContents.send("bar:wins", { wins, fg: lastFg })
}

function create() {
  if (bar || !active()) return
  const { barRect } = rects()
  bar = new BrowserWindow({
    ...barRect,
    frame: false, transparent: false, backgroundMaterial: "acrylic", resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false, roundedCorners: false,
    backgroundColor: "#00000000", title: "Agenda — barra",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  })
  bar.setAlwaysOnTop(true, "pop-up-menu")
  if (isDev) bar.loadURL("http://localhost:5173/taskbar.html")
  else bar.loadFile(path.join(__dirname, "..", "dist", "taskbar.html"))
  bar.once("ready-to-show", () => bar && bar.showInactive())
  bar.on("closed", () => { bar = null })
  winh.call("hidetb")
  cfg.hidTaskbar = true; save()
  layout()
  poll = setInterval(tick, 1000)
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, onDisplay)
}
function onDisplay() { if (bar) layout() }

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
  if (poll) { clearInterval(poll); poll = null }
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.removeListener(ev, onDisplay)
  if (bar && !bar.isDestroyed()) bar.destroy()
  bar = null
  winh.call("restore")
  cfg.hidTaskbar = false; save()
  setTimeout(() => { const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(screen.getPrimaryDisplay().workArea) }, 300)
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
    // a barra do Windows ficou escondida numa vez anterior (ajudante fechado à força): devolve
    if (cfg.hidTaskbar && !active()) { winh.call("restore"); cfg.hidTaskbar = false; save() }
    setTimeout(create, 1200)
  })
  app.on("before-quit", () => { if (bar) destroy() })

  ipcMain.handle("bar:get", () => ({ on: cfg.on, height: cfg.height, position: cfg.position, available: modes.mode() === "desktop", active: !!bar }))
  ipcMain.handle("bar:set", (_e, p) => {
    const q = p || {}
    if (typeof q.on === "boolean") cfg.on = q.on
    if (typeof q.height === "number") cfg.height = q.height
    if (q.position === "top" || q.position === "bottom") cfg.position = q.position
    save()
    if (active()) { if (!bar) create(); else layout() }
    else if (bar) destroy()
    return { on: cfg.on, height: cfg.height, position: cfg.position, available: modes.mode() === "desktop", active: !!bar }
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
  ipcMain.handle("bar:peek", (_e, on) => winh.call("peek " + (on ? 1 : 0)))
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

module.exports = { register, isActive: () => !!bar }
