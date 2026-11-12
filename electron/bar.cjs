// Barra do Agenda no lugar da barra do Windows (só no modo "Área de trabalho"), em TODOS os monitores.
// Em cada monitor: uma janela fina sempre por cima na borda de baixo, que esconde a barra do Windows,
// reserva o espaço dela (as janelas maximizadas param em cima da barra) e mostra os programas abertos.
// Nos monitores onde o Agenda principal não está, um fundo do Agenda (papel de parede + relógio) cobre
// a área de trabalho do Windows. Win+S abre a pesquisa do Agenda (keys.cjs); a tecla Windows sozinha abre o
// Iniciar do Windows (ou o do Widgy, se a pessoa escolher). Os fixados da barra do Windows aparecem aqui também.
const { app, BrowserWindow, screen, shell, nativeImage, globalShortcut } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const { execFile } = require("node:child_process")
const winh = require("./winhelper.cjs")
const modes = require("./mode.cjs")
const keys = require("./keys.cjs")
const games = require("./games.cjs")
const { foregroundInfo, shouldCaptureKeys } = require("./taskbar-key-policy.cjs")
const { createRecoveryBudget } = require("./taskbar-recovery.cjs")
const { collectStartApps, isAppsFolderTarget } = require("./startapps.cjs")

const cfgFile = () => path.join(app.getPath("userData"), "bar.json")
let cfg = { on: false, height: 64, position: "bottom", keys: true }
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) } } catch {}
// Explicit migration to Agenda keyboard control; preferences remain editable afterward.
if (!cfg.controlVersion) { cfg.winKey = "agenda"; cfg.keys = true; cfg.controlVersion = 1 }
// v2: a tecla Windows sozinha volta a abrir o Iniciar do Windows (igual ao botão "Iniciar do Windows")
if (cfg.controlVersion < 2) { cfg.winKey = "windows"; cfg.controlVersion = 2; try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {} }

/* ---------------- fixados da barra do Windows ---------------- */
// Os atalhos fixados na barra normal do Windows ficam nesta pasta; eles aparecem também na barra do Widgy.
// `path` é o programa de verdade (para juntar com a janela aberta dele); abrir usa o atalho (que guarda os argumentos).
const winPinDir = () => path.join(app.getPath("appData"), "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar")
let winPins = []
function readWinPins() {
  const out = []
  let files = []
  try { files = fs.readdirSync(winPinDir()).filter((f) => /\.lnk$/i.test(f)) } catch { return out }
  for (const f of files.sort((a, b) => a.localeCompare(b))) {
    const lnk = path.join(winPinDir(), f)
    let target = ""
    try { const l = shell.readShortcutLink(lnk); if (l.target && !l.args?.includes("--launch-product")) target = l.target } catch {}
    // Explorador de Arquivos: o atalho não tem caminho (é um item do shell)
    if (!target && /explorer|explorador/i.test(f)) target = path.join(process.env.WINDIR || "C:\\Windows", "explorer.exe")
    // atalhos que dependem dos argumentos (ex.: Riot Client --launch-product=valorant) ficam com o próprio atalho
    out.push({ path: target || lnk, name: f.replace(/\.lnk$/i, ""), open: lnk, win: true })
  }
  return out
}
/** fixados do Widgy + os do Windows (sem repetir e sem os que a pessoa tirou da barra do Widgy) */
function withWinPins(data) {
  if (!data) return data
  const own = Array.isArray(data.pins) ? data.pins : []
  const seen = new Set(own.map((p) => String(p.path).toLowerCase()))
  const hidden = new Set((cfg.hiddenWinPins || []).map((x) => x.toLowerCase()))
  const extra = winPins.filter((p) => !seen.has(p.path.toLowerCase()) && !hidden.has(p.open.toLowerCase()))
  return { ...data, pins: [...extra, ...own] }
}
/** abre um fixado: se for um fixado do Windows, pelo atalho dele */
function launchPin(file) {
  const wp = winPins.find((p) => p.path.toLowerCase() === String(file).toLowerCase())
  return shell.openPath(wp ? wp.open : file)
}
let winPinWatch = null, winPinT = null
function watchWinPins(resend) {
  winPins = readWinPins()
  if (winPinWatch) return
  try {
    winPinWatch = fs.watch(winPinDir(), () => {
      clearTimeout(winPinT)
      winPinT = setTimeout(() => { winPins = readWinPins(); resend() }, 400)
    })
  } catch {}
}

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
let polling = false
let helperFailures = 0
let helperGeneration = 0
let recoveryTimer = null
const recoveryBudget = createRecoveryBudget()
let recoveryShortcut = false
let desktopShortcut = false
let foreground = null // updated from the real foreground window, not from any background game process
const barFailureTimes = []
let settleT = null, warmupT = null, peekT = null
const hiddenOn = new Set() // monitores com jogo/vídeo em tela cheia: a barra some

/** jeito da barra: vem de Configurações › Barra de tarefas do Agenda (guardado aqui para já abrir certo) */
const TB = { position: "bottom", style: "dock", size: 56, autoHide: false, magnify: true, showLabels: false, smartHide: true }
const tb = () => ({ ...TB, ...(cfg.tb || {}) })
/** a janela transparente (dock/pílula) ou acrílica (barra) muda o tipo da janela: precisa recriar */
const clear = (t) => t.style !== "bar" || t.autoHide || t.smartHide !== false // janela transparente (dock, pílula ou barra que se esconde)
/** monitores com uma janela maximizada (ex.: Chrome): a barra se esconde e a janela usa a tela inteira */
const maxOn = new Set()
const kindOf = (t) => (clear(t) ? "clear" : "glass") + ":" + (t.position === "left" || t.position === "right" ? "v" : "h")

