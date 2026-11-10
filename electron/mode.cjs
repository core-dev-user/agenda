// Modos de uso do Agenda:
//  - "app":     janela normal com as abas (sem papel de parede nem widgets)
//  - "desktop": o Agenda vira a área de trabalho do Windows — fica ATRÁS das outras janelas,
//               não some com Win+D, e a barra de tarefas do Windows continua
//  - "screen":  tela própria em tela cheia (como era antes; bom para um segundo monitor)
//  - "":        primeiro uso — o app abre a tela de boas-vindas para a pessoa escolher
const { app, screen } = require("electron")
const path = require("node:path")
const fs = require("node:fs")

const MODES = ["app", "desktop", "screen"]
const cfgFile = () => path.join(app.getPath("userData"), "mode.json")
let cfg = { mode: "", display: 0, span: true } // display: id do monitor escolhido (0 = o principal); span: área de trabalho em todos os monitores
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
if (process.env.AGENDA_MODE != null) cfg.mode = process.env.AGENDA_MODE
if (cfg.mode && !MODES.includes(cfg.mode)) cfg.mode = ""
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

const mode = () => cfg.mode

/** monitor onde o Agenda fica (o escolhido, se ainda estiver ligado; senão o principal) */
function target() {
  const all = screen.getAllDisplays()
  return all.find((d) => d.id === cfg.display) || screen.getPrimaryDisplay()
}
const isPrimary = () => target().id === screen.getPrimaryDisplay().id
/** área de trabalho em todos os monitores, como uma tela só (modo área de trabalho com 2+ monitores) */
const spans = () => cfg.mode === "desktop" && cfg.span !== false && screen.getAllDisplays().length > 1 && !process.env.AGENDA_SHOT
/** todos os monitores juntos (a tela inteira: o papel de parede vai até a borda, por baixo da dock) */
function union() {
  const all = screen.getAllDisplays().map((d) => d.bounds)
  const x = Math.min(...all.map((r) => r.x)), y = Math.min(...all.map((r) => r.y))
  const r = Math.max(...all.map((a) => a.x + a.width)), b = Math.max(...all.map((a) => a.y + a.height))
  return { x, y, width: r - x, height: b - y }
}
/** retângulo da janela principal: o monitor escolhido, ou todos juntos */
const workArea = () => (spans() ? union() : target().workArea)
/** cada monitor dentro da janela principal (coordenadas da página), para o papel de parede, abas e avisos */
function screensInWindow() {
  const o = workArea()
  const prim = screen.getPrimaryDisplay().id
  const main = target().id
  const list = spans() ? screen.getAllDisplays() : [target()]
  return list
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    // x/y/w/h: área livre (abas, avisos, chão do bichinho); full: o monitor inteiro (papel de parede)
    .map((d) => ({
      id: d.id, x: d.workArea.x - o.x, y: d.workArea.y - o.y, w: d.workArea.width, h: d.workArea.height,
      full: spans() ? { x: d.bounds.x - o.x, y: d.bounds.y - o.y, w: d.bounds.width, h: d.bounds.height } : undefined,
      primary: d.id === prim, home: d.id === main,
    }))
}

function displays() {
  const prim = screen.getPrimaryDisplay().id
  const cur = target().id
  return screen.getAllDisplays()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      label: d.label || `Monitor ${i + 1}`,
      n: i + 1,
      primary: d.id === prim,
      current: d.id === cur,
      w: Math.round(d.size.width * (d.scaleFactor || 1)),
      h: Math.round(d.size.height * (d.scaleFactor || 1)),
      hz: d.displayFrequency || 0,
      bounds: d.bounds,
    }))
}

/** opções extras do BrowserWindow para o modo atual */
function windowOptions() {
  if (cfg.mode === "desktop") {
    const wa = workArea()
    return { ...wa, skipTaskbar: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, roundedCorners: false }
  }
  const wa = workArea()
  if (cfg.mode === "app") {
    const width = Math.min(1280, wa.width), height = Math.min(820, wa.height)
    return { width, height, minWidth: 820, minHeight: 560, x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2) }
  }
  // tela própria: nasce no monitor escolhido e maximiza lá
  return { x: wa.x + 40, y: wa.y + 40 }
}

const winh = require("./winhelper.cjs")
const native = (cmd) => { winh.call(cmd) }
const hwndOf = winh.hwndOf

