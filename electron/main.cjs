// Agenda — processo principal (Electron)
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, clipboard, screen } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const { spawn, execFile } = require("node:child_process")
const { pathToFileURL, fileURLToPath } = require("node:url")
const music = require("./music.cjs")
// Módulos que consultam userData só podem ser carregados após fixar o caminho legado.

const isDev = !!process.env.AGENDA_DEV
// timers no horário certo em segundo plano (avisos, leituras) e o YouTube Music nunca pausa sozinho em segundo plano.
// A detecção de janela coberta do Windows fica LIGADA: com um jogo ou outro programa por cima, o Agenda para de desenhar.
app.commandLine.appendSwitch("disable-background-timer-throttling")
app.commandLine.appendSwitch("disable-features", "BackgroundVideoTrackOptimization,BackgroundVideoPauseOptimization")
if (process.env.AGENDA_SHOT) {
  app.setPath("userData", path.join(process.env.AGENDA_SHOT, "userdata"))
  app.disableHardwareAcceleration()
} else {
  // Compatibilidade: mantém as configurações e os dados das instalações do Agenda.
  // Não alterar este caminho ao trocar o nome visual/shortcut para Widgy.
  app.setPath("userData", path.join(app.getPath("appData"), "Agenda"))
}
const system = require("./system.cjs")
const modes = require("./mode.cjs")
const wallpaperEngine = require("./wallpaper-engine.cjs")
const { fetchSafeText } = require("./net-guard.cjs")
const userDir = app.getPath("userData")
const mediaDir = path.join(userDir, "media")
const toolsDir = path.join(userDir, "tools")
const dataFile = path.join(userDir, "agenda-data.json")
fs.mkdirSync(mediaDir, { recursive: true })
fs.mkdirSync(toolsDir, { recursive: true })

// Sharp carrega um addon nativo: só inicializar quando editar/importar
// imagens ou abrir o painel de upscale. Não reservar memória no boot.
let sharpInstance = null
let sharpTried = false
function getSharp() {
  if (!sharpTried) {
    sharpTried = true
    try { sharpInstance = require("sharp") }
    catch (e) { console.error("sharp indisponível:", e) }
  }
  return sharpInstance
}
function sharp(...args) {
  const module = getSharp()
  if (!module) throw new Error("Módulo de imagem indisponível")
  return module(...args)
}

