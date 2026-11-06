/**
 * Separa o "assunto" (pessoa, objeto, paisagem em primeiro plano) do fundo de uma imagem,
 * para o relógio do papel de parede ficar ATRÁS dele, como na tela de bloqueio do iPhone.
 * Usa o modelo RMBG-1.4 rodando no próprio PC (Transformers.js). Na primeira vez baixa ~45 MB.
 */
export async function segmentSubject(url: string, onProgress?: (pct: number, msg: string) => void): Promise<string> {
  onProgress?.(0, "Preparando o modelo de recorte…")
  const { AutoModel, AutoProcessor, RawImage, env } = await import("@huggingface/transformers")
  env.allowLocalModels = false
  // o motor (ONNX/WebAssembly) vem junto com o app — buscar de um CDN não funciona em app local
  const wasm = (env.backends as any).onnx.wasm
  wasm.wasmPaths = new URL("ort/", location.href).href
  wasm.numThreads = 1
  const files = new Map<string, number>()
  const progress_callback = (p: any) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, p.progress ?? 0)
      const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
      onProgress?.(Math.round(avg * 0.8), "Baixando o modelo (só na primeira vez)…")
    }
  }
  const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", { config: { model_type: "custom" } as any, progress_callback })
  const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
    config: {
      do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
      image_mean: [0.5, 0.5, 0.5], feature_extractor_type: "ImageFeatureExtractor", image_std: [1, 1, 1],
      resample: 2, rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 },
    } as any,
  })
  onProgress?.(82, "Encontrando o assunto da foto…")
  const image = await RawImage.fromURL(url)
  const { pixel_values } = await processor(image)
  const { output } = await model({ input: pixel_values })
  const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(image.width, image.height)
  onProgress?.(94, "Recortando…")

  // imagem original + máscara como transparência
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(image.toCanvas(), 0, 0)
  const px = ctx.getImageData(0, 0, image.width, image.height)
  for (let i = 0; i < mask.data.length; i++) {
    // corta o "meio-termo" para a borda ficar limpa, sem halo
    const a = mask.data[i]
    px.data[4 * i + 3] = a < 40 ? 0 : a > 215 ? 255 : Math.round(((a - 40) / 175) * 255)
  }
  ctx.putImageData(px, 0, 0)
  onProgress?.(100, "Pronto")
  return canvas.toDataURL("image/png")
}
