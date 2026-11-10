// Barra do Agenda no lugar da barra do Windows (só no modo "Área de trabalho"), em TODOS os monitores.
// Em cada monitor: uma janela fina sempre por cima na borda de baixo, que esconde a barra do Windows,
// reserva o espaço dela (as janelas maximizadas param em cima da barra) e mostra os programas abertos.
// Nos monitores onde o Agenda principal não está, um fundo do Agenda (papel de parede + relógio) cobre
// a área de trabalho do Windows. A tecla Windows e Win+S abrem o Iniciar/pesquisa do Agenda (keys.cjs).
const { app, BrowserWindow, screen, shell } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const { execFile } = require("node:child_process")
const winh = require("./winhelper.cjs")
const modes = require("./mode.cjs")
const keys = require("./keys.cjs")
const games = require("./games.cjs")

const cfgFile = () => path.join(app.getPath("userData"), "bar.json")
let cfg = { on: false, height: 64, position: "bottom", keys: true }
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

const isDev = !!process.env.AGENDA_DEV
const active = () => cfg.on && modes.mode() === "desktop" && process.platform === "win32" && !process.env.AGENDA_SHOT

/** barras (uma por monitor) e fundos dos outros monitores, pela id do monitor */
const bars = new Map()
const desks = new Map()
let getMain = () => null
let menu = null // janela do menu aberto (Iniciar, relógio…)
let lastSync = null
let lastFg = ""
let poll = null
const hiddenOn = new Set() // monitores com jogo/vídeo em tela cheia: a barra some

function rects(d) {
  const b = d.bounds
  const H = Math.max(40, Math.min(120, Math.round(cfg.height)))
  const top = cfg.position === "top"
  const barRect = { x: b.x, y: top ? b.y : b.y + b.height - H, width: b.width, height: H }
  const work = { x: b.x, y: top ? b.y + H : b.y, width: b.width, height: b.height - H }
  return { H, top, barRect, work }
}
const primaryBar = () => bars.get(screen.getPrimaryDisplay().id) || [...bars.values()][0] || null
/** monitor de uma barra ou de um fundo */
const displayOfWin = (w) => {
  for (const map of [bars, desks]) for (const [id, x] of map) if (x === w) return screen.getAllDisplays().find((d) => d.id === id) || null
  return null
}

/** reserva a área da barra em cada monitor (em pixels reais) e reposiciona tudo */
function layout() {
  for (const d of screen.getAllDisplays()) {
    const { barRect, work, top } = rects(d)
    const b = bars.get(d.id)
    if (b && !b.isDestroyed()) {
      b.setBounds(barRect)
      // registra a barra como AppBar: o Windows tira o espaço dela da área livre daquele monitor
      // (só quando muda: cada registro faz o Windows avisar que a tela mudou, o que chama layout de novo)
      const p = screen.dipToScreenRect(null, barRect)
      const cmd = `appbar ${winh.hwndOf(b)} ${p.x} ${p.y} ${p.x + p.width} ${p.y + p.height} ${top ? 1 : 3}`
      if (b.__appbar !== cmd) { b.__appbar = cmd; winh.call(cmd) }
    }
    const k = desks.get(d.id)
    if (k && !k.isDestroyed()) k.setBounds(work)
  }
  // a área de trabalho do Agenda acompanha a área livre nova
  setTimeout(() => { const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(rects(modes.target()).work) }, 150)
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
  if (!bars.size) return
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
  // jogo ou vídeo em tela cheia: a barra daquele monitor some (como a do Windows)
  const fullId = j.full && !menu ? screen.getDisplayNearestPoint(screen.screenToDipPoint({ x: j.fl + 1, y: j.ft + 1 })).id : null
  for (const [id, b] of bars) {
    if (b.isDestroyed()) continue
    // o Windows às vezes empurra a barra para dentro da área livre: devolve para a borda
    const d = screen.getAllDisplays().find((x) => x.id === id)
    if (d) { const want = rects(d).barRect, cur = b.getBounds(); if (cur.x !== want.x || cur.y !== want.y || cur.width !== want.width || cur.height !== want.height) b.setBounds(want) }
    const hide = id === fullId
    if (hide !== hiddenOn.has(id)) { if (hide) { hiddenOn.add(id); b.hide() } else { hiddenOn.delete(id); b.showInactive() } }
    b.webContents.send("bar:wins", { wins, fg: lastFg })
  }
}

