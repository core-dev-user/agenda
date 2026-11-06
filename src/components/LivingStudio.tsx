import { useEffect, useRef, useState } from "react"
import { Dices, LayoutGrid, Monitor, Sparkles, Wand2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, friendlyError, mediaUrl } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { analyze, fitSize, loadImage, rasterize, renderFrames, suggest, type Analysis, type ElementId } from "@/lib/living"
import { cn } from "@/lib/utils"
import { Modal, Segmented, Slider, Switch, ThemedButton } from "./ui/controls"

const ELEMENTS: { id: ElementId; label: string; desc: string; cov?: keyof Analysis["coverage"] }[] = [
  { id: "depth", label: "Profundidade 3D", desc: "A câmera orbita devagar: o que está perto se move mais que o fundo" },
  { id: "person", label: "Pessoa", desc: "Respiração lenta e leve balanço do corpo", cov: "person" },
  { id: "foliage", label: "Folhas e plantas", desc: "Vento em rajadas atravessando a copa e folhas tremulando", cov: "foliage" },
  { id: "leaves", label: "Folhas voando", desc: "Folhas com as cores da própria foto se soltando", cov: "foliage" },
  { id: "petals", label: "Pétalas caindo", desc: "Para flores, cerejeiras e sakura", cov: "flowers" },
  { id: "sky", label: "Céu", desc: "As nuvens andam pelo céu continuamente", cov: "sky" },
  { id: "water", label: "Água", desc: "A água corre, ondula e cintila", cov: "water" },
  { id: "light", label: "Luz ambiente", desc: "A luz da cena pulsa suavemente" },
  { id: "snow", label: "Neve", desc: "Flocos caindo pela cena" },
  { id: "sparkles", label: "Brilhos", desc: "Pequenas estrelas cintilando" },
]

const PREVIEW = 520