function rects(d) {
  const b = d.bounds
  const t = tb()
  // Sem o piso antigo de 28px no Carbono: 20px + 16px = 36px reais.
  const size = Math.max(lastSync?.pack === "carbono" ? 20 : 28, Math.min(96, Math.round(t.size)))
  const isDock = t.style !== "bar"
  // espessura que a barra ocupa de verdade (reservada para as janelas não ficarem embaixo)
  const band = size + 16 + (isDock ? 12 : 0)
  const reserve = t.autoHide || maxOn.has(d.id) ? 0 : band
  // espaço extra (transparente, deixa o clique passar) para a lupa e as legendas da dock
  const T = band + (isDock ? Math.round(size * 0.35) + 44 : 0)
  const pos = t.position
  const barRect =
    pos === "top" ? { x: b.x, y: b.y, width: b.width, height: T }
    : pos === "left" ? { x: b.x, y: b.y, width: T, height: b.height }
    : pos === "right" ? { x: b.x + b.width - T, y: b.y, width: T, height: b.height }
    : { x: b.x, y: b.y + b.height - T, width: b.width, height: T }
  const resRect =
    pos === "top" ? { x: b.x, y: b.y, width: b.width, height: reserve }
    : pos === "left" ? { x: b.x, y: b.y, width: reserve, height: b.height }
    : pos === "right" ? { x: b.x + b.width - reserve, y: b.y, width: reserve, height: b.height }
    : { x: b.x, y: b.y + b.height - reserve, width: b.width, height: reserve }
  const work =
    pos === "top" ? { x: b.x, y: b.y + reserve, width: b.width, height: b.height - reserve }
    : pos === "left" ? { x: b.x + reserve, y: b.y, width: b.width - reserve, height: b.height }
    : pos === "right" ? { x: b.x, y: b.y, width: b.width - reserve, height: b.height }
    : { x: b.x, y: b.y, width: b.width, height: b.height - reserve }
  const edge = { left: 0, top: 1, right: 2, bottom: 3 }[pos] ?? 3
  return { pos, band, reserve, barRect, resRect, work, edge, top: pos === "top" }
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
    const { barRect, resRect, reserve, edge } = rects(d)
    const b = bars.get(d.id)
    if (b && !b.isDestroyed()) {
      if (process.env.AGENDA_DEBUG_BOUNDS) console.log("[bounds]", (performance.now() / 1000).toFixed(3), "bar setBounds", d.id, JSON.stringify(barRect))
      b.setBounds(barRect)
      if (process.env.AGENDA_DEBUG_BOUNDS) console.log("[bounds]", (performance.now() / 1000).toFixed(3), "bar setBounds done", d.id)
      // registra a barra como AppBar: o Windows tira o espaço dela da área livre daquele monitor
      // (só quando muda: cada registro faz o Windows avisar que a tela mudou, o que chama layout de novo).
      // Ocultar automaticamente: não reserva nada.
      const p = screen.dipToScreenRect(null, resRect)
      const cmd = reserve ? `appbar ${winh.hwndOf(b)} ${p.x} ${p.y} ${p.x + p.width} ${p.y + p.height} ${edge}` : `unappbar ${winh.hwndOf(b)}`
      if (b.__appbar !== cmd) { b.__appbar = cmd; appbarQ.set(winh.hwndOf(b), cmd) }
    }
    const k = desks.get(d.id)
    if (k && !k.isDestroyed()) k.setBounds(d.bounds)
  }
  // um monitor de cada vez: mudando o espaço dos dois juntos, o Windows empurra a área de trabalho do Agenda
  // (que cobre os dois monitores) para o canto do principal, e a imagem "pula"
  if (!appbarT) runAppbars()
  // a área de trabalho do Agenda acompanha a área livre nova
  setTimeout(() => { const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(modes.workArea()) }, 400)
}

/* ---------------- ícones dos programas ---------------- */
// Evita reter milhares de ícones PNG/base64 e jobs pendentes durante horas.
const icons = new Map()
const iconQueued = new Set()
const iconQueue = []
let iconWorkers = 0
let iconBytes = 0
const ICON_LIMIT = 96
const ICON_BYTES = 3 * 1024 * 1024
function iconGet(key) {
  if (!icons.has(key)) return undefined
  const value = icons.get(key)
  icons.delete(key)
  icons.set(key, value)
  return value
}
function iconPut(key, value) {
  const previous = icons.get(key)
  if (previous !== undefined) iconBytes -= previous.length
  icons.delete(key)
  if (value.length <= 512 * 1024) {
    icons.set(key, value)
    iconBytes += value.length
  }
  while (icons.size > ICON_LIMIT || iconBytes > ICON_BYTES) {
    const oldest = icons.keys().next().value
    if (oldest === undefined) break
    iconBytes -= icons.get(oldest).length
    icons.delete(oldest)
  }
}
function pumpIcons() {
  while (iconWorkers < 2 && iconQueue.length) {
    const file = iconQueue.shift()
    const key = file.toLowerCase()
    iconWorkers++
    // Nunca aguardar ícones dentro do poll de janelas; respostas lentas do Shell
    // estavam bloqueando atualização e prévias de Steam/Discord.
    void iconOf(file, false).catch(() => "").finally(() => {
      iconQueued.delete(key)
      iconWorkers--
      pumpIcons()
    })
  }
}
function iconForPoll(file) {
  if (!file) return ""
  const key = file.toLowerCase()
  const cached = iconGet(key)
  if (cached !== undefined) return cached
  if (!iconQueued.has(key) && iconQueue.length < 32) {
    iconQueued.add(key)
    iconQueue.push(file)
    pumpIcons()
  }
  return ""
}
/**
 * De onde tirar o ícone: atalhos (.lnk) apontam para o programa (ou para um ícone próprio);
 * atalhos de internet (.url, ex.: jogos da Steam) dizem o ícone na linha IconFile.
 */
