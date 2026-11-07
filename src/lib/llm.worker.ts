/**
 * IA de texto local (Qwen 2.5 Instruct, ONNX) rodando no PC — placa de vídeo (WebGPU) quando tem, senão processador.
 * Só entende o pedido e escolhe as ações; quem executa é o app.
 */
/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers"

type Msg = { id: number; type: "chat"; ort: string; model: string; messages: { role: string; content: string }[]; maxTokens: number } | { id: number; type: "load"; ort: string; model: string }

const post = (m: any) => (self as any).postMessage(m)
let gen: Promise<any> | null = null
let loaded = ""
let device = ""

async function pickDevice() {
  try {
    const gpu = (navigator as any).gpu
    const ad = gpu && (await gpu.requestAdapter())
    if (ad) return { device: "webgpu", dtype: ad.features.has("shader-f16") ? "q4f16" : "q4" }
  } catch {}
  return { device: "wasm", dtype: "q4" }
}

function load(id: number, ort: string, model: string) {
  if (gen && loaded === model) return gen
  env.allowLocalModels = false
  const wasm = (env.backends as any).onnx.wasm
  wasm.wasmPaths = ort
  wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
  loaded = model
  const files = new Map<string, number>()
  gen = pickDevice().then(async (d) => {
    device = d.device
    const p = await pipeline("text-generation", model, {
      device: d.device as any,
      dtype: d.dtype as any,
      progress_callback: (p: any) => {
        if (p.status !== "progress" || !p.file) return
        files.set(p.file, p.progress ?? 0)
        const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
        post({ id, progress: { pct: avg, msg: "Baixando a IA (só na primeira vez)…" } })
      },
    })
    return p
  })
  gen.catch(() => { gen = null; loaded = "" })
  return gen
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data
  try {
    const g = await load(m.id, m.ort, m.model)
    if (m.type === "load") return post({ id: m.id, result: { device } })
    post({ id: m.id, progress: { pct: 100, msg: "Pensando…" } })
    const out = await g(m.messages, { max_new_tokens: m.maxTokens, do_sample: false, return_full_text: false })
    const text = out?.[0]?.generated_text
    post({ id: m.id, result: { text: typeof text === "string" ? text : Array.isArray(text) ? text.at(-1)?.content ?? "" : "", device } })
  } catch (err: any) {
    post({ id: m.id, error: String(err?.message || err) })
  }
}