/** Cor das partículas: "da foto" ou uma cor escolhida (com prontas). */
function ParticleColor({ value, onChange, presets }: { value: string; onChange: (v: string) => void; presets: string[][] }) {
  return (
    <div className="mt-1 space-y-1.5">
      <div className="text-xs text-fg-muted">Cor</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={cn("rounded-full border px-2 py-0.5 text-[11px]", !value ? "border-transparent bg-brand text-white" : "border-line text-fg-muted")} onClick={() => onChange("")}>Da foto</button>
        {presets.map(([label, c]) => (
          <button key={c} title={label} onClick={() => onChange(c)} className={cn("h-5 w-5 rounded-full transition-transform hover:scale-110", value === c && "ring-2 ring-white ring-offset-1 ring-offset-transparent")} style={{ background: c, boxShadow: "0 1px 3px rgb(0 0 0 / .4)" }} />
        ))}
        <label className="clickable relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-line" title="Outra cor" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
          <input type="color" value={value || "#e0742a"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  )
}

export function LivingStudio({ m, onClose, onCreated }: { m: MediaItem | null; onClose: () => void; onCreated?: (item: MediaItem) => void }) {
  const addMedia = useStore((s) => s.addMedia)
  const setSettings = useStore((s) => s.setSettings)
  const addWidget = useStore((s) => s.addWidget)
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const src = useRef<ImageData | null>(null)
  const [an, setAn] = useState<Analysis | null>(null)
  const [elements, setElements] = useState<Partial<Record<ElementId, number>>>({})
  const [seconds, setSeconds] = useState("3")
  const [size, setSize] = useState("960")
  const [fps, setFps] = useState("20")
  const [seed, setSeed] = useState(1)
  const [leafColor, setLeafColor] = useState("")
  const [petalColor, setPetalColor] = useState("")
  const [frames, setFrames] = useState<ImageData[]>([])
  const [busy, setBusy] = useState<string | null>("Analisando a imagem…")
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<MediaItem | null>(null)
  const [err, setErr] = useState("")

  // carrega e analisa
  useEffect(() => {
    if (!m) return
    let alive = true
    setResult(null)
    setErr("")
    setBusy("Analisando a imagem…")
    ;(async () => {
      try {
        // deixa a janela abrir por completo antes do trabalho pesado (senão ela "trava" no meio da animação)
        await new Promise((r) => setTimeout(r, 260))
        const im = await loadImage(mediaUrl(m.file))
        img.current = im
        const { w, h } = fitSize(im.naturalWidth, im.naturalHeight, PREVIEW)
        const data = rasterize(im, w, h)
        await new Promise((r) => setTimeout(r, 30))
        const a = analyze(data)
        if (!alive) return
        src.current = data
        setAn(a)
        const sug = suggest(a)
        if (!Object.entries(sug).some(([k, v]) => k !== "depth" && v)) { sug.light = 1; sug.sparkles = 0.6 }
        setElements(sug)
      } catch (e) {
        setErr(friendlyError(e))
      }
      setBusy(null)
    })()
    return () => { alive = false }
  }, [m?.id])

  // prévia (re-renderiza quando muda algo)
  useEffect(() => {
    if (!an || !src.current) return
    let alive = true
    const t = setTimeout(async () => {
      setBusy("Gerando prévia…")
      const f = await renderFrames(src.current!, an, { elements, seconds: Number(seconds), fps: Number(fps), seed, leafColor: leafColor || undefined, petalColor: petalColor || undefined }, (p) => alive && setProgress(p))
      if (alive) { setFrames(f); setBusy(null) }
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [an, elements, seconds, fps, seed, leafColor, petalColor])

  // toca a prévia em loop
  useEffect(() => {
    if (!frames.length || !canvas.current) return
    const c = canvas.current
    c.width = frames[0].width
    c.height = frames[0].height
    const ctx = c.getContext("2d")!
    let i = 0
    const id = setInterval(() => { ctx.putImageData(frames[i], 0, 0); i = (i + 1) % frames.length }, 1000 / Number(fps))
    return () => clearInterval(id)
  }, [frames, fps])

  const create = async () => {
    if (!m || !img.current) return
    setErr("")
    try {
      setBusy("Analisando em alta qualidade…")
      setProgress(0)
      const { w, h } = fitSize(img.current.naturalWidth, img.current.naturalHeight, Number(size))
      const data = rasterize(img.current, w, h)
      await new Promise((r) => setTimeout(r, 30))
      const a = analyze(data)
      setBusy("Criando os quadros…")
      // os quadros vão direto para um único buffer (não guarda dois conjuntos na memória)
      let packed: Uint8Array | null = null
      await renderFrames(data, a, { elements, seconds: Number(seconds), fps: Number(fps), seed, leafColor: leafColor || undefined, petalColor: petalColor || undefined }, setProgress, (fr, i, total) => {
        if (!packed) packed = new Uint8Array(fr.data.length * total)
        packed.set(fr.data, i * fr.data.length)
      })
      setBusy("Salvando o GIF…")
      const r = await bridge.media.saveAnimation({ width: w, height: h, frames: packed!, delay: Math.round(1000 / Number(fps)), name: `${m.name} (viva)`, loopName: m.name })
      const [item] = addMedia([{ ...r, name: `${m.name} (viva)`, animated: true, living: true }])
      setResult(item)
      onCreated?.(item)
    } catch (e) {
      setErr(friendlyError(e))
    }
    setBusy(null)
  }

  const set = (id: ElementId, v: number) => setElements((e) => ({ ...e, [id]: v }))

  return (
    <Modal open={!!m} onClose={onClose} title={<span className="flex items-center gap-2"><Wand2 size={18} /> Imagem viva</span>} width={1080}>
      {m && (
        <div className="grid grid-cols-[1fr_360px] gap-5">
          <div className="space-y-3">
            <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-2xl bg-black/40">
              {frames.length > 0 ? (
                <canvas ref={canvas} className="max-h-[56vh] w-full object-contain" />
              ) : (
                <img src={mediaUrl(m.file)} className="max-h-[56vh] w-full object-contain opacity-60" />
              )}
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur-[2px]">
                  <Sparkles className="animate-pulse" />
                  <div className="text-sm">{busy}</div>
                  {progress > 0 && progress < 1 && (
                    <div className="h-1.5 w-1/2 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-brand" style={{ width: progress * 100 + "%" }} /></div>
                  )}
                </div>
              )}
              {frames.length > 0 && !busy && <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">Prévia · loop de {seconds}s</span>}
            </div>
            {an && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="text-fg-muted">Detectei:</span>
                {(Object.entries(an.coverage) as [keyof Analysis["coverage"], number][]).filter(([, v]) => v > 0.01).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-brand/20 px-2 py-0.5">
                    {{ person: "🧍 pessoa", foliage: "🌿 folhagem", flowers: "🌸 flores", sky: "☁️ céu", water: "🌊 água" }[k]} {Math.round(v * 100)}%
                  </span>
                ))}
                {Object.values(an.coverage).every((v) => v <= 0.01) && <span className="text-fg-muted">nenhum elemento claro, ative os efeitos manualmente</span>}
              </div>
            )}
            {err && <div className="rounded-lg bg-red-500/15 p-2 text-sm text-red-300">{err}</div>}
            {result && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#5ee3a1]/12 p-3 text-sm">
                <span className="flex-1">✅ GIF criado e salvo na galeria ({result.width}×{result.height}).</span>
                <button className="btn" onClick={() => { setSettings((s) => ({ wallpaper: { ...s.wallpaper, type: "image", image: result.file } })); onClose() }}><Monitor size={14} /> Usar como papel de parede</button>
                <button className="btn" onClick={() => { addWidget("photo", { ids: [result.id] }); onClose() }}><LayoutGrid size={14} /> Criar quadro</button>
              </div>
            )}
          </div>

          <div className="max-h-[66vh] space-y-3 overflow-auto pr-1">
            <div className="text-sm text-fg-muted">Escolha o que se mexe. Os itens marcados como <b className="text-fg">detectado</b> foram encontrados na sua foto.</div>
            {ELEMENTS.map((el) => {
              const v = elements[el.id] ?? 0
              const detected = el.cov && an ? an.coverage[el.cov] > (el.cov === "person" ? 0.01 : 0.03) : false
              const disabled = el.id === "person" && an && !an.person
              return (
                <div key={el.id} className={cn("rounded-xl border border-line p-2.5", v > 0 && "bg-brand/8", disabled && "opacity-50")}>
                  <Switch
                    label={
                      <span>
                        {el.label} {detected && <span className="ml-1 rounded bg-[#5ee3a1]/20 px-1.5 text-[10px] text-[#5ee3a1]">detectado</span>}
                        <span className="block text-xs text-fg-muted">{disabled ? "Não encontrei uma pessoa nesta foto" : el.desc}</span>
                      </span>
                    }
                    checked={v > 0}
                    onChange={(on) => !disabled && set(el.id, on ? 1 : 0)}
                  />
                  {v > 0 && <Slider label="Intensidade" value={v} min={0.3} max={2} step={0.1} onChange={(x) => set(el.id, x)} format={(x) => Math.round(x * 100) + "%"} />}
                  {v > 0 && (el.id === "leaves" || el.id === "petals") && (
                    <ParticleColor
                      value={el.id === "leaves" ? leafColor : petalColor}
                      onChange={el.id === "leaves" ? setLeafColor : setPetalColor}
                      presets={el.id === "leaves"
                        ? [["Outono", "#e0742a"], ["Dourado", "#e3b13a"], ["Vermelho", "#b8322a"], ["Verde", "#6aa84f"], ["Seca", "#9b6b3d"], ["Sakura", "#f4b6cc"]]
                        : [["Sakura", "#f7c3d6"], ["Branco", "#fff4f8"], ["Rosa forte", "#ff6fa3"], ["Lilás", "#c9a3ff"], ["Pêssego", "#ffc19a"], ["Dourado", "#ffd36e"]]}
                    />
                  )}
                </div>
              )
            })}
            <div className="space-y-2 border-t border-line pt-3 text-sm">
              <div>Duração do loop</div>
              <Segmented value={seconds} onChange={setSeconds} options={[{ value: "2", label: "2 s" }, { value: "3", label: "3 s" }, { value: "5", label: "5 s" }]} />
              <div>Tamanho do GIF</div>
              <Segmented value={size} onChange={setSize} options={[{ value: "640", label: "640px" }, { value: "960", label: "960px" }, { value: "1280", label: "1280px" }]} />
              <div>Fluidez</div>
              <Segmented value={fps} onChange={setFps} options={[{ value: "15", label: "15 qps" }, { value: "20", label: "20 qps" }, { value: "25", label: "25 qps" }]} />
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn" onClick={() => setSeed((s) => s + 1)} title="Outra disposição das partículas"><Dices size={14} /> Variar</button>
              <ThemedButton className="flex-1" onClick={create} disabled={!!busy || !an}><Sparkles size={15} /> Criar GIF</ThemedButton>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
