import { useRef } from "react"
import { Move } from "lucide-react"
import { mediaUrl } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { Slider } from "./ui/controls"

/** Enquadramento de uma imagem dentro de uma caixa: posição (%), zoom e efeitos. */
export interface Frame {
  x: number // 0..100 (object-position)
  y: number
  zoom: number // 1..4
  blur?: number // px
  dim?: number // 0..0.85
  opacity?: number // 0..1
  bright?: number // 0.5..1.5
}
export const DEFAULT_FRAME: Frame = { x: 50, y: 50, zoom: 1, blur: 0, dim: 0, opacity: 1, bright: 1 }

/** Estilo para aplicar o enquadramento em um <img> que preenche a caixa. */
export function frameImgStyle(f?: Partial<Frame>, fit: "cover" | "contain" = "cover"): React.CSSProperties {
  const v = { ...DEFAULT_FRAME, ...f }
  return {
    objectFit: fit,
    objectPosition: `${v.x}% ${v.y}%`,
    transform: v.zoom !== 1 ? `scale(${v.zoom})` : undefined,
    transformOrigin: `${v.x}% ${v.y}%`,
    filter: [v.blur ? `blur(${v.blur}px)` : "", v.bright !== 1 ? `brightness(${v.bright})` : ""].join(" ").trim() || undefined,
  }
}

/** Editor visual: arraste a imagem para enquadrar; role o mouse para zoom. */
export function ImageFramer({
  media, aspect, value, onChange, effects = true,
}: { media: MediaItem; aspect: number; value: Partial<Frame>; onChange: (f: Frame) => void; effects?: boolean }) {
  const f = { ...DEFAULT_FRAME, ...value }
  const box = useRef<HTMLDivElement>(null)
  const W = aspect >= 1 ? 420 : Math.round(420 * aspect)
  const H = aspect >= 1 ? Math.round(420 / aspect) : 420

  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY
    const bx = f.x, by = f.y
    // quanto a imagem "sobra" além da caixa define a sensibilidade do arrasto
    const ia = media.width && media.height ? media.width / media.height : aspect
    const overW = Math.max(0.05, (ia / aspect) * f.zoom - 1) * W
    const overH = Math.max(0.05, (aspect / ia) * f.zoom - 1) * H
    const mv = (ev: PointerEvent) => {
      const nx = Math.max(0, Math.min(100, bx - ((ev.clientX - sx) / Math.max(overW, W * 0.15)) * 100 / f.zoom))
      const ny = Math.max(0, Math.min(100, by - ((ev.clientY - sy) / Math.max(overH, H * 0.15)) * 100 / f.zoom))
      onChange({ ...f, x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 })
    }
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", mv)
    window.addEventListener("pointerup", up)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <div
          ref={box}
          className="relative cursor-grab overflow-hidden rounded-[calc(var(--r)*0.6)] bg-black/40 ring-2 ring-brand/60 active:cursor-grabbing"
          style={{ width: W, height: H }}
          onPointerDown={drag}
          onWheel={(e) => onChange({ ...f, zoom: Math.max(1, Math.min(4, +(f.zoom - e.deltaY * 0.0015).toFixed(2))) })}
          data-clickable
        >
          <img src={mediaUrl(media.file)} className="h-full w-full select-none" style={frameImgStyle(f)} draggable={false} />
          {!!f.dim && <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${f.dim})` }} />}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/15" />)}
          </div>
          <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
            <Move size={12} /> arraste para enquadrar · role para zoom
          </div>
        </div>
      </div>
      <Slider label="Zoom" value={f.zoom} min={1} max={4} step={0.05} onChange={(v) => onChange({ ...f, zoom: v })} format={(v) => Math.round(v * 100) + "%"} />
      {effects && (
        <>
          <Slider label="Brilho" value={f.bright ?? 1} min={0.5} max={1.5} step={0.02} onChange={(v) => onChange({ ...f, bright: v })} format={(v) => Math.round(v * 100) + "%"} />
          <Slider label="Escurecer (para o texto aparecer)" value={f.dim ?? 0} min={0} max={0.85} step={0.01} onChange={(v) => onChange({ ...f, dim: v })} format={(v) => Math.round(v * 100) + "%"} />
          <Slider label="Desfoque" value={f.blur ?? 0} min={0} max={30} onChange={(v) => onChange({ ...f, blur: v })} format={(v) => v + "px"} />
          <Slider label="Opacidade da imagem" value={f.opacity ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => onChange({ ...f, opacity: v })} format={(v) => Math.round(v * 100) + "%"} />
        </>
      )}
      <div className="flex justify-end">
        <button className="btn text-xs" onClick={() => onChange({ ...DEFAULT_FRAME })}>Restaurar enquadramento</button>
      </div>
    </div>
  )
}
