// Roda dentro da janela do YouTube Music: transmite os quadros do clipe para o Agenda.
const { ipcRenderer } = require("electron")

let timer = null
let maxW = 640
let busy = false
let lastT = -1
let canvas = null

function tick() {
  if (busy) return
  const v = document.querySelector("video")
  if (!v || v.readyState < 2 || !v.videoWidth) return
  // pausado: manda só quando o quadro muda (ex.: depois de pular um trecho)
  if (v.paused && v.currentTime === lastT) return
  lastT = v.currentTime
  busy = true
  try {
    const k = Math.min(1, maxW / v.videoWidth)
    const w = Math.max(2, Math.round(v.videoWidth * k))
    const h = Math.max(2, Math.round(v.videoHeight * k))
    if (!canvas) canvas = document.createElement("canvas")
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const ctx = canvas.getContext("2d", { alpha: false })
    ctx.drawImage(v, 0, 0, w, h)
    // toDataURL é síncrono: numa janela escondida o convertToBlob esperaria um quadro que nunca vem
    ipcRenderer.send("music:frame", { url: canvas.toDataURL("image/jpeg", 0.78), w, h })
  } catch {
    /* quadro protegido ou ainda carregando */
  }
  busy = false
}

ipcRenderer.on("music:video", (_e, opts) => {
  clearInterval(timer)
  timer = null
  if (opts && opts.on) {
    maxW = Math.max(160, Math.min(1280, opts.width || 640))
    lastT = -1
    timer = setInterval(tick, 1000 / 24)
  }
})
