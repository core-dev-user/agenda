import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Columns2, Crop, Cpu, Download, Expand, Monitor, Sparkles, Trash2, LayoutGrid, Wand2, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, friendlyError, isDesktop, mediaUrl } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Card, Empty, Modal, Segmented, Slider, Switch, ThemedButton } from "@/components/ui/controls"
import { AddImageButtons, DropOverlay, usePasteAndDrop } from "@/components/MediaPicker"
import { LivingStudio } from "@/components/LivingStudio"
import { PhotoEditor } from "@/components/PhotoEditor"

export interface UpOpts { target: number; model: "photo" | "art"; enhance: number; ai: boolean }

export default function Gallery() {
  const media = useStore((s) => s.media)
  const removeMedia = useStore((s) => s.removeMedia)
  const addMedia = useStore((s) => s.addMedia)
  const setSettings = useStore((s) => s.setSettings)
  const addWidget = useStore((s) => s.addWidget)
  const wallpaper = useStore((s) => s.settings.wallpaper)
  const [progress, setProgress] = useState<Record<string, { pct: number; stage: string }>>({})
  const [ai, setAi] = useState<{ installed: boolean; sharp: boolean } | null>(null)
  const [aiDl, setAiDl] = useState<number | null>(null)
  const [view, setView] = useState<MediaItem | null>(null)
  const [up, setUp] = useState<MediaItem | null>(null)
  const [living, setLiving] = useState<MediaItem | null>(null)
  const [editing, setEditing] = useState<MediaItem | null>(null)
  const [err, setErr] = useState("")
  const dragging = usePasteAndDrop(true, useCallback(() => {}, []))

  useEffect(() => {
    bridge.ai.status().then(setAi)
    const a = bridge.media.onProgress((p) => setProgress((x) => { const n = { ...x }; if (p.pct >= 100) delete n[p.file]; else n[p.file] = { pct: p.pct, stage: p.stage }; return n }))
    const b = bridge.ai.onProgress((n) => setAiDl(n))
    return () => { a(); b() }
  }, [])

  const upscale = async (m: MediaItem, o: UpOpts) => {
    setUp(null)
    setErr("")
    setProgress((x) => ({ ...x, [m.file]: { pct: 1, stage: "Preparando" } }))
    try {
      const r = await bridge.media.upscale(m.file, o.target, o.ai, { model: o.model, enhance: o.enhance })
      const label = r.tag === "8k" ? "8K" : r.tag === "4k" ? "4K" : "HD+"
      const [n] = addMedia([{ file: r.file, name: `${m.name} (${label}${o.enhance ? " realçada" : ""})`, width: r.width, height: r.height, upscaled: r.tag, ai: r.usedAI, sourceId: m.id, enhanced: o.enhance > 0 }])
      setView(n) // abre direto no comparador
    } catch (e: any) {
      setErr(friendlyError(e))
    } finally {
      setProgress((x) => { const n = { ...x }; delete n[m.file]; return n })
    }
  }

  const installAI = async () => {
    setAiDl(0)
    setErr("")
    try {
      await bridge.ai.install()
      setAi(await bridge.ai.status())
    } catch (e: any) {
      setErr("Falha ao baixar o motor de IA: " + friendlyError(e))
    }
    setAiDl(null)
  }

  return (
    <div className="space-y-5 p-6">
      <DropOverlay show={dragging} />
      <div className="flex flex-wrap items-center gap-3">
        <AddImageButtons />
        <div className="flex-1" />
        <div className="text-sm text-fg-muted">{media.length} imagem(ns)</div>
        {!isDesktop && <span className="text-xs text-fg-muted">Abra pelo app desktop para importar e melhorar imagens.</span>}
      </div>

      <Card className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/20 text-brand"><Cpu size={22} /></div>
        <div className="flex-1 text-sm">
          <div className="font-medium">Melhoria de imagem com IA</div>
          <div className="text-fg-muted">
            {ai?.installed
              ? "IA instalada: limpa a compressão, reconstrói texturas e bordas. Depois de melhorar, o comparador antes/depois abre sozinho."
              : "Sem a IA, a ampliação só deixa a foto maior. Instale o motor de IA (≈45 MB, usa a placa de vídeo) para reconstruir detalhes de verdade."}
          </div>
        </div>
        {!ai?.installed && (
          <button className="btn" disabled={aiDl !== null || !isDesktop} onClick={installAI}>
            <Download size={14} /> {aiDl !== null ? `Baixando ${aiDl}%` : "Instalar motor de IA"}
          </button>
        )}
      </Card>
      {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}

      {media.length === 0 ? (
        <Empty icon="🖼️" title="Sua galeria está vazia">Adicione, cole (Ctrl+V) ou arraste imagens e GIFs para cá.</Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          <AnimatePresence>
            {media.map((m) => {
              const p = progress[m.file]
              const isWp = wallpaper.type === "image" && wallpaper.image === m.file
              const actions = [
                { t: m.sourceId ? "Ver e comparar antes/depois" : "Ver", I: m.sourceId ? Columns2 : Expand, fn: () => setView(m) },
                { t: "Usar como papel de parede", I: Monitor, fn: () => setSettings((s) => ({ wallpaper: { ...s.wallpaper, type: "image", image: m.file } })) },
                { t: "Criar quadro na área de trabalho", I: LayoutGrid, fn: () => addWidget("photo", { ids: [m.id] }) },
                ...(m.animated ? [] : [
                  { t: "Editar (recortar, girar, ajustar cor)", I: Crop, fn: () => setEditing(m) },
                  { t: "Imagem viva (transformar em GIF animado)", I: Wand2, fn: () => setLiving(m) },
                  { t: "Melhorar com IA / ampliar", I: Sparkles, fn: () => setUp(m) },
                ]),
                { t: "Exportar", I: Download, fn: () => bridge.media.exportFile(m.file, m.name + "." + m.file.split(".").pop()) },
                { t: "Excluir", I: Trash2, fn: () => confirm("Excluir esta imagem?") && removeMedia(m.id) },
              ]
              return (
                <motion.div key={m.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} whileHover={{ y: -4, rotateX: 4 }} className="group surface overflow-hidden !rounded-2xl" style={{ transformPerspective: 800 }}>
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img src={mediaUrl(m.file)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" draggable={false} />
                    <div className="absolute top-2 left-2 flex gap-1">
                      {m.upscaled && <span className="rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">{m.upscaled === "hd" ? "HD+" : m.upscaled.toUpperCase()}{m.ai ? " · IA" : ""}</span>}
                      {m.animated && <span className="rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">{m.living ? "VIVA" : "GIF"}</span>}
                      {isWp && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">Papel de parede</span>}
                    </div>
                    {p && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white backdrop-blur-sm">
                        <Sparkles className="animate-pulse" />
                        <div className="text-sm">{p.stage}</div>
                        <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-brand transition-[width]" style={{ width: p.pct + "%" }} /></div>
                        <div className="font-num text-xs">{Math.round(p.pct)}%</div>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1 bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {actions.map(({ t, I, fn }) => (
                        <button key={t} title={t} onClick={fn} disabled={!!p} className="rounded-lg bg-white/15 p-2 text-white backdrop-blur hover:bg-white/30"><I size={15} /></button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate">{m.name}</span>
                    <span className="font-num shrink-0 text-xs text-fg-muted">{m.width}×{m.height}</span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <UpscaleDialog m={up} onClose={() => setUp(null)} onGo={upscale} aiInstalled={!!ai?.installed} />
      <Viewer m={view} onClose={() => setView(null)} />
      <LivingStudio m={living} onClose={() => setLiving(null)} />
      <PhotoEditor m={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/* ------------------------------ diálogo de melhoria ------------------------------ */
function UpscaleDialog({ m, onClose, onGo, aiInstalled }: { m: MediaItem | null; onClose: () => void; onGo: (m: MediaItem, o: UpOpts) => void; aiInstalled: boolean }) {
  const [size, setSize] = useState("0")
  const [model, setModel] = useState<"photo" | "art">("photo")
  const [enhance, setEnhance] = useState(1)
  const [useAI, setUseAI] = useState(true)
  const [screenLong, setScreenLong] = useState(1920)
  useEffect(() => { bridge.app.screenInfo().then((s) => setScreenLong(Math.round(s.long))) }, [])
  if (!m) return <Modal open={false} onClose={onClose}>{null}</Modal>
  const long = Math.max(m.width, m.height) || 1
  const ideal = Math.min(7680, Math.max(2560, screenLong * 2))
  const target = Number(size) || ideal
  const factor = target / long
  const ai = aiInstalled && useAI
  return (
    <Modal open onClose={onClose} title="Melhorar imagem" width={520}>
      <div className="space-y-4 text-sm">
        <div className="flex gap-3">
          <img src={mediaUrl(m.file)} className="h-24 w-32 rounded-lg object-cover" />
          <div>
            <div className="font-medium">{m.name}</div>
            <div className="font-num text-fg-muted">Atual: {m.width}×{m.height}</div>
            <div className="font-num text-fg-muted">Resultado: lado maior {target}px ({factor.toFixed(1)}×)</div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-fg-muted">Tamanho final</div>
          <Segmented value={size} onChange={setSize} options={[{ value: "0", label: `Ideal p/ minha tela (${ideal}px)` }, { value: "3840", label: "4K" }, { value: "7680", label: "8K" }]} />
          <div className="mt-1.5 text-xs text-fg-muted">
            Sua maior tela tem {screenLong}px. Acima de 2× isso, a diferença não aparece na tela, só no zoom ou na impressão.
          </div>
        </div>

        {aiInstalled ? (
          <div className="space-y-2">
            <Switch label="Usar IA (reconstrói detalhes e limpa a compressão)" checked={useAI} onChange={setUseAI} />
            {useAI && (
              <>
                <div className="text-fg-muted">Tipo de imagem</div>
                <Segmented value={model} onChange={setModel} options={[{ value: "photo", label: "Foto" }, { value: "art", label: "Desenho / anime / ilustração" }]} />
              </>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-[#ffd36e]/12 p-3 text-[#ffd36e]">Sem o motor de IA a foto só fica maior, sem detalhes novos. Instale-o no topo da galeria.</div>
        )}

        <div>
          <Slider label="Realce de detalhes (contraste local, cor e nitidez)" value={enhance} min={0} max={2} step={0.5} onChange={setEnhance} format={(v) => (v === 0 ? "nenhum (fiel)" : v <= 0.5 ? "bem leve" : v <= 1 ? "suave" : v <= 1.5 ? "médio" : "forte")} />
          <div className="text-xs text-fg-muted">É o que deixa a melhoria visível na tela. Use "nenhum" para manter a foto 100% fiel.</div>
        </div>

        <div className="text-xs text-fg-muted">A original é mantida. A nova versão vai para a galeria e o comparador antes/depois abre sozinho.</div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <ThemedButton onClick={() => onGo(m, { target: Number(size), model, enhance, ai })}><Sparkles size={14} /> Melhorar</ThemedButton>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------ visualizador + comparador ------------------------------ */
function Viewer({ m, onClose }: { m: MediaItem | null; onClose: () => void }) {
  const media = useStore((s) => s.media)
  const src = m?.sourceId ? media.find((x) => x.id === m.sourceId) : undefined
  const [split, setSplit] = useState(50)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setSplit(50); setZoom(1); setPan({ x: 0, y: 0 }) }, [m?.id])

  const onWheel = (e: React.WheelEvent) => setZoom((z) => Math.max(1, Math.min(8, +(z * (e.deltaY < 0 ? 1.15 : 0.87)).toFixed(2))))
  const dragPan = (e: React.PointerEvent) => {
    if (zoom === 1 || (e.target as Element).closest("[data-split]")) return
    const sx = e.clientX, sy = e.clientY, b = pan
    const mv = (ev: PointerEvent) => setPan({ x: b.x + (ev.clientX - sx) / zoom, y: b.y + (ev.clientY - sy) / zoom })
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", mv)
    window.addEventListener("pointerup", up)
  }
  const dragSplit = (e: React.PointerEvent) => {
    e.stopPropagation()
    const r = box.current!.getBoundingClientRect()
    const mv = (ev: PointerEvent) => setSplit(Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)))
    mv(e.nativeEvent)
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", mv)
    window.addEventListener("pointerup", up)
  }
  const layer = (file: string) => (
    <img src={mediaUrl(file)} className="absolute inset-0 h-full w-full object-contain" style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "center" }} draggable={false} />
  )

  return createPortal(
    <AnimatePresence>
      {m && (
        <motion.div className="fixed inset-0 z-[6000] flex flex-col bg-black/90 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="flex items-center gap-3 px-5 py-3 text-sm text-white">
            <span className="flex-1 truncate">{m.name} · {m.width}×{m.height}{src && ` · comparando com a original (${src.width}×${src.height})`}</span>
            <span className="text-white/60">Zoom</span>
            {[1, 2, 4].map((z) => (
              <button key={z} className={cn("rounded-md px-2 py-0.5", zoom === z ? "bg-white text-black" : "bg-white/15")} onClick={() => { setZoom(z); setPan({ x: 0, y: 0 }) }}>{z}×</button>
            ))}
            <span className="font-num w-12 text-white/60">{Math.round(zoom * 100)}%</span>
            <button className="rounded-full bg-white/15 p-1.5 hover:bg-white/30" onClick={onClose}><X size={16} /></button>
          </div>
          <div ref={box} className={cn("relative mx-5 mb-5 flex-1 overflow-hidden rounded-xl", zoom > 1 && "cursor-grab active:cursor-grabbing")} onWheel={onWheel} onPointerDown={dragPan}>
            {src ? (
              <>
                {/* original embaixo (esquerda), melhorada por cima (direita) */}
                {layer(src.file)}
                <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>{layer(m.file)}</div>
                <div data-split className="absolute top-0 bottom-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize" style={{ left: `${split}%` }} onPointerDown={dragSplit}>
                  <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_10px_rgb(0_0_0/.8)]" />
                  <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg"><Columns2 size={16} /></div>
                </div>
                <span className="absolute top-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">Antes</span>
                <span className="absolute top-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">Depois{m.ai ? " (IA)" : ""}</span>
              </>
            ) : (
              layer(m.file)
            )}
          </div>
          <div className="pb-4 text-center text-xs text-white/60">
            {src ? "Arraste a linha para comparar · role o mouse para dar zoom · arraste a imagem para mover" : "Role o mouse para dar zoom · arraste para mover"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