const expand = (p) => String(p || "").replace(/%([^%]+)%/g, (m, k) => process.env[k] ?? process.env[k.toUpperCase()] ?? m).replace(/^"|"$/g, "")
function iconSource(file) {
  const low = file.toLowerCase()
  try {
    if (low.endsWith(".lnk")) {
      const l = shell.readShortcutLink(file)
      const icon = expand(l.icon)
      if (icon && fs.existsSync(icon)) return { file: icon, index: l.iconIndex || 0 }
      const target = expand(l.target)
      if (target && fs.existsSync(target)) return { file: target, index: 0 }
    } else if (low.endsWith(".url")) {
      const m = fs.readFileSync(file, "utf8").match(/^IconFile=(.+)$/im)
      const f = m && expand(m[1].trim())
      if (f && fs.existsSync(f)) return { file: f, index: 0 }
    }
  } catch {}
  return { file, index: 0 }
}
async function iconOf(file, useNative = false) {
  if (!file) return ""
  const k = file.toLowerCase()
  const cached = iconGet(k)
  if (cached !== undefined) return cached
  let url = ""
  // Menu Iniciar can render dozens of icons at once. Never fill the single
  // Win32 helper FIFO with thumbnail requests, as this stalls taskbar polling.
  if (useNative) {
    const b64 = await winh.call("icon " + file)
    if (b64 && b64 !== "none" && b64 !== "ok" && /^[A-Za-z0-9+/=]+$/.test(b64)) {
      const data = "data:image/png;base64," + b64
      iconPut(k, data)
      return data
    }
  }
  const src = iconSource(file)
  try {
    // arquivo .ico: lê direto (fica nítido); .exe/.dll: o Windows dá o ícone dele
    if (/\.(ico|png)$/i.test(src.file)) { const img = nativeImage.createFromPath(src.file); if (!img.isEmpty()) url = img.resize({ width: 48, height: 48, quality: "best" }).toDataURL() }
    if (!url) url = (await app.getFileIcon(src.file, { size: "large" })).toDataURL()
  } catch {}
  if (!url && src.file !== file) { try { url = (await app.getFileIcon(file, { size: "large" })).toDataURL() } catch {} }
  iconPut(k, url)
  return url
}
const nice = (exe) => path.basename(exe || "", ".exe").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

async function tick() {
  if (!bars.size || polling) return
  polling = true
  try { await tickWindows() }
  catch (e) { console.warn("Widgy bar poll:", e.message) }
  finally { polling = false }
}
async function tickWindows() {
  if (!bars.size) return
  const raw = await winh.call("list")
  if (!bars.size) return
  if (!raw) {
    // A helper may be restarting after Explorer changes, a suspended game or a timeout.
    // Temporarily restore native taskbar then retry without clearing the preference.
    // Ajudante lento (comum com um jogo pesado aberto) não é a barra quebrada: a barra do Widgy continua
    // funcionando e a do Windows continua escondida. Só registra; antes isso derrubava a barra do Widgy.
    if (++helperFailures === 5) console.warn("Widgy bar: ajudante Win32 lento; mantendo a barra do Widgy")
    return
  }
  helperFailures = 0
  const generation = winh.generation?.() ?? 0
  if (generation !== helperGeneration) {
    helperGeneration = generation
    keys.refresh() // Explorer/ajudante reiniciou: garante o gancho de teclado também
    await winh.call("hidetb")
    for (const b of bars.values()) b.__appbar = ""
    layout()
  }
  let j
  try { j = JSON.parse(raw) } catch { return }
  const nextForeground = foregroundInfo(j)
  if (!foreground || foreground.exe !== nextForeground.exe || foreground.unresolvedFullscreen !== nextForeground.unresolvedFullscreen) {
    foreground = nextForeground
    syncKeys()
  }
  const own = process.execPath.toLowerCase()
  // janelas maximizadas por monitor (esconder a barra e deixar a janela ocupar a tela toda)
  const maxNow = new Set()
  if (tb().smartHide !== false) for (const w of j.wins) {
    if (!w.z || (w.exe || "").toLowerCase() === own) continue
    maxNow.add(screen.getDisplayNearestPoint(screen.screenToDipPoint({ x: w.z[0] + 1, y: w.z[1] + 1 })).id)
  }
  if ([...maxNow].sort().join() !== [...maxOn].sort().join()) {
    maxOn.clear(); for (const id of maxNow) maxOn.add(id)
    for (const [id, b] of bars) if (!b.isDestroyed()) b.webContents.send("bar:max", maxOn.has(id))
    layout()
  }
  const wins = []
  for (const w of j.wins) {
    if ((w.exe || "").toLowerCase() === own) continue
    wins.push({ h: w.h, title: w.t, exe: w.exe, name: nice(w.exe), min: w.min, icon: iconForPoll(w.exe) })
  }
  if (wins.some((w) => w.h === j.fg)) lastFg = j.fg
  else if (j.fg !== "0" && !j.full) lastFg = ""
  // jogo ou vídeo em tela cheia: a barra daquele monitor some (como a do Windows)
  // (a própria área de trabalho do Agenda cobre os monitores inteiros, mas não é tela cheia)
  const m = getMain()
  const ownFg = m && !m.isDestroyed() && winh.hwndOf(m) === j.fg
  const fullId = j.full && !menu && !ownFg ? screen.getDisplayNearestPoint(screen.screenToDipPoint({ x: j.fl + 1, y: j.ft + 1 })).id : null
  const payload = { wins, fg: lastFg }
  const signature = JSON.stringify(payload)
  for (const [id, b] of bars) {
    if (b.isDestroyed()) continue
    // o Windows às vezes empurra a barra para dentro da área livre: devolve para a borda
    const d = screen.getAllDisplays().find((x) => x.id === id)
    if (d) { const want = rects(d).barRect, cur = b.getBounds(); if (cur.x !== want.x || cur.y !== want.y || cur.width !== want.width || cur.height !== want.height) b.setBounds(want) }
    const hide = id === fullId
    if (hide !== hiddenOn.has(id)) { if (hide) { hiddenOn.add(id); b.hide() } else { hiddenOn.delete(id); b.showInactive() } }
    // Evita serializar/mandar ícones em base64 e renderizar a barra todo segundo.
    // Pulso a cada 8s recupera assinaturas perdidas durante o primeiro carregamento.
    if (b.__winsSignature !== signature || Date.now() - (b.__winsSentAt || 0) >= 8000) {
      b.__winsSignature = signature
      b.__winsSentAt = Date.now()
      b.webContents.send("bar:wins", payload)
    }
  }
}