protocol.registerSchemesAsPrivileged([
  { scheme: "agenda", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
])

/** @type {BrowserWindow | null} */
let win = null

function createWindow() {
  // Electron requires native transparency when creating the desktop window.
  // Only enable it when Wallpaper Engine is selected; other users retain the
  // existing opaque, low-overhead desktop.
  const externalWallpaper = modes.mode() === "desktop" && wallpaperEngine.requiresTransparency(userDir)
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    show: false,
    transparent: externalWallpaper,
    backgroundColor: externalWallpaper ? "#00000000" : "#071428",
    title: "Widgy",
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...modes.windowOptions(),
  })
  // iniciado junto com o Windows: abre direto na bandeja (perto do relógio) — no modo área de trabalho ele já fica no fundo
  const hidden = system.startHidden && !process.env.AGENDA_SHOT && modes.mode() !== "desktop"
  if (!hidden && (modes.mode() === "screen" || !modes.mode())) win.maximize()
  modes.attach(win)
  system.attachWindow(win)
  // fechar pelo X manda para a bandeja; "Sair" na bandeja encerra tudo
  win.on("closed", () => { win = null; app.quit() })
  win.once("ready-to-show", () => {
    if (!win || hidden) return
    // Não roubar foco do Wallpaper Engine: o Widgy em modo desktop é uma camada
    // de widgets, não um app em tela cheia. A ativação explícita ainda usa mode:raise.
    if (modes.mode() === "desktop" && !process.env.AGENDA_SHOT) win.showInactive()
    else win.show()
  })
  win.on("maximize", () => win && win.webContents.send("win:state", { maximized: true }))
  win.on("unmaximize", () => win && win.webContents.send("win:state", { maximized: false }))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  // modo de verificação: AGENDA_SHOT=pasta captura telas e fecha
  if (process.env.AGENDA_SHOT) {
    const dir = process.env.AGENDA_SHOT
    const steps = (process.env.AGENDA_SHOT_STEPS || "").split("|||").filter(Boolean)
    win.webContents.once("did-finish-load", async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const shot = async (name) => {
        try { await fsp.writeFile(path.join(dir, name), (await win.webContents.capturePage()).toPNG()) }
        catch (e) { console.error("shot", name, e.message) }
      }
      await wait(1500)
      await shot("0-splash.png")
      await wait(4500)
      await shot("1-desktop.png")
      let i = 2
      // "drag:x1,y1,x2,y2" simula um arrasto real do mouse
      const drag = async (x1, y1, x2, y2) => {
        const wc = win.webContents
        wc.sendInputEvent({ type: "mouseMove", x: x1, y: y1 })
        await wait(60)
        wc.sendInputEvent({ type: "mouseDown", x: x1, y: y1, button: "left", clickCount: 1 })
        for (let k = 1; k <= 12; k++) {
          await wait(25)
          wc.sendInputEvent({ type: "mouseMove", x: x1 + ((x2 - x1) * k) / 12, y: y1 + ((y2 - y1) * k) / 12, button: "left", modifiers: ["leftButtonDown"] })
        }
        await wait(60)
        wc.sendInputEvent({ type: "mouseUp", x: x2, y: y2, button: "left", clickCount: 1 })
      }
      for (const js of steps) {
        try {
          if (js.startsWith("drag:")) await drag(...js.slice(5).split(",").map(Number))
          else if (js.startsWith("size:")) {
            const [w, h] = js.slice(5).split(",").map(Number)
            win.unmaximize()
            win.setContentSize(w, h)
            win.center()
          }
          else if (js.startsWith("key:ctrl+")) {
            // "key:ctrl+v", "key:ctrl+z"…
            const k = js.slice(9).toUpperCase()
            const wc = win.webContents
            wc.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: ["control"] })
            wc.sendInputEvent({ type: "char", keyCode: k.toLowerCase(), modifiers: ["control"] })
            wc.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: ["control"] })
          }
          else if (js.startsWith("dblclick:")) {
            const [x, y] = js.slice(9).split(",").map(Number)
            const wc = win.webContents
            wc.sendInputEvent({ type: "mouseMove", x, y })
            await wait(80)
            for (const n of [1, 2]) {
              wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: n })
              await wait(40)
              wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: n })
              await wait(60)
            }
          }
          else if (js.startsWith("click:")) {
            const [x, y] = js.slice(6).split(",").map(Number)
            const wc = win.webContents
            wc.sendInputEvent({ type: "mouseMove", x, y })
            await wait(80)
            wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 })
            await wait(60)
            wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 })
          }
          else if (js.startsWith("move:")) {
            // "move:x,y" move o mouse sem clicar e captura uma sequência rápida de quadros
            const [x, y] = js.slice(5).split(",").map(Number)
            win.webContents.sendInputEvent({ type: "mouseMove", x, y })
            for (let k = 0; k < 4; k++) { await wait(120); await shot(`${i}-move-${k}.png`) }
          }
          else await win.webContents.executeJavaScript(js)
        } catch (e) { console.error(e) }
        await wait(1400)
        await shot(`${i++}-step.png`)
      }
      app.quit()
    })
  }
  if (isDev) win.loadURL("http://localhost:5173")
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"))
}

app.setName("Widgy")
// só uma cópia aberta: abrir de novo traz a janela que já está rodando (inclusive da bandeja)
if (!process.env.AGENDA_SHOT && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }
app.on("second-instance", () => system.show())
if (process.platform === "win32") app.setAppUserModelId("com.agenda.desktop")