const page = (win, q) => {
  if (isDev) win.loadURL("http://localhost:5173/taskbar.html?" + new URLSearchParams(q))
  else win.loadFile(path.join(__dirname, "..", "dist", "taskbar.html"), { query: q })
}
const prefs = () => ({ preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false })

function makeBar(d) {
  const { barRect } = rects(d)
  const b = new BrowserWindow({
    ...barRect,
    frame: false, transparent: false, backgroundMaterial: "acrylic", resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false, roundedCorners: false,
    backgroundColor: "#00000000", title: "Agenda — barra", webPreferences: prefs(),
  })
  b.setAlwaysOnTop(true, "pop-up-menu")
  page(b, { view: "bar" })
  b.once("ready-to-show", () => { if (!b.isDestroyed() && !hiddenOn.has(d.id)) b.showInactive() })
  b.on("closed", () => { if (bars.get(d.id) === b) bars.delete(d.id) })
  bars.set(d.id, b)
}

/** fundo do Agenda nos monitores sem o Agenda principal: fica atrás de tudo, como a área de trabalho */
function makeDesk(d) {
  const { work } = rects(d)
  const k = new BrowserWindow({
    ...work,
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, show: false, roundedCorners: false, backgroundColor: "#000000",
    title: "Agenda — fundo", webPreferences: prefs(),
  })
  page(k, { view: "desk" })
  const h = winh.hwndOf(k)
  const sink = () => { if (!k.isDestroyed()) winh.call("bottom " + h) }
  k.once("ready-to-show", () => { winh.call("own " + h); k.showInactive(); sink() })
  k.on("focus", () => setTimeout(sink, 0))
  k.on("closed", () => { if (desks.get(d.id) === k) desks.delete(d.id) })
  desks.set(d.id, k)
}

function create() {
  if (bars.size || !active()) return
  const main = modes.target().id
  for (const d of screen.getAllDisplays()) {
    makeBar(d)
    if (d.id !== main) makeDesk(d)
  }
  winh.call("hidetb").then((st) => { if (/^\d+$/.test(st) && cfg.abState == null) { cfg.abState = Number(st); save() } })
  cfg.hidTaskbar = true; save()
  layout()
  // a barra do Windows leva um instante para se esconder: registra de novo depois, já sem ela ocupando espaço
  setTimeout(() => { for (const b of bars.values()) b.__appbar = ""; layout() }, 2500)
  poll = setInterval(tick, 1000)
  for (const ev of ["display-added", "display-removed"]) screen.on(ev, rebuild)
  screen.on("display-metrics-changed", onMetrics)
  syncKeys()
}
let rebuildT = null
function rebuild() {
  clearTimeout(rebuildT)
  rebuildT = setTimeout(() => { teardown(false); create() }, 800)
}
function onMetrics() { if (bars.size) layout() }

/* ---------------- menus em cima da barra ---------------- */
let menuKind = ""
let menuClosedAt = 0
let lastMenuKind = ""
function closeMenu() {
  if (menu && !menu.isDestroyed()) menu.destroy()
  menu = null
  menuKind = ""
  menuClosedAt = Date.now()
  for (const b of bars.values()) if (!b.isDestroyed()) b.webContents.send("bar:menuState", "")
}
/** kind: "start" | "clock"; fromKey: aberto pelo teclado (Win+S nunca fecha um menu já aberto) */
function openMenu(kind, anchorX, w, h, barWin, fromKey) {
  const again = menuKind === kind || (!menu && Date.now() - menuClosedAt < 250 && lastMenuKind === kind)
  if (again && fromKey !== "search") { closeMenu(); return }
  if (again && menu) { menu.focus(); return }
  closeMenu()
  const d = (barWin && !barWin.isDestroyed() && displayOfWin(barWin)) || screen.getPrimaryDisplay()
  const b = bars.get(d.id) || primaryBar()
  const { barRect, top } = rects(d)
  const room = top ? d.bounds.y + d.bounds.height - (barRect.y + barRect.height) - 16 : barRect.y - d.bounds.y - 16
  const W = Math.max(280, Math.min(900, Math.round(w) || 560))
  const H = Math.max(200, Math.min(room, Math.round(h) || 600))
  const ax = anchorX == null ? barRect.width / 2 : anchorX
  const x = Math.max(barRect.x + 8, Math.min(barRect.x + barRect.width - W - 8, Math.round(barRect.x + ax - W / 2)))
  const y = top ? barRect.y + barRect.height + 8 : barRect.y - H - 8
  const m = new BrowserWindow({
    x, y, width: W, height: H,
    frame: false, transparent: false, backgroundMaterial: "acrylic", resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, roundedCorners: true, backgroundColor: "#00000000", title: "Agenda — menu", webPreferences: prefs(),
  })
  m.setAlwaysOnTop(true, "pop-up-menu")
  page(m, { view: "menu", kind: String(kind) })
  m.once("ready-to-show", () => {
    if (m.isDestroyed()) return
    m.show(); m.focus()
    // aberto pela tecla Windows: o Windows não deixa outro programa tomar o foco sozinho — o ajudante força
    winh.call("activate " + winh.hwndOf(m))
  })
  m.on("blur", () => { if (menu === m) { lastMenuKind = menuKind; closeMenu() } })
  menu = m
  menuKind = kind
  for (const bw of bars.values()) if (!bw.isDestroyed()) bw.webContents.send("bar:menuState", bw === b ? kind : "")
}

