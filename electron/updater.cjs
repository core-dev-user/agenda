// Atualização automática: procura uma versão nova nas Releases do GitHub (core-dev-user/agenda),
// baixa em segundo plano e instala ao fechar o Widgy (ou na hora, se a pessoa pedir).
// Só funciona no app instalado (Widgy-Setup-x.y.z.exe); rodando pelo código, fica desligado.
const { app } = require("electron")

let state = { status: "idle", version: "", percent: 0, error: "", current: app.getVersion(), enabled: false }
let updater = null
let getWin = () => null

function send() {
  const w = getWin()
  if (w && !w.isDestroyed()) w.webContents.send("update:state", state)
}
function set(p) { state = { ...state, ...p }; send() }

async function check() {
  if (!updater) return state
  try {
    set({ status: "checking", error: "" })
    await updater.checkForUpdates()
  } catch (e) {
    set({ status: "error", error: String((e && e.message) || e).split("\n")[0] })
  }
  return state
}

function register(ipcMain, win) {
  getWin = win
  ipcMain.handle("update:get", () => state)
  ipcMain.handle("update:check", () => check())
  ipcMain.handle("update:install", () => {
    if (state.status !== "ready" || !updater) return false
    // fecha de verdade (sem ir para a bandeja) e abre a versão nova depois de instalar
    setImmediate(() => updater.quitAndInstall(true, true))
    return true
  })

  if (!app.isPackaged) return
  try {
    updater = require("electron-updater").autoUpdater
  } catch (e) {
    console.error("updater:", e)
    return
  }
  state.enabled = true
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = false
  updater.on("checking-for-update", () => set({ status: "checking" }))
  updater.on("update-available", (i) => set({ status: "downloading", version: i.version, percent: 0 }))
  updater.on("update-not-available", () => set({ status: "none" }))
  updater.on("download-progress", (p) => set({ status: "downloading", percent: Math.round(p.percent || 0) }))
  updater.on("update-downloaded", (i) => set({ status: "ready", version: i.version, percent: 100 }))
  updater.on("error", (e) => set({ status: "error", error: String((e && e.message) || e).split("\n")[0] }))

  // primeira olhada 15 s depois de abrir; depois a cada 3 horas
  setTimeout(check, 15_000)
  setInterval(check, 3 * 3600_000)
}

module.exports = { register }
