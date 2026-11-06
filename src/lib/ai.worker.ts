/**
 * IA local fora da tela: o recorte (RMBG-1.4) e o reconhecimento de estilo (CLIP) rodam aqui,
 * num worker, para o app não travar enquanto o modelo pensa.
 */
/// <reference lib="webworker" />
import { AutoModel, AutoProcessor, RawImage, env, pipeline } from "@huggingface/transformers"

type Msg =
  | { id: number; type: "segment"; rgba: ArrayBuffer; w: number; h: number; ort: string }
  | { id: number; type: "clip"; rgba: ArrayBuffer; w: number; h: number; ort: string; sets: string[][] }

const post = (m: any, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer)

let seg: Promise<{ model: any; processor: any }> | null = null
let clf: Promise<any> | null = null

function setup(ort: string) {
  env.allowLocalModels = false
  const wasm = (env.backends as any).onnx.wasm
  wasm.wasmPaths = ort
  wasm.numThreads = 1
}

const progressOf = (id: number, from: number, span: number, msg: string) => {
  const files = new Map<string, number>()
  return (p: any) => {
    if (p.status !== "progress" || !p.file) return
    files.set(p.file, p.progress ?? 0)
    const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
    post({ id, progress: { pct: from + (avg / 100) * span, msg } })
  }
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data
  try {
    setup(m.ort)
    const image = new RawImage(new Uint8ClampedArray(m.rgba), m.w, m.h, 4).rgb()
    if (m.type === "segment") {
      post({ id: m.id, progress: { pct: 0, msg: "Preparando o modelo de recorte…" } })
      seg ??= (async () => ({
        model: await AutoModel.from_pretrained("briaai/RMBG-1.4", { config: { model_type: "custom" } as any, progress_callback: progressOf(m.id, 0, 80, "Baixando o modelo (só na primeira vez)…") }),
        processor: await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
          config: {
            do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
            image_mean: [0.5, 0.5, 0.5], feature_extractor_type: "ImageFeatureExtractor", image_std: [1, 1, 1],
            resample: 2, rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 },
          } as any,
        }),
      }))()
      const { model, processor } = await seg.catch((err) => { seg = null; throw err })
      post({ id: m.id, progress: { pct: 82, msg: "Encontrando o assunto da foto…" } })
      const { pixel_values } = await processor(image)
      const { output } = await model({ input: pixel_values })
      const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(m.w, m.h)
      post({ id: m.id, progress: { pct: 94, msg: "Recortando…" } })
      // foto original + máscara como transparência (corta o meio-termo para a borda ficar limpa)
      const px = new Uint8ClampedArray(m.rgba)
      for (let i = 0; i < mask.data.length; i++) {
        const a = mask.data[i]
        px[4 * i + 3] = a < 40 ? 0 : a > 215 ? 255 : Math.round(((a - 40) / 175) * 255)
      }
      const cv = new OffscreenCanvas(m.w, m.h)
      cv.getContext("2d")!.putImageData(new ImageData(px, m.w, m.h), 0, 0)
      const blob = await cv.convertToBlob({ type: "image/png" })
      post({ id: m.id, result: new FileReaderSync().readAsDataURL(blob) })
    } else {
      clf ??= pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
        dtype: "q8",
        progress_callback: progressOf(m.id, 0, 100, "Baixando o modelo de estilo (só na primeira vez)…"),
      } as any)
      const c = await clf.catch((err) => { clf = null; throw err })
      const out: { label: string; score: number }[][] = []
      for (const labels of m.sets) out.push(await c(image, labels, { hypothesis_template: "{}" }))
      post({ id: m.id, result: out })
    }
  } catch (err: any) {
    post({ id: m.id, error: String(err?.message ?? err) })
  }
}
