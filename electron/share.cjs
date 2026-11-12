// Compartilhar tela: lista telas/janelas (com miniatura) e entrega a escolhida para o getDisplayMedia da página.
const { desktopCapturer, session } = require("electron")

// A escolha vale para UMA captura e expira em 30 s. Sem escolha válida, nada é capturado.
// (Antes, sem escolha, a tela inteira era entregue a qualquer pedido; e uma escolha antiga valia para sempre.)
const PICK_TTL_MS = 30000
function createPicker(now = () => Date.now()) {
  let picked = "", at = 0
  return {
    pick(id) { picked = typeof id === "string" && /^(screen|window):[\w:.-]+$/.test(id) ? id : ""; at = now() },
    /** devolve a fonte escolhida e a consome; null se não houver escolha recente */
    take(sources) {
      const id = picked, fresh = now() - at <= PICK_TTL_MS
      picked = ""; at = 0
      if (!id || !fresh) return null
      return (Array.isArray(sources) ? sources : []).find((x) => x && x.id === id) || null
    },
  }
}

function register(ipcMain, getWin = () => null) {
  const picker = createPicker()
  const fromMain = (e) => { const w = getWin(); return !w || w.isDestroyed() || e.sender === w.webContents }
  ipcMain.handle("share:sources", async (e) => {
    if (!fromMain(e)) return []
    const list = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true })
    return list
      .filter((s) => s.name && !/^(Agenda|Widgy) — (barra|menu|fundo)$/.test(s.name))
      .map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:"), thumb: s.thumbnail.isEmpty() ? "" : s.thumbnail.toDataURL(), icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : "" }))
  })
  ipcMain.handle("share:pick", (e, id) => { if (fromMain(e)) picker.pick(id) })
  const install = () => session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      // só a janela principal do Widgy pode pedir captura (não a barra, menus ou prévias)
      const w = getWin()
      if (w && !w.isDestroyed() && req.frame && w.webContents.mainFrame !== req.frame) return cb({})
      const all = await desktopCapturer.getSources({ types: ["screen", "window"] })
      const s = picker.take(all)
      cb(s ? { video: s } : {})
    } catch { cb({}) }
  })
  const { app } = require("electron")
  app.whenReady().then(install)
}

module.exports = { register, createPicker }
