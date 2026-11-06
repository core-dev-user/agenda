/**
 * Ponte para o worker de IA (recorte e estilo). O worker sobe só quando precisa
 * e é desligado depois de um tempo sem uso, devolvendo a memória dos modelos.
 */
import AiWorker from "./ai.worker.ts?worker&inline"

type Progress = (pct: number, msg: string) => void
let worker: Worker | null = null
let seq = 0
let idle: ReturnType<typeof setTimeout> | undefined
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void; prog?: Progress }>()

function get() {
  clearTimeout(idle)
  if (worker) return worker
  worker = new AiWorker()
  worker.onmessage = (e) => {
    const { id, progress, result, error } = e.data
    const p = pending.get(id)
    if (!p) return
    if (progress) return p.prog?.(progress.pct, progress.msg)
    pending.delete(id)
    if (error) p.rej(new Error(error))
    else p.res(result)
    if (!pending.size) idle = setTimeout(stop, 45_000)
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.rej(new Error(e.message || "a IA parou"))
    pending.clear()
    stop()
  }
  return worker
}
function stop() {
  worker?.terminate()
  worker = null
}

/** abre a imagem e devolve os pixels (reduzida para caber em maxSide, se pedido) */
export async function readPixels(url: string, maxSide = 0) {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.decoding = "async"
  img.src = url
  await img.decode()
  const k = maxSide ? Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)) : 1
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
  const cv = new OffscreenCanvas(w, h)
  const ctx = cv.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return { rgba: ctx.getImageData(0, 0, w, h).data.buffer as ArrayBuffer, w, h }
}

function call<T>(msg: Record<string, any>, transfer: Transferable[], prog?: Progress): Promise<T> {
  const id = ++seq
  return new Promise<T>((res, rej) => {
    pending.set(id, { res, rej, prog })
    get().postMessage({ ...msg, id, ort: new URL("ort/", location.href).href }, transfer)
  })
}

/** recorte do assunto: PNG (data URL) com o fundo transparente */
export async function aiSegment(url: string, prog?: Progress): Promise<string> {
  const px = await readPixels(url, 4096)
  return call<string>({ type: "segment", ...px }, [px.rgba], prog)
}

/** CLIP zero-shot: uma lista de rótulos por conjunto, cada uma ordenada pela nota */
export async function aiClip(url: string, sets: string[][], prog?: Progress): Promise<{ label: string; score: number }[][]> {
  const px = await readPixels(url, 640)
  return call({ type: "clip", sets, ...px }, [px.rgba], prog)
}
