import { useEffect, useMemo, useRef, useState } from "react"
import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Save, Undo2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, friendlyError, mediaUrl, type EditOps } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Modal, Slider, ThemedButton } from "./ui/controls"

type Rect = { x: number; y: number; w: number; h: number } // normalizado 0..1

const RATIOS: { label: string; r: number | null | "orig" }[] = [
  { label: "Livre", r: null },
  { label: "Original", r: "orig" },
  { label: "1:1", r: 1 },
  { label: "4:3", r: 4 / 3 },
  { label: "3:4", r: 3 / 4 },
  { label: "16:9 (tela deitada)", r: 16 / 9 },
  { label: "9:16 (tela em pé)", r: 9 / 16 },
  { label: "3:2", r: 3 / 2 },
]

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 }

export function PhotoEditor({ m, onClose, onSaved }: { m: MediaItem | null; onClose: () => void; onSaved?: (item: MediaItem) => void }) {
  if (!m) return null
  return <Editor key={m.id} m={m} onClose={onClose} onSaved={onSaved} />
}

function Editor({ m, onClose, onSaved }: { m: MediaItem; onClose: () => void; onSaved?: (item: MediaItem) => void }) {
  const addMedia = useStore((s) => s.addMedia)
  const replace = useStore((s) => s.replaceMediaFile)
  const [rot, setRot] = useState<0 | 90 | 180 | 270>(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [crop, setCrop] = useState<Rect>(FULL)
  const [ratio, setRatio] = useState<number | null | "orig">(null)
  const [adj, setAdj] = useState({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpen: 0 })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(false)

  // dimensões da imagem já girada
  const rw = rot % 180 === 0 ? m.width : m.height
  const rh = rot % 180 === 0 ? m.height : m.width
  const imgAspect = rw / Math.max(1, rh)
  const VIEW_W = 680, VIEW_H = 460
  const scale = Math.min(VIEW_W / rw, VIEW_H / rh)
  const dw = Math.round(rw * scale), dh = Math.round(rh * scale)

  useEffect(() => {
    const i = new Image()
    i.crossOrigin = "anonymous"
    i.src = mediaUrl(m.file)
    i.decode().then(() => { img.current = i; setReady(true) })
  }, [m.file])

  // desenha a prévia girada/espelhada
  useEffect(() => {
    const c = canvas.current, i = img.current
    if (!c || !i) return
    c.width = dw
    c.height = dh
    const ctx = c.getContext("2d")!
    ctx.save()
    ctx.translate(dw / 2, dh / 2)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    const w = rot % 180 === 0 ? dw : dh, h = rot % 180 === 0 ? dh : dw
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(i, -w / 2, -h / 2, w, h)
    ctx.restore()
  }, [ready, rot, flipH, flipV, dw, dh])

  const targetRatio = ratio === "orig" ? imgAspect : ratio
  const applyRatio = (r: number | null | "orig") => {
    setRatio(r)
    const tr = r === "orig" ? imgAspect : r
    if (!tr) return
    // maior retângulo centralizado com a proporção escolhida
    const rel = tr / imgAspect
    const w = rel >= 1 ? 1 : rel
    const h = rel >= 1 ? 1 / rel : 1
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
  }

  const rotate = (d: 90 | -90) => {
    setRot((r) => (((r + d + 360) % 360) as 0 | 90 | 180 | 270))
    setCrop(FULL)
    setRatio(null)
  }

  const dragCrop = (e: React.PointerEvent, mode: "move" | "nw" | "ne" | "sw" | "se") => {
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const b = crop
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / dw, dy = (ev.clientY - sy) / dh
      let r: Rect
      if (mode === "move") r = { ...b, x: Math.max(0, Math.min(1 - b.w, b.x + dx)), y: Math.max(0, Math.min(1 - b.h, b.y + dy)) }
      else {
        let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h
        if (mode.includes("w")) x1 = Math.min(x2 - 0.05, Math.max(0, x1 + dx))
        if (mode.includes("e")) x2 = Math.max(x1 + 0.05, Math.min(1, x2 + dx))
        if (mode.includes("n")) y1 = Math.min(y2 - 0.05, Math.max(0, y1 + dy))
        if (mode.includes("s")) y2 = Math.max(y1 + 0.05, Math.min(1, y2 + dy))
        r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
        if (targetRatio) {
          // mantém a proporção (em pixels) ajustando a altura
          const hNorm = (r.w * imgAspect) / targetRatio
          if (mode.includes("n")) r = { ...r, y: Math.max(0, y2 - hNorm), h: Math.min(hNorm, y2) }
          else r = { ...r, h: Math.min(hNorm, 1 - r.y) }
          r.w = (r.h * targetRatio) / imgAspect
          if (mode.includes("w")) r.x = x2 - r.w
        }
      }
      setCrop(r)
    }
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", mv)
    window.addEventListener("pointerup", up)
  }

  const cssFilter = `brightness(${adj.brightness}) contrast(${adj.contrast}) saturate(${adj.saturation})`
  const changed = rot !== 0 || flipH || flipV || crop !== FULL || Object.entries(adj).some(([k, v]) => v !== (k === "warmth" || k === "sharpen" ? 0 : 1))
  const outW = Math.round(crop.w * rw), outH = Math.round(crop.h * rh)

  const save = async (mode: "copy" | "replace") => {
    setBusy(true)
    setErr("")
    try {
      const ops: EditOps = { rotate: rot, flipH, flipV, crop: crop === FULL ? null : crop, ...adj }
      const d = await bridge.media.edit(m.file, ops)
      if (mode === "replace") {
        replace(m.id, d)
        onSaved?.({ ...m, ...d, name: m.name })
      } else {
        const [n] = addMedia([{ ...d, name: `${m.name} (editada)` }])
        onSaved?.(n)
      }
      onClose()
    } catch (e) {
      setErr(friendlyError(e))
    }
    setBusy(false)
  }

  const handles = useMemo(() => ["nw", "ne", "sw", "se"] as const, [])

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Crop size={18} /> Editar foto</span>} width={1060}>
      <div className="grid grid-cols-[1fr_300px] gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="relative" style={{ width: dw, height: dh }}>
            <canvas ref={canvas} style={{ width: dw, height: dh, filter: cssFilter }} className="rounded-md" />
            {adj.warmth !== 0 && (
              <div className="pointer-events-none absolute inset-0 rounded-md mix-blend-soft-light" style={{ background: adj.warmth > 0 ? "#ff9a3c" : "#3c8cff", opacity: Math.abs(adj.warmth) * 0.5 }} />
            )}
            {/* área fora do recorte escurecida */}
            <div
              className="absolute border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
              style={{ left: crop.x * dw, top: crop.y * dh, width: crop.w * dw, height: crop.h * dh, cursor: "move" }}
              onPointerDown={(e) => dragCrop(e, "move")}
              data-clickable
            >
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/25" />)}
              </div>
              {handles.map((h) => (
                <div
                  key={h}
                  onPointerDown={(e) => dragCrop(e, h)}
                  className="absolute h-4 w-4 rounded-sm border-2 border-white bg-brand"
                  style={{ [h.includes("n") ? "top" : "bottom"]: -8, [h.includes("w") ? "left" : "right"]: -8, cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize" } as React.CSSProperties}
                  data-clickable
                />
              ))}
            </div>
          </div>
          <div className="font-num text-xs text-fg-muted">Resultado: {outW} × {outH} px</div>
          {err && <div className="w-full rounded-lg bg-red-500/15 p-2 text-sm text-red-300">{err}</div>}
        </div>

        <div className="max-h-[68vh] space-y-4 overflow-auto pr-1 text-sm">
          <div>
            <div className="mb-1.5 text-fg-muted">Recorte</div>
            <div className="flex flex-wrap gap-1.5">
              {RATIOS.map((r) => (
                <button key={r.label} onClick={() => applyRatio(r.r)} className={cn("btn px-2.5 py-1 text-xs", ratio === r.r && "!bg-brand !text-white")}>{r.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-fg-muted">Girar e espelhar</div>
            <div className="flex gap-1.5">
              <button className="btn btn-icon" title="Girar para a esquerda" onClick={() => rotate(-90)}><RotateCcw size={16} /></button>
              <button className="btn btn-icon" title="Girar para a direita" onClick={() => rotate(90)}><RotateCw size={16} /></button>
              <button className={cn("btn btn-icon", flipH && "!bg-brand/40")} title="Espelhar na horizontal" onClick={() => setFlipH(!flipH)}><FlipHorizontal2 size={16} /></button>
              <button className={cn("btn btn-icon", flipV && "!bg-brand/40")} title="Espelhar na vertical" onClick={() => setFlipV(!flipV)}><FlipVertical2 size={16} /></button>
            </div>
          </div>
          <div>
            <div className="mb-1 text-fg-muted">Ajustes</div>
            <Slider label="Brilho" value={adj.brightness} min={0.5} max={1.5} step={0.01} onChange={(v) => setAdj({ ...adj, brightness: v })} format={(v) => Math.round((v - 1) * 100) + ""} />
            <Slider label="Contraste" value={adj.contrast} min={0.5} max={1.5} step={0.01} onChange={(v) => setAdj({ ...adj, contrast: v })} format={(v) => Math.round((v - 1) * 100) + ""} />
            <Slider label="Saturação" value={adj.saturation} min={0} max={2} step={0.02} onChange={(v) => setAdj({ ...adj, saturation: v })} format={(v) => Math.round((v - 1) * 100) + ""} />
            <Slider label="Temperatura" value={adj.warmth} min={-1} max={1} step={0.02} onChange={(v) => setAdj({ ...adj, warmth: v })} format={(v) => (v > 0 ? "quente " : v < 0 ? "fria " : "") + Math.round(Math.abs(v) * 100)} />
            <Slider label="Nitidez" value={adj.sharpen} min={0} max={2} step={0.05} onChange={(v) => setAdj({ ...adj, sharpen: v })} format={(v) => Math.round(v * 50) + ""} />
            <div className="text-xs text-fg-muted">A nitidez é aplicada ao salvar.</div>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <button className="btn" disabled={!changed} onClick={() => { setRot(0); setFlipH(false); setFlipV(false); setCrop(FULL); setRatio(null); setAdj({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpen: 0 }) }}><Undo2 size={14} /> Desfazer tudo</button>
            <button className="btn" disabled={!changed || busy} onClick={() => save("copy")}><Save size={14} /> Salvar como cópia</button>
            <ThemedButton onClick={() => save("replace")} disabled={!changed || busy}>{busy ? "Salvando…" : "Substituir a original"}</ThemedButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