const page = (win, q) => {
  if (isDev) win.loadURL("http://localhost:5173/taskbar.html?" + new URLSearchParams(q))
  else win.loadFile(path.join(__dirname, "..", "dist", "taskbar.html"), { query: q })
}
const prefs = () => ({ preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false })

function makeBar(d) {
  const { barRect } = rects(d)
  const dock = clear(tb())
  const b = new BrowserWindow({
    ...barRect,
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false, roundedCorners: false,
    // barra inteira: vidro acrílico do Windows; dock e pílula: janela transparente, só a dock aparece
    ...(dock ? { transparent: true, backgroundColor: "#00000000" } : { transparent: false, backgroundMaterial: "acrylic", backgroundColor: "#00000000" }),
    title: "Widgy — barra", webPreferences: prefs(),
  })
  b.setAlwaysOnTop(true, "pop-up-menu")
  // a parte transparente deixa o clique passar para o que está atrás; a página avisa quando o mouse está na dock
  if (dock) b.setIgnoreMouseEvents(true, { forward: true })
  b.__dock = dock
  page(b, { view: "bar" })
  b.once("ready-to-show", () => { if (!b.isDestroyed() && !hiddenOn.has(d.id)) b.showInactive() })
  b.webContents.on("did-finish-load", () => { if (!b.isDestroyed()) { b.__winsSignature = null; b.webContents.send("bar:max", maxOn.has(d.id)) } })
  const failed = () => {
    if (bars.get(d.id) !== b || !active()) return
    const now = Date.now()
    barFailureTimes.push(now)
    while (barFailureTimes.length && barFailureTimes[0] < now - 45000) barFailureTimes.shift()
    if (barFailureTimes.length >= 5) recoverTaskbar("renderizador da barra instável")
    else rebuild()
  }
  let freezeTimer = null
  b.webContents.on("render-process-gone", failed)
  b.on("unresponsive", () => {
    clearTimeout(freezeTimer)
    freezeTimer = setTimeout(failed, 9000)
  })
  b.on("responsive", () => { clearTimeout(freezeTimer); freezeTimer = null })
  b.on("closed", () => {
    clearTimeout(freezeTimer)
    if (bars.get(d.id) === b) failed()
  })
  bars.set(d.id, b)
}