/* ---------------- tecla Windows ---------------- */
function syncKeys() { keys.enable(!!bars.size && cfg.keys !== false && games.playing() === false) }
keys.onKey((ev) => {
  if (!bars.size) return
  openMenu("start", null, 640, 660, primaryBar(), ev)
})
games.onPlaying(() => syncKeys())

function teardown(restore = true) {
  if (poll) { clearInterval(poll); poll = null }
  for (const ev of ["display-added", "display-removed"]) screen.removeListener(ev, rebuild)
  screen.removeListener("display-metrics-changed", onMetrics)
  closeMenu()
  for (const b of bars.values()) if (!b.isDestroyed()) { winh.call("unappbar " + winh.hwndOf(b)); b.destroy() }
  for (const k of desks.values()) if (!k.isDestroyed()) k.destroy()
  bars.clear(); desks.clear(); hiddenOn.clear()
  keys.enable(false)
  if (!restore) return
  winh.call("restore " + (cfg.abState ?? -1))
  cfg.hidTaskbar = false; delete cfg.abState; save()
  setTimeout(() => { const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(modes.workArea()) }, 300)
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

const state = () => ({ on: cfg.on, height: cfg.height, position: cfg.position, keys: cfg.keys !== false, available: modes.mode() === "desktop", active: bars.size > 0 })

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  app.whenReady().then(() => {
    // a barra do Windows ficou escondida numa vez anterior (ajudante fechado à força): devolve
    if (cfg.hidTaskbar && !active()) { winh.call("restore " + (cfg.abState ?? 0)); cfg.hidTaskbar = false; delete cfg.abState; save() }
    setTimeout(create, 1200)
  })
  app.on("before-quit", () => { if (bars.size) teardown() })

  ipcMain.handle("bar:get", () => state())
  ipcMain.handle("bar:set", (_e, p) => {
    const q = p || {}
    if (typeof q.on === "boolean") cfg.on = q.on
    if (typeof q.keys === "boolean") cfg.keys = q.keys
    if (typeof q.height === "number") cfg.height = q.height
    if (q.position === "top" || q.position === "bottom") cfg.position = q.position
    save()
    if (active()) { if (!bars.size) create(); else { layout(); syncKeys() } }
    else if (bars.size) teardown()
    return state()
  })
  // a janela principal manda tema, fixados, papel de parede e avisos; barras e fundos recebem
  ipcMain.on("bar:sync", (_e, data) => {
    lastSync = data
    for (const w of [...bars.values(), ...desks.values()]) if (!w.isDestroyed()) w.webContents.send("bar:sync", data)
    if (menu && !menu.isDestroyed()) menu.webContents.send("bar:sync", data)
  })
  ipcMain.handle("bar:hello", () => lastSync)
  // pedidos da barra para a janela principal (abrir aba, busca, fixar…)
  ipcMain.on("bar:main", (_e, msg) => { const m = getMain(); if (m && !m.isDestroyed()) m.webContents.send("bar:main", msg) })
  // menus (Iniciar, relógio…): janelinha acrílica em cima da barra que pediu, fecha ao clicar fora
  ipcMain.handle("bar:menu", (e, kind, anchorX, w, h) => openMenu(kind, anchorX, w, h, BrowserWindow.fromWebContents(e.sender)))
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
  ipcMain.handle("bar:web", (_e, q) => { if (typeof q === "string" && q.trim()) shell.openExternal("https://www.google.com/search?q=" + encodeURIComponent(q.trim())) })
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

module.exports = { register, isActive: () => bars.size > 0 }