/* ---------------- modo área de trabalho ---------------- */
let raised = false // uma aba aberta: o Agenda vem para a frente como um app normal
function attach(win) {
  if (cfg.mode === "app") return
  if (cfg.mode !== "desktop") return
  const h = hwndOf(win)
  let lastScreens = ""
  const fit = () => {
    if (win.isDestroyed()) return
    win.setBounds(workArea())
    const sc = JSON.stringify(screensInWindow())
    if (sc !== lastScreens) { lastScreens = sc; win.webContents.send("mode:screens", JSON.parse(sc)) }
  }
  const sink = () => { if (!raised && !win.isDestroyed()) native("bottom " + h) }
  win.once("ready-to-show", () => { native("own " + h); sink() })
  win.on("focus", () => setTimeout(sink, 0))
  win.on("show", () => setTimeout(sink, 50))
  // resolução, escala ou barra do Windows mudaram: acompanha a área livre da tela
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, fit)
  win.__agendaRaise = (on) => {
    raised = !!on
    // vir para a frente: o Windows não deixa um programa tomar o foco sozinho (ex.: Chrome maximizado na frente);
    // o ajudante força do jeito que o Windows permite
    if (raised) { win.show(); win.focus(); native("activate " + h) } else sink()
  }
}

/* ---------------- apps instalados no PC ---------------- */
const exists = (p) => { try { return !!p && fs.existsSync(p) } catch { return false } }
function storeApp(prefix) {
  const dir = path.join(process.env.LOCALAPPDATA || "", "Packages")
  try { return fs.readdirSync(dir).some((d) => d.toLowerCase().startsWith(prefix.toLowerCase())) } catch { return false }
}
function steamApp(appid) {
  const libs = new Set(["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"])
  for (const r of [...libs]) {
    try { for (const m of fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\")) } catch {}
  }
  return [...libs].some((l) => exists(path.join(l, "steamapps", `appmanifest_${appid}.acf`)))
}
function detectApps() {
  const A = process.env.APPDATA || "", L = process.env.LOCALAPPDATA || "", PF = process.env.ProgramFiles || "C:\\Program Files", PF86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
  const riot = ["C:\\Riot Games", "D:\\Riot Games"]
  const found = {
    spotify: exists(path.join(A, "Spotify", "Spotify.exe")) || storeApp("SpotifyAB.SpotifyMusic"),
    deezer: exists(path.join(L, "Programs", "deezer-desktop")) || storeApp("Deezer."),
    applemusic: storeApp("AppleInc.AppleMusicWin"),
    amazonmusic: exists(path.join(L, "Amazon Music")) || storeApp("AmazonMobileLLC.AmazonMusic"),
    tidal: exists(path.join(L, "TIDAL")),
    discord: exists(path.join(L, "Discord")) || exists(path.join(L, "DiscordPTB")),
    whatsapp: storeApp("5319275A.WhatsAppDesktop"),
    steam: exists(path.join(PF86, "Steam", "steam.exe")) || exists(path.join(PF, "Steam", "steam.exe")),
    cs2: steamApp(730),
    valorant: riot.some((r) => exists(path.join(r, "VALORANT"))),
    lol: riot.some((r) => exists(path.join(r, "League of Legends"))),
    epic: exists(path.join(PF86, "Epic Games", "Launcher")) || exists(path.join(PF, "Epic Games", "Launcher")),
  }
  return { apps: Object.keys(found).filter((k) => found[k]), monitors: screen.getAllDisplays().length }
}

function register(ipcMain, getWin, onQuit) {
  ipcMain.handle("mode:get", () => ({ mode: cfg.mode, monitors: screen.getAllDisplays().length, display: target().id }))
  ipcMain.handle("mode:displays", () => displays())
  ipcMain.handle("mode:screens", () => screensInWindow())
  ipcMain.handle("mode:span", (_e, on) => {
    if (typeof on !== "boolean") return cfg.span !== false
    const changed = on !== (cfg.span !== false)
    cfg.span = on
    save()
    if (changed && cfg.mode === "desktop" && !process.env.AGENDA_SHOT) { app.relaunch(); onQuit() }
    return on
  })
  // trocar de modo (ou de monitor) reabre o app (a janela é criada de outro jeito em cada modo)
  ipcMain.handle("mode:set", (_e, m, display) => {
    if (!MODES.includes(m)) return false
    const before = target().id
    if (typeof display === "number" && screen.getAllDisplays().some((d) => d.id === display)) cfg.display = display
    const changed = m !== cfg.mode || target().id !== before
    cfg.mode = m
    save()
    if (changed && !process.env.AGENDA_SHOT) { app.relaunch(); onQuit() }
    return true
  })
  ipcMain.handle("mode:raise", (_e, on) => {
    const w = getWin()
    if (w && w.__agendaRaise) w.__agendaRaise(on)
  })
  ipcMain.handle("apps:detect", () => detectApps())
}

module.exports = { mode, windowOptions, attach, register, isPrimary, workArea, target, spans, screensInWindow }