app.whenReady().then(() => {
  protocol.handle("agenda", async (req) => {
    const u = new URL(req.url)
    if (u.host !== "media") return new Response("not found", { status: 404 })
    const name = path.basename(decodeURIComponent(u.pathname))
    // vídeo (papel de parede): responde por pedaços (Range), como um servidor de vídeo, para tocar e repetir sem travar
    const range = req.headers.get("range")
    if (range && /\.(mp4|webm|mov|m4v|ogv)$/i.test(name)) {
      const full = path.join(mediaDir, name)
      try {
        const size = (await fsp.stat(full)).size
        const m = /bytes=(\d*)-(\d*)/.exec(range) || []
        const start = m[1] ? Number(m[1]) : 0
        const end = Math.min(size - 1, m[2] ? Number(m[2]) : start + 4 * 1024 * 1024 - 1)
        const type = { ".webm": "video/webm", ".ogv": "video/ogg", ".mov": "video/quicktime" }[path.extname(name).toLowerCase()] || "video/mp4"
        const stream = require("node:stream").Readable.toWeb(fs.createReadStream(full, { start, end }))
        return new Response(stream, { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" } })
      } catch { return new Response("not found", { status: 404 }) }
    }
    const r = await net.fetch(pathToFileURL(path.join(mediaDir, name)).toString())
    const headers = new Headers(r.headers)
    headers.set("Access-Control-Allow-Origin", "*")
    return new Response(r.body, { status: r.status, headers })
  })
  createWindow()
})
app.on("window-all-closed", () => app.quit())
music.register(ipcMain, () => win, app)
require("./sports.cjs").register(ipcMain)
require("./webapps.cjs").register(ipcMain, () => win, app)
system.register(ipcMain, () => win)
modes.register(ipcMain, () => win, () => system.quit())
wallpaperEngine.register(ipcMain, () => system.quit(), userDir)
require("./media.cjs").register(ipcMain, () => win)
require("./bar.cjs").register(ipcMain, () => win)
require("./share.cjs").register(ipcMain)
require("./sysaudio.cjs").register(ipcMain, () => win)
require("./games.cjs").register(ipcMain, () => win)
require("./gamestats.cjs").register(ipcMain, () => win)
require("./sysmon.cjs").register(ipcMain, () => win)
require("./updater.cjs").register(ipcMain, () => win)
require("./finance.cjs").register(ipcMain, { onBackup: (f, n) => system.cloudCopy(f, n) })

/* ---------------- Janela ---------------- */
ipcMain.on("win:minimize", () => win && win.minimize())
ipcMain.on("win:toggleMaximize", () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()))
ipcMain.on("win:fullscreen", (_e, on) => win && win.setFullScreen(!!on))
ipcMain.on("win:close", () => win && win.close())
ipcMain.handle("app:openExternal", (_e, url) => {
  if (/^https?:/.test(url)) shell.openExternal(url)
})

/* ---------------- Persistência (salvamento automático) ----------------
 * - Toda alteração no app é enviada para cá e gravada no disco na hora.
 * - Gravação segura: escreve num arquivo temporário, força a gravação física (fsync) e só então troca.
 * - Cópias de segurança automáticas (a cada 10 min, guarda as 30 mais recentes) em userData/backups.
 * - Ao abrir: se o arquivo principal estiver corrompido, recupera da cópia mais recente que estiver boa.
 * - Ao fechar, desligar ou encerrar a sessão do Windows: grava o que estiver pendente antes de sair.
 */
const backupDir = path.join(userDir, "backups")
fs.mkdirSync(backupDir, { recursive: true })
const validData = (txt) => {
  try { const j = JSON.parse(txt); return !!j && typeof j === "object" && !!j.state } catch { return false }
}
function listBackups() {
  try { return fs.readdirSync(backupDir).filter((f) => /^agenda-.*\.json$/.test(f)).sort().reverse() } catch { return [] }
}
function loadData() {
  const candidates = [dataFile, dataFile + ".tmp", dataFile + ".exit.tmp", ...listBackups().map((f) => path.join(backupDir, f))]
  for (const f of candidates) {
    try {
      const txt = fs.readFileSync(f, "utf8")
      if (validData(txt)) {
        if (f !== dataFile) {
          console.warn("dados recuperados de", f)
          try { fs.copyFileSync(f, dataFile) } catch {}
        }
        return txt
      }
    } catch {}
  }
  return null
}
ipcMain.on("store:get", (e) => { e.returnValue = loadData() })

let pending = null
let writing = false
let lastBackup = 0
async function writeSafe(data) {
  const tmp = dataFile + ".tmp"
  const fh = await fsp.open(tmp, "w")
  try { await fh.writeFile(data, "utf8"); await fh.sync() } finally { await fh.close() }
  // o Windows (antivírus/indexador) às vezes segura o arquivo por um instante: tenta de novo
  for (let i = 0; ; i++) {
    try { await fsp.rename(tmp, dataFile); return } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 60 * (i + 1)))
    }
  }
}
async function backup(data) {
  if (Date.now() - lastBackup < 10 * 60 * 1000) return
  lastBackup = Date.now()
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)
  await fsp.writeFile(path.join(backupDir, `agenda-${stamp}.json`), data, "utf8")
  system.cloudCopy(dataFile, "agenda-data.json")
  for (const old of listBackups().slice(30)) fsp.unlink(path.join(backupDir, old)).catch(() => {})
}
async function flush() {
  if (writing || pending == null) return
  writing = true
  const data = pending
  pending = null
  try {
    await writeSafe(data)
    await backup(data)
  } catch (err) {
    console.error("falha ao salvar", err)
    if (pending == null) pending = data // tenta de novo na próxima
  }
  writing = false
  if (pending != null) setTimeout(flush, 200)
}
ipcMain.on("store:set", (_e, data) => {
  if (typeof data !== "string" || !validData(data)) return // nunca grava dados inválidos por cima dos bons
  pending = data
  flush()
})
// Aguarda a gravação real antes de reiniciar para aplicar transparência.
ipcMain.handle("store:drain", async () => {
  const deadline = Date.now() + 10000
  while ((writing || pending != null) && Date.now() < deadline) {
    if (!writing && pending != null) await flush()
    else await new Promise((resolve) => setTimeout(resolve, 40))
  }
  return !writing && pending == null
})
function flushSync() {
  if (pending == null) return
  try {
    // arquivo temporário próprio: não briga com uma gravação normal que esteja em andamento
    const tmp = dataFile + ".exit.tmp"
    fs.writeFileSync(tmp, pending, "utf8")
    try { fs.renameSync(tmp, dataFile) } catch { fs.copyFileSync(tmp, dataFile); try { fs.unlinkSync(tmp) } catch {} }
    pending = null
  } catch (err) { console.error("falha ao salvar ao sair", err) }
}
app.on("before-quit", flushSync)
app.on("will-quit", flushSync)
// desligar/reiniciar/sair da conta no Windows
app.on("session-end", flushSync)
process.on("exit", flushSync)
ipcMain.on("store:flushSync", (e) => { flushSync(); e.returnValue = true })

