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
let cfg = { mode: "" }
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
if (process.env.AGENDA_MODE != null) cfg.mode = process.env.AGENDA_MODE
if (cfg.mode && !MODES.includes(cfg.mode)) cfg.mode = ""
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

const mode = () => cfg.mode

/** opções extras do BrowserWindow para o modo atual */
function windowOptions() {
  if (cfg.mode === "desktop") {
    const wa = screen.getPrimaryDisplay().workArea
    return { ...wa, skipTaskbar: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, roundedCorners: false }
  }
  if (cfg.mode === "app") return { width: 1280, height: 820, minWidth: 820, minHeight: 560 }
  return {}
}

const winh = require("./winhelper.cjs")
const native = (cmd) => { winh.call(cmd) }
const hwndOf = winh.hwndOf

/* ---------------- modo área de trabalho ---------------- */
let raised = false // uma aba aberta: o Agenda vem para a frente como um app normal
function attach(win) {
  if (cfg.mode === "app") { win.center(); return }
  if (cfg.mode !== "desktop") return
  const h = hwndOf(win)
  const fit = () => { if (!win.isDestroyed()) win.setBounds(screen.getPrimaryDisplay().workArea) }
  const sink = () => { if (!raised && !win.isDestroyed()) native("bottom " + h) }
  win.once("ready-to-show", () => { native("own " + h); sink() })
  win.on("focus", () => setTimeout(sink, 0))
  win.on("show", () => setTimeout(sink, 50))
  // resolução, escala ou barra do Windows mudaram: acompanha a área livre da tela
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, fit)
  win.__agendaRaise = (on) => {
    raised = !!on
    if (raised) { win.show(); win.focus() } else sink()
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
  ipcMain.handle("mode:get", () => ({ mode: cfg.mode, monitors: screen.getAllDisplays().length }))
  // trocar de modo reabre o app (a janela é criada de outro jeito em cada modo)
  ipcMain.handle("mode:set", (_e, m) => {
    if (!MODES.includes(m)) return false
    const changed = m !== cfg.mode
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

module.exports = { mode, windowOptions, attach, register }
