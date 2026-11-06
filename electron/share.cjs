// Compartilhar tela: lista telas/janelas (com miniatura) e entrega a escolhida para o getDisplayMedia da página.
const { desktopCapturer, session } = require("electron")

let picked = ""

function register(ipcMain) {
  ipcMain.handle("share:sources", async () => {
    const list = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true })
    return list
      .filter((s) => s.name && !/^Agenda — (barra|menu)$/.test(s.name))
      .map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:"), thumb: s.thumbnail.isEmpty() ? "" : s.thumbnail.toDataURL(), icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : "" }))
  })
  ipcMain.handle("share:pick", (_e, id) => { picked = String(id || "") })
  const install = () => session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const all = await desktopCapturer.getSources({ types: ["screen", "window"] })
      const s = all.find((x) => x.id === picked) || all.find((x) => x.id.startsWith("screen:"))
      cb(s ? { video: s } : {})
    } catch { cb({}) }
  })
  const { app } = require("electron")
  app.whenReady().then(install)
}

module.exports = { register }