/* ---------------- Mídia ---------------- */
const IMG_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "tif", "tiff"]

async function describe(file, name) {
  let width = 0
  let height = 0
  let animated = false
  if (getSharp()) {
    try {
      const m = await sharp(path.join(mediaDir, file)).metadata()
      const rotated = (m.orientation || 1) >= 5
      width = rotated ? m.height : m.width
      height = rotated ? m.width : m.height
      animated = (m.pages || 1) > 1
      if (animated && m.pageHeight) height = m.pageHeight
    } catch {}
  }
  return { file, name, width, height, animated }
}

const prefsFile = path.join(userDir, "prefs.json")
function prefs() { try { return JSON.parse(fs.readFileSync(prefsFile, "utf8")) } catch { return {} } }
function savePrefs(p) { try { fs.writeFileSync(prefsFile, JSON.stringify({ ...prefs(), ...p })) } catch {} }

async function importPaths(paths) {
  const out = []
  for (const src of paths) {
    const ext = path.extname(src).toLowerCase()
    if (!IMG_EXT.includes(ext.slice(1))) continue
    const file = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${ext}`
    await fsp.copyFile(src, path.join(mediaDir, file))
    out.push(await describe(file, path.basename(src, ext)))
  }
  return out
}

ipcMain.handle("media:import", async () => {
  const last = prefs().lastImportDir
  const r = await dialog.showOpenDialog(win, {
    title: "Adicionar imagens",
    defaultPath: last && fs.existsSync(last) ? last : app.getPath("pictures"),
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Imagens", extensions: IMG_EXT }],
  })
  if (r.canceled || !r.filePaths.length) return []
  savePrefs({ lastImportDir: path.dirname(r.filePaths[0]) })
  return importPaths(r.filePaths)
})

/** papel de parede animado: escolhe um vídeo ou GIF, copia para a pasta do app e devolve o nome */
const WALL_EXT = ["mp4", "webm", "mov", "m4v", "gif"]
ipcMain.handle("media:wallAnim", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Papel de parede animado (vídeo ou GIF)",
    defaultPath: prefs().lastImportDir || app.getPath("videos"),
    properties: ["openFile"],
    filters: [{ name: "Vídeos e GIFs", extensions: WALL_EXT }],
  })
  if (r.canceled || !r.filePaths.length) return null
  const src = r.filePaths[0]
  savePrefs({ lastImportDir: path.dirname(src) })
  const ext = path.extname(src).toLowerCase()
  const file = `fundo-${Date.now().toString(36)}${ext}`
  await fsp.copyFile(src, path.join(mediaDir, file))
  return { file, name: path.basename(src) }
})

/** anexos (imagens, PDF, documentos): copia para a pasta do app e devolve os nomes */
ipcMain.handle("media:attach", async (_e, kind) => {
  const filters = kind === "images" ? [{ name: "Imagens", extensions: IMG_EXT }] : [{ name: "Imagens e documentos", extensions: [...IMG_EXT, "pdf", "txt", "doc", "docx"] }]
  const r = await dialog.showOpenDialog(win, { title: "Anexar arquivos", defaultPath: prefs().lastImportDir || app.getPath("documents"), properties: ["openFile", "multiSelections"], filters })
  if (r.canceled || !r.filePaths.length) return []
  savePrefs({ lastImportDir: path.dirname(r.filePaths[0]) })
  const out = []
  for (const src of r.filePaths) {
    const ext = path.extname(src).toLowerCase()
    const file = `anexo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${ext}`
    await fsp.copyFile(src, path.join(mediaDir, file))
    out.push({ file, name: path.basename(src), image: IMG_EXT.includes(ext.slice(1)) })
  }
  return out
})

/** arquivos arrastados para dentro do app */
ipcMain.handle("media:importPaths", async (_e, paths) => importPaths((paths || []).filter((p) => typeof p === "string" && fs.existsSync(p))))

/**
 * colar: arquivos copiados no Explorer (um ou vários) ou imagem copiada (print, navegador...).
 * No Electron 45 a área de transferência é assíncrona: read() devolve itens com types/getType().
 */
ipcMain.handle("media:paste", async () => {
  const items = await clipboard.read()
  const bytes = async (it, t) => {
    const v = await it.getType(t)
    return v && v.arrayBuffer ? Buffer.from(await v.arrayBuffer()) : Buffer.from(String(v ?? ""))
  }
  for (const it of items) {
    const types = it.types || []
    if (types.includes("text/uri-list")) {
      const paths = (await bytes(it, "text/uri-list")).toString("utf8").split(/\r?\n/).map((l) => l.trim())
        .filter((l) => l.startsWith("file:")).map((l) => { try { return fileURLToPath(l) } catch { return null } })
        .filter((p) => p && fs.existsSync(p))
      const r = await importPaths(paths)
      if (r.length) return r
    }
    const img = types.find((t) => /^image\/(png|jpeg|webp|gif|bmp)$/.test(t))
    if (img) {
      const buf = await bytes(it, img)
      if (buf.length) {
        const ext = img === "image/jpeg" ? "jpg" : img.split("/")[1]
        const file = `${Date.now().toString(36)}-colada.${ext}`
        await fsp.writeFile(path.join(mediaDir, file), buf)
        return [await describe(file, "Imagem colada " + new Date().toLocaleString("pt-BR"))]
      }
    }
  }
  return []
})

/** editor: girar, espelhar, recortar e ajustar cor, em qualidade total */
ipcMain.handle("media:edit", async (_e, file, ops) => {
  if (!getSharp()) throw new Error("Módulo de imagem indisponível")
  const src = path.join(mediaDir, path.basename(file))
  const meta0 = await sharp(src).metadata()
  if ((meta0.pages || 1) > 1) throw new Error("GIFs animados não podem ser editados")
  let buf = await sharp(src).rotate().toBuffer() // aplica a orientação EXIF
  let img = sharp(buf)
  if (ops.rotate) img = img.rotate(ops.rotate)
  if (ops.flipH) img = img.flop()
  if (ops.flipV) img = img.flip()
  buf = await img.toBuffer()
  const m = await sharp(buf).metadata()
  img = sharp(buf)
  if (ops.crop) {
    const left = Math.max(0, Math.round(ops.crop.x * m.width))
    const top = Math.max(0, Math.round(ops.crop.y * m.height))
    const width = Math.max(1, Math.min(m.width - left, Math.round(ops.crop.w * m.width)))
    const height = Math.max(1, Math.min(m.height - top, Math.round(ops.crop.h * m.height)))
    img = img.extract({ left, top, width, height })
  }
  const b = ops.brightness ?? 1, sat = ops.saturation ?? 1, c = ops.contrast ?? 1, wr = ops.warmth ?? 0
  if (b !== 1 || sat !== 1) img = img.modulate({ brightness: b, saturation: sat })
  if (c !== 1 || wr !== 0) {
    const k = 0.1 * wr
    img = img.linear([c * (1 + k), c, c * (1 - k)], [128 - 128 * c, 128 - 128 * c, 128 - 128 * c])
  }
  if (ops.sharpen > 0) img = img.sharpen({ sigma: 0.6 + ops.sharpen * 0.6, m1: 0.5, m2: 1 + ops.sharpen * 1.5 })
  const png = meta0.format === "png" && meta0.hasAlpha
  const base = path.basename(file).replace(/\.[^.]+$/, "").replace(/-ed[a-z0-9]+$/, "")
  const outFile = `${base}-ed${Date.now().toString(36)}.${png ? "png" : "jpg"}`
  await (png ? img.png() : img.jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" })).toFile(path.join(mediaDir, outFile))
  return await describe(outFile, outFile)
})

// salva uma imagem gerada no app (data URL PNG) na pasta de mídia
ipcMain.handle("media:saveDataUrl", async (_e, dataUrl, base) => {
  const m = String(dataUrl).match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)
  if (!m) throw new Error("Imagem inválida")
  const file = `${String(base || "img").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "img"}-${Date.now().toString(36)}.${m[1] === "jpeg" ? "jpg" : m[1]}`
  await fsp.writeFile(path.join(mediaDir, file), Buffer.from(m[2], "base64"))
  return file
})

// abre um arquivo da pasta de mídia no programa padrão do Windows (PDF, imagem…)
ipcMain.handle("media:open", async (_e, file) => {
  const p = path.join(mediaDir, path.basename(String(file)))
  if (fs.existsSync(p)) await shell.openPath(p)
})

ipcMain.handle("media:delete", async (_e, file) => {
  try {
    await fsp.unlink(path.join(mediaDir, path.basename(file)))
  } catch {}
})

ipcMain.handle("media:export", async (_e, file, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: suggested || file,
  })
  if (r.canceled || !r.filePath) return false
  await fsp.copyFile(path.join(mediaDir, path.basename(file)), r.filePath)
  return true
})

/* ------- Upscale (Real-ESRGAN se instalado; senão Lanczos3 + nitidez) ------- */
function findExe(dir, name = "realesrgan-ncnn-vulkan.exe", depth = 0) {
  if (depth > 3) return null
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name) return path.join(dir, e.name)
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const f = findExe(path.join(dir, e.name), name, depth + 1)
      if (f) return f
    }
  }
  return null
}

ipcMain.handle("ai:status", () => ({ installed: !!findExe(toolsDir), sharp: !!getSharp() }))

const ESRGAN_URL =
  "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"

ipcMain.handle("ai:install", async () => {
  const zip = path.join(toolsDir, "realesrgan.zip")
  const res = await net.fetch(ESRGAN_URL)
  if (!res.ok) throw new Error(`Download falhou (${res.status})`)
  const total = Number(res.headers.get("content-length")) || 0
  const reader = res.body.getReader()
  const chunks = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    got += value.length
    if (total && win) win.webContents.send("ai:progress", Math.round((got / total) * 100))
  }
  await fsp.writeFile(zip, Buffer.concat(chunks))
  const dest = path.join(toolsDir, "realesrgan")
  await fsp.mkdir(dest, { recursive: true })
  await new Promise((resolve, reject) =>
    execFile("tar", ["-xf", zip, "-C", dest], (err) => (err ? reject(err) : resolve()))
  )
  await fsp.unlink(zip).catch(() => {})
  return !!findExe(toolsDir)
})

function runESRGAN(exe, input, output, model, onPct) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ["-i", input, "-o", output, "-n", model, "-s", "4", "-f", "png"], {
      cwd: path.dirname(exe),
      windowsHide: true,
    })
    const onData = (d) => {
      // o Real-ESRGAN usa o separador decimal do Windows (pt-BR: "90,00%")
      const m = String(d).match(/(\d+(?:[.,]\d+)?)%/g)
      if (m) onPct(parseFloat(m[m.length - 1].replace(",", ".")))
    }
    p.stderr.on("data", onData)
    p.stdout.on("data", onData)
    p.on("error", reject)
    p.on("close", (code) => (code === 0 && fs.existsSync(output) ? resolve() : reject(new Error("ESRGAN code " + code))))
  })
}

/** maior lado útil das telas conectadas (já considerando a escala do Windows) */
function screenLong() {
  try {
    return Math.max(...screen.getAllDisplays().map((d) => Math.max(d.size.width, d.size.height) * (d.scaleFactor || 1)))
  } catch {
    return 1920
  }
}
ipcMain.handle("app:screenInfo", () => ({ long: screenLong() }))

/**
 * opts: { model: "photo" | "art", enhance: 0..2 }   target 0 = ideal para a tela (2x o lado maior)
 */
ipcMain.handle("media:upscale", async (_e, file, target = 7680, preferAI = true, opts = {}) => {
  if (!getSharp()) throw new Error("Módulo de imagem indisponível")
  const pre = await sharp(path.join(mediaDir, path.basename(file))).metadata()
  if ((pre.pages || 1) > 1) throw new Error("Imagens animadas (GIF) não podem ser ampliadas sem perder a animação")
  if (!target) target = Math.min(7680, Math.max(2560, Math.round(screenLong() * 2)))
  const enhance = Math.max(0, Math.min(2, Number(opts.enhance) || 0))
  const model = opts.model === "art" ? "realesrgan-x4plus-anime" : "realesrgan-x4plus"
  const send = (pct, stage) => win && win.webContents.send("upscale:progress", { file, pct, stage })
  const src = path.join(mediaDir, path.basename(file))
  const tmpBase = path.join(os.tmpdir(), `agenda-${Date.now()}`)
  const norm = tmpBase + "-in.png"
  await sharp(src).rotate().png().toFile(norm)
  const meta = await sharp(norm).metadata()
  const long = Math.max(meta.width, meta.height)
  let input = norm
  let usedAI = false
  const exe = findExe(toolsDir)
  if (preferAI && exe && long <= 3000) {
    send(2, "IA reconstruindo detalhes")
    const aiOut = tmpBase + "-ai.png"
    try {
      await runESRGAN(exe, norm, aiOut, model, (p) => send(Math.max(2, Math.min(85, p * 0.85)), "IA reconstruindo detalhes"))
      input = aiOut
      usedAI = true
    } catch (err) {
      console.error(err)
    }
  }
  const label = target >= 7680 ? "8K" : target >= 3840 ? "4K" : `${target}px`
  send(88, enhance ? "Realçando detalhes" : "Ajustando para " + label)
  const landscape = meta.width >= meta.height
  let pipe = sharp(input, { limitInputPixels: false }).resize({
    width: landscape ? target : undefined,
    height: landscape ? undefined : target,
    kernel: "lanczos3",
  })
  if (enhance > 0) {
    // contraste local (CLAHE) + um pouco de vida na cor + nitidez fina
    const tile = Math.max(64, Math.round(target / 24))
    pipe = pipe.clahe({ width: tile, height: tile, maxSlope: Math.max(1, Math.round(1 + enhance * 1.2)) }).modulate({ saturation: 1 + 0.06 * enhance })
    pipe = pipe.sharpen({ sigma: 0.7 + 0.3 * enhance, m1: 0.6, m2: 1.5 + enhance })
  } else {
    pipe = pipe.sharpen(usedAI ? { sigma: 0.5, m1: 0.3, m2: 1 } : { sigma: 1.1, m1: 0.7, m2: 2.6, x1: 2 })
  }
  const tag = target >= 7680 ? "8k" : target >= 3840 ? "4k" : "hd"
  const outFile = path.basename(file).replace(/\.[^.]+$/, "") + `-${tag}-${Date.now().toString(36)}.jpg`
  await pipe.jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(path.join(mediaDir, outFile))
  for (const t of [norm, tmpBase + "-ai.png"]) fsp.unlink(t).catch(() => {})
  send(100, "Pronto")
  const d = await describe(outFile, outFile)
  return { ...d, usedAI, tag }
})

/* ------- Salvar animação gerada no app (imagem viva) como GIF ------- */
ipcMain.handle("media:saveAnimation", async (_e, { width, height, frames, delay, name, loopName }) => {
  if (!getSharp()) throw new Error("Módulo de imagem indisponível")
  const buf = Buffer.from(frames.buffer, frames.byteOffset, frames.byteLength)
  const n = Math.round(buf.length / (width * height * 4))
  const file = `${Date.now().toString(36)}-${(loopName || "viva").replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "viva"}.gif`
  await sharp(buf, { raw: { width, height: height * n, channels: 4, pageHeight: height } })
    .gif({ loop: 0, delay: Array(n).fill(delay), effort: 8, dither: 0.9, interFrameMaxError: 3, colours: 256 })
    .toFile(path.join(mediaDir, file))
  return await describe(file, name || file)
})

/* ---------------- Notícias (RSS sem CORS) ---------------- */
ipcMain.handle("net:text", async (_e, url) => fetchSafeText(net.fetch.bind(net), url))