/** fundo do Agenda nos monitores sem o Agenda principal: fica atrás de tudo, como a área de trabalho */
function makeDesk(d) {
  const k = new BrowserWindow({
    ...d.bounds,
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, show: false, roundedCorners: false, thickFrame: false, backgroundColor: "#000000",
    title: "Widgy — fundo", webPreferences: prefs(),
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
  recoveryShortcut = globalShortcut.register("Control+Alt+Backspace", () => { cfg.on = false; save(); teardown() })
  // Global hotkey uses RegisterHotKey, NOT a low-level keyboard hook. It is a
  // safe alternative to Win+D while an anti-cheat game owns the foreground.
  desktopShortcut = globalShortcut.register("Control+Alt+D", () => toggleDesktop())
  const main = modes.target().id
  // com a área de trabalho em todos os monitores, o Agenda já cobre todos: não precisa de fundo
  const span = modes.spans()
  builtKind = kindOf(tb())
  for (const d of screen.getAllDisplays()) {
    makeBar(d)
    if (!span && d.id !== main) makeDesk(d)
  }
  winh.call("hidetb").then((st) => {
    if (st) helperGeneration = winh.generation?.() ?? 0
    if (/^\d+$/.test(st) && cfg.abState == null) { cfg.abState = Number(st); save() }
  })
  cfg.hidTaskbar = true; save()
  layout()
  // a barra do Windows leva um instante para se esconder: registra de novo depois, já sem ela ocupando espaço
  settleT = setTimeout(() => { for (const b of bars.values()) b.__appbar = ""; layout() }, 2500)
  poll = setInterval(tick, 1000)
  // deixa a prévia pronta (janela carregada e o ajudante das miniaturas aberto): aparece sem esperar na 1ª vez
  warmupT = setTimeout(() => { previewWin(); winh.call("phide") }, 3000)
  for (const ev of ["display-added", "display-removed"]) screen.on(ev, rebuild)
  screen.on("display-metrics-changed", onMetrics)
  syncKeys()
}
let builtKind = ""
// registros de barra pendentes (um por janela, o mais novo vale), aplicados um a cada 300 ms
const appbarQ = new Map()
let appbarT = null
function runAppbars() {
  appbarT = null
  const first = appbarQ.entries().next()
  if (first.done) return
  const [h, cmd] = first.value
  appbarQ.delete(h)
  if (process.env.AGENDA_DEBUG_BOUNDS) console.log("[bounds]", (performance.now() / 1000).toFixed(3), "appbar", cmd)
  winh.call(cmd).then(() => { if (process.env.AGENDA_DEBUG_BOUNDS) console.log("[bounds]", (performance.now() / 1000).toFixed(3), "appbar done") })
  if (appbarQ.size) appbarT = setTimeout(runAppbars, 300)
}
let tbT = null
let rebuildT = null
function rebuild() {
  clearTimeout(rebuildT)
  rebuildT = setTimeout(() => { teardown(false); create() }, 800)
}
/** Safe fallback while restarting: show the native taskbar, retry at most 3
 * times per 5-minute window, and keep the user's on/off choice unchanged.
 */
function recoverTaskbar(reason) {
  if (!active()) return
  const plan = recoveryBudget.failure()
  console.warn("Widgy taskbar recovery:", reason, "attempt", plan.attempt)
  teardown(true, false)
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null
    if (active() && !bars.size) create()
  }, plan.delayMs)
  recoveryTimer.unref?.()
}
function onMetrics() { if (bars.size) layout() }

/* ---------------- menus em cima da barra ---------------- */
let menuKind = ""
let menuDisplay = 0 // monitor do menu aberto (o que ele pedir abre nesse monitor)
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
  hidePreview()
  const d = (barWin && !barWin.isDestroyed() && displayOfWin(barWin)) || screen.getPrimaryDisplay()
  const b = bars.get(d.id) || primaryBar()
  const { barRect, band, pos } = rects(d)
  const B = d.bounds
  const vertical = pos === "left" || pos === "right"
  // o menu abre encostado na dock (não no espaço transparente acima dela), virado para dentro da tela
  const roomH = vertical ? B.height - 16 : B.height - band - 24
  const roomW = vertical ? B.width - band - 24 : B.width - 16
  const W = Math.max(280, Math.min(900, roomW, Math.round(w) || 560))
  const H = Math.max(200, Math.min(roomH, Math.round(h) || 600))
  const a = anchorX == null ? (vertical ? barRect.height : barRect.width) / 2 : anchorX
  const clampX = (v) => Math.max(B.x + 8, Math.min(B.x + B.width - W - 8, Math.round(v)))
  const clampY = (v) => Math.max(B.y + 8, Math.min(B.y + B.height - H - 8, Math.round(v)))
  const x = pos === "left" ? B.x + band + 8 : pos === "right" ? B.x + B.width - band - W - 8 : clampX(barRect.x + a - W / 2)
  const y = pos === "top" ? B.y + band + 8 : pos === "bottom" ? B.y + B.height - band - H - 8 : clampY(barRect.y + a - H / 2)
  menuDisplay = d.id
  const m = new BrowserWindow({
    x, y, width: W, height: H,
    frame: false, transparent: false, backgroundMaterial: "acrylic", resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, roundedCorners: true, backgroundColor: "#00000000", title: "Widgy — menu", webPreferences: prefs(),
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

/* ---------------- prévia das janelas ao passar o mouse (como no Windows) ---------------- */
// Uma janelinha acrílica em cima do botão; dentro dela o próprio Windows (DWM) desenha a miniatura ao vivo
// de cada janela do programa (a minimizada aparece com a última imagem dela).
const TILE_W = 236, THUMB_H = 132, HEAD = 30, PAD = 8
let preview = null
let previewKey = ""
let previewT = null
let previewHover = false
let previewReadyTimer = null
function previewWin() {
  if (preview && !preview.isDestroyed()) return preview
  preview = new BrowserWindow({
    width: 300, height: 200, frame: false, transparent: false, backgroundMaterial: "acrylic", resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false, roundedCorners: true, backgroundColor: "#00000000",
    title: "Widgy — prévia", webPreferences: prefs(),
  })
  preview.setAlwaysOnTop(true, "pop-up-menu")
  page(preview, { view: "preview" })
  preview.webContents.on("did-start-loading", () => { previewLoaded = false })
  preview.on("closed", () => { hidePreview(); preview = null; previewLoaded = false })
  return preview
}
function hidePreview() {
  clearTimeout(previewReadyTimer); previewReadyTimer = null
  clearTimeout(previewT); previewT = null
  clearInterval(fadeT); fadeT = null
  const hadPreview = !!previewKey
  previewHover = false
  previewData = null
  previewKey = ""
  previewGo = null
  if (hadPreview) winh.call("phide")
  if (preview && !preview.isDestroyed()) preview.hide()
}
/** items: janelas do programa; anchor: centro do botão (px da barra) */
function showPreview(barWin, items, anchor) {
  clearTimeout(previewT); previewT = null
  if (menu || !items || !items.length) return hidePreview()
  const d = (barWin && displayOfWin(barWin)) || screen.getPrimaryDisplay()
  const key = `${d.id}:${anchor}:` + items.map((i) => i.h).join(",")
  if (key === previewKey && preview && preview.isVisible()) return
  const { band, pos } = rects(d)
  const B = d.bounds
  const n = Math.min(items.length, Math.max(1, Math.floor((B.width - 40) / TILE_W)))
  const list = items.slice(0, n)
  const W = PAD * 2 + n * TILE_W, H = PAD * 2 + HEAD + THUMB_H
  const vertical = pos === "left" || pos === "right"
  const bar = bars.get(d.id)
  const br = bar ? bar.getBounds() : B
  const clampX = (v) => Math.max(B.x + 8, Math.min(B.x + B.width - W - 8, Math.round(v)))
  const clampY = (v) => Math.max(B.y + 8, Math.min(B.y + B.height - H - 8, Math.round(v)))
  const x = pos === "left" ? B.x + band + 8 : pos === "right" ? B.x + B.width - band - W - 8 : clampX(br.x + anchor - W / 2)
  const y = pos === "top" ? B.y + band + 8 : pos === "bottom" ? B.y + B.height - band - H - 8 : clampY(br.y + anchor - H / 2)
  const w = previewWin()
  previewKey = key
  w.setBounds({ x, y, width: W, height: H })
  // retângulo de cada miniatura (o mesmo que a página desenha)
  const tiles = list.map((it, i) => ({ ...it, x: PAD + i * TILE_W, y: PAD, w: TILE_W, head: HEAD, thumb: { x: PAD + i * TILE_W + 8, y: PAD + HEAD, w: TILE_W - 16, h: THUMB_H - 8 } }))
  // a página desenha os quadros e avisa (preview:ready); só então a janela e as miniaturas aparecem — juntas
  const seq = ++previewSeq
  const wasOpen = w.isVisible()
  previewGo = (got) => {
    if (got !== seq || previewKey !== key || w.isDestroyed()) return
    previewGo = null
    clearTimeout(previewReadyTimer); previewReadyTimer = null
    winh.call("phide")
    const fade = !wasOpen // trocando de um programa para outro com a prévia aberta: troca na hora
    if (fade) { w.setOpacity(0); fadeIn(w) }
    w.showInactive()
    for (const t of tiles) {
      // retângulo da miniatura na tela, em pixels reais
      const p = screen.dipToScreenRect(null, { x: x + t.thumb.x, y: y + t.thumb.y, width: t.thumb.w, height: t.thumb.h })
      winh.call(`pshow ${t.h} ${p.x} ${p.y} ${p.width} ${p.height} ${fade ? 1 : 0}`)
    }
  }
  previewData = { tiles, seq }
  // Em GPU/DWM congestionado, a janela de prévia não deve ficar presa aguardando o renderer.
  clearTimeout(previewReadyTimer)
  previewReadyTimer = setTimeout(() => {
    if (previewGo && previewKey === key) hidePreview()
  }, 2500)
  // did-finish-load não garante que o efeito React já assinou o canal IPC.
  if (previewLoaded) w.webContents.send("preview:data", previewData)
}
let previewSeq = 0
let previewGo = null
let previewLoaded = false
let previewData = null
let fadeT = null
function fadeIn(w) {
  clearInterval(fadeT)
  let o = 0
  fadeT = setInterval(() => {
    o = Math.min(1, o + 0.15)
    if (w.isDestroyed()) return clearInterval(fadeT)
    w.setOpacity(o)
    if (o >= 1) clearInterval(fadeT)
  }, 15)
}
/** saiu do botão: espera um pouco (pode estar indo para a prévia) */
function leavePreview() {
  clearTimeout(previewT)
  previewT = setTimeout(() => { if (!previewHover) hidePreview() }, 280)
}

/* ---------------- tecla Windows ---------------- */
function syncKeys() {
  keys.winKey(cfg.winKey === "agenda")
  keys.enable(shouldCaptureKeys({ barActive: bars.size > 0, enabled: cfg.keys !== false, foreground }))
}
function toggleDesktop() {
  if (!bars.size) return
  closeMenu()
  hidePreview()
  void winh.call("desktop").then(() => {
    for (const [id, b] of bars)
      if (!b.isDestroyed() && !hiddenOn.has(id) && !b.isVisible()) b.showInactive()
  })
}
keys.onKey((ev) => {
  if (!bars.size) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const target = bars.get(display.id) || primaryBar()
  if (ev === "desktop") { toggleDesktop(); return }
  // pacote Carbono ativo: Win+S (e a tecla Windows, se ela abre o Widgy) abrem a busca do Carbono
  if ((ev === "start" || ev === "search") && lastSync && lastSync.pack === "carbono") {
    const main = getMain()
    if (main && !main.isDestroyed()) {
      main.webContents.send("bar:main", { type: "palette", screen: display.id })
      main.show(); main.focus(); winh.call("activate " + winh.hwndOf(main))
      return
    }
  }
  if (ev === "start" || ev === "search") { openMenu("start", null, 640, 660, target, ev); return }
  if (ev.startsWith("pin:")) {
    const pin = withWinPins(lastSync)?.pins?.[Number(ev.slice(4))]
    if (pin?.path) launchPin(pin.path)
    return
  }
  const main = getMain()
  if (!main || main.isDestroyed()) return
  const message = ev === "settings" ? { type: "open", id: "settings" } : { type: ev === "notifications" ? "bell" : "assistant" }
  main.webContents.send("bar:main", { ...message, screen: display.id })
  main.show(); main.focus(); winh.call("activate " + winh.hwndOf(main))
})
// Running games are not a reason to disable shortcuts in another foreground app.
// Foreground changes are detected by tickWindows() above.

function teardown(restore = true, notify = true) {
  clearTimeout(settleT); clearTimeout(warmupT); clearTimeout(rebuildT); clearTimeout(peekT); clearTimeout(recoveryTimer)
  recoveryTimer = null
  helperFailures = 0
  barFailureTimes.length = 0
  if (recoveryShortcut) globalShortcut.unregister("Control+Alt+Backspace")
  if (desktopShortcut) globalShortcut.unregister("Control+Alt+D")
  recoveryShortcut = false
  desktopShortcut = false
  foreground = null
  if (poll) { clearInterval(poll); poll = null }
  for (const ev of ["display-added", "display-removed"]) screen.removeListener(ev, rebuild)
  screen.removeListener("display-metrics-changed", onMetrics)
  appbarQ.clear(); clearTimeout(appbarT); appbarT = null
  closeMenu()
  hidePreview()
  if (preview && !preview.isDestroyed()) preview.destroy()
  const oldBars = [...bars.values()]; bars.clear()
  for (const b of oldBars) if (!b.isDestroyed()) { winh.call("unappbar " + winh.hwndOf(b)); b.destroy() }
  for (const k of desks.values()) if (!k.isDestroyed()) k.destroy()
  iconQueue.length = 0
  iconQueued.clear()
  icons.clear()
  iconBytes = 0
  bars.clear(); desks.clear(); hiddenOn.clear()
  keys.enable(false)
  if (!restore) return
  const main = getMain()
  if (notify && main && !main.isDestroyed()) main.webContents.send("bar:main", { type: "shell-failed" })
  winh.call("restore " + (cfg.abState ?? -1))
  cfg.hidTaskbar = false; delete cfg.abState; save()
  setTimeout(() => { const m = getMain(); if (m && !m.isDestroyed()) m.setBounds(modes.workArea()) }, 300)
}

/* ---------------- aplicativos do Menu Iniciar ---------------- */
let appsCache = null
let appsAt = 0
let appsPending = null
const APPS_FRESH_MS = 5 * 60 * 1000
function refreshApps() {
  if (appsPending) return appsPending
  appsPending = collectStartApps()
    .then((items) => { appsCache = items; appsAt = Date.now(); return items })
    .catch((error) => { console.warn("Widgy installed apps:", error.message); return appsCache || [] })
    .finally(() => { appsPending = null })
  return appsPending
}
/**
 * Lista de programas do PC. Montá-la pede ao Windows (PowerShell + pastas do Iniciar) e leva 1–2 s,
 * então a lista guardada volta na hora; se tiver mais de 5 min, ela é atualizada em segundo plano
 * para a próxima vez (antes a busca esperava a lista ser montada de novo).
 */
async function startApps() {
  if (appsCache) {
    if (Date.now() - appsAt > APPS_FRESH_MS) void refreshApps()
    return appsCache
  }
  return refreshApps()
}

const state = () => ({ on: cfg.on, height: cfg.height, position: cfg.position, keys: cfg.keys !== false, winKey: cfg.winKey === "agenda" ? "agenda" : "windows", available: modes.mode() === "desktop", active: bars.size > 0 })

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  app.whenReady().then(() => {
    // a barra do Windows ficou escondida numa vez anterior (ajudante fechado à força): devolve
    if (cfg.hidTaskbar && !active()) { winh.call("restore " + (cfg.abState ?? 0)); cfg.hidTaskbar = false; delete cfg.abState; save() }
    setTimeout(create, 1200)
  })
  app.on("before-quit", () => {
    clearTimeout(recoveryTimer); recoveryTimer = null
    if (bars.size) teardown()
  })

  ipcMain.handle("bar:get", () => state())
  ipcMain.handle("bar:set", (_e, p) => {
    const q = p || {}
    if (typeof q.on === "boolean") cfg.on = q.on
    if (typeof q.keys === "boolean") cfg.keys = q.keys
    if (q.winKey === "agenda" || q.winKey === "windows") cfg.winKey = q.winKey
    if (typeof q.height === "number") cfg.height = q.height
    if (q.position === "top" || q.position === "bottom") cfg.position = q.position
    save()
    if (active()) { if (!bars.size) create(); else { layout(); syncKeys() } }
    else if (bars.size) teardown()
    return state()
  })
  // a janela principal manda tema, fixados, papel de parede e avisos; barras e fundos recebem
  const sendSync = () => {
    const data = withWinPins(lastSync)
    if (!data) return
    for (const w of [...bars.values(), ...desks.values()]) if (!w.isDestroyed()) w.webContents.send("bar:sync", data)
    if (menu && !menu.isDestroyed()) menu.webContents.send("bar:sync", data)
  }
  watchWinPins(sendSync)
  ipcMain.on("bar:sync", (_e, raw) => {
    lastSync = raw
    const data = withWinPins(raw)
    // jeito da barra mudou nas configurações: reposiciona (ou recria, se mudou de dock para barra/vertical)
    if (data && data.tb) {
      const t = { ...TB, ...data.tb }
      const changed = JSON.stringify(t) !== JSON.stringify(tb())
      if (changed) {
        cfg.tb = t; save()
        // arrastando o tamanho: espera parar (cada mudança no espaço reservado faz o Windows reorganizar a tela)
        clearTimeout(tbT)
        tbT = setTimeout(() => {
          if (!bars.size) return
          if (kindOf(tb()) !== builtKind) rebuild(); else { for (const b of bars.values()) b.__appbar = ""; layout() }
        }, 350)
      }
    }
    for (const w of [...bars.values(), ...desks.values()]) if (!w.isDestroyed()) w.webContents.send("bar:sync", data)
    if (menu && !menu.isDestroyed()) menu.webContents.send("bar:sync", data)
  })
  ipcMain.handle("bar:hello", () => withWinPins(lastSync))
  // pedidos da barra para a janela principal (abrir aba, busca, fixar…)
  ipcMain.on("bar:main", (e, msg) => {
    const m = getMain()
    if (!m || m.isDestroyed() || !msg) return
    // tirar da barra um fixado do Windows: some só da barra do Widgy (a do Windows não é mexida)
    if (msg.type === "unpin") {
      const wp = winPins.find((p) => p.path.toLowerCase() === String(msg.path).toLowerCase())
      if (wp) { cfg.hiddenWinPins = [...new Set([...(cfg.hiddenWinPins || []), wp.open])]; save(); sendSync() }
    }
    // fixar de novo um que estava escondido
    if (msg.type === "pin" && msg.app && cfg.hiddenWinPins?.length) {
      const wp = winPins.find((p) => p.path.toLowerCase() === String(msg.app.path).toLowerCase())
      if (wp) { cfg.hiddenWinPins = cfg.hiddenWinPins.filter((x) => x.toLowerCase() !== wp.open.toLowerCase()); save(); sendSync(); return }
    }
    // de qual monitor veio o pedido (abas e painéis abrem nele)
    const w = BrowserWindow.fromWebContents(e.sender)
    const d = w === menu ? { id: menuDisplay } : displayOfWin(w)
    m.webContents.send("bar:main", { ...msg, screen: d ? d.id : undefined })
  })
  // dock transparente: o clique só é pego quando o mouse está em cima da dock (fora dela, passa para trás)
  ipcMain.on("bar:hit", (e, on) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w && w.__dock && !w.isDestroyed()) w.setIgnoreMouseEvents(!on, { forward: true })
  })
  // menus (Iniciar, relógio…): janelinha acrílica em cima da barra que pediu, fecha ao clicar fora
  ipcMain.handle("bar:menu", (e, kind, anchorX, w, h) => openMenu(kind, anchorX, w, h, BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle("bar:closeMenu", () => closeMenu())
  ipcMain.on("bar:preview", (e, items, anchor) => showPreview(BrowserWindow.fromWebContents(e.sender), items, anchor))
  ipcMain.on("bar:previewLeave", () => leavePreview())
  ipcMain.on("preview:hover", (_e, on) => { previewHover = !!on; if (on) clearTimeout(previewT); else leavePreview() })
  ipcMain.on("preview:hide", () => hidePreview())
  ipcMain.on("preview:ready", (e, seq) => {
    if (!preview || preview.isDestroyed() || e.sender !== preview.webContents) return
    if (seq === 0) {
      previewLoaded = true
      if (previewData) preview.webContents.send("preview:data", previewData)
    } else if (previewGo) previewGo(seq)
  })
  ipcMain.handle("bar:click", (_e, h, wasMin) => {
    hidePreview()
    if (h === lastFg && !wasMin) return winh.call("minimize " + h)
    lastFg = h
    return winh.call("activate " + h)
  })
  ipcMain.handle("bar:win", (_e, cmd, h) => { if (["activate", "minimize", "close"].includes(cmd) && /^\d+$/.test(String(h))) return winh.call(cmd + " " + h) })
  ipcMain.handle("bar:desktop", () => toggleDesktop())
  ipcMain.handle("bar:winstart", () => { closeMenu(); hidePreview(); return winh.call("winstart") })
  ipcMain.handle("bar:peek", (_e, on) => {
    clearTimeout(peekT)
    if (!bars.size) return ""
    if (on) peekT = setTimeout(() => { if (bars.size) winh.call("peek 0") }, 10000)
    return winh.call("peek " + (on ? 1 : 0))
  })
  ipcMain.handle("bar:apps", () => startApps())
  ipcMain.handle("bar:icon", (_e, file) => iconOf(String(file || ""), false))
  ipcMain.handle("bar:launch", (_e, file) => {
    if (typeof file !== "string" || !file) return
    if (isAppsFolderTarget(file)) {
      return new Promise((resolve) => {
        execFile("explorer.exe", [file], { windowsHide: true }, (error) => resolve(error ? error.message : ""))
      })
    }
    return launchPin(file)
  })
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
