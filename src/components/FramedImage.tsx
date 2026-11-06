import { useState } from "react"
import { ClipboardPaste, ImagePlus, X } from "lucide-react"
import { bridge, mediaUrl } from "@/lib/bridge"
import type { ImgFrame } from "@/lib/types"
import { Slider } from "./ui/controls"

/** Mostra uma imagem enquadrada (posição x/y em % e zoom) cobrindo o elemento pai. */
export function FramedImage({ f, className, style }: { f?: ImgFrame; className?: string; style?: React.CSSProperties }) {
  if (!f?.file) return null
  return (
    <img
      src={mediaUrl(f.file)}
      draggable={false}
      className={"pointer-events-none absolute inset-0 h-full w-full object-cover " + (className ?? "")}
      style={{ objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom})`, transformOrigin: `${f.x}% ${f.y}%`, ...style }}
    />
  )
}

/** Campo de formulário: escolher/colar uma imagem e ajustar o enquadramento. */
export function FrameField({ title, desc, value, onChange, aspect = "16 / 9" }: { title: string; desc?: string; value?: ImgFrame; onChange: (v: ImgFrame | undefined) => void; aspect?: string }) {
  const [err, setErr] = useState("")
  const take = (file?: string) => { if (file) { setErr(""); onChange({ file, x: 50, y: 50, zoom: 1 }) } }
  const pick = async () => { const [d] = await bridge.media.attach("images"); take(d?.file) }
  const paste = async () => { const [d] = await bridge.media.paste(); if (d) take(d.file); else setErr("Nenhuma imagem na área de transferência.") }
  return (
    <fieldset className="space-y-2 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {desc && <div className="-mt-1 text-xs text-fg-muted">{desc}</div>}
      <div
        tabIndex={0}
        className="relative flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-line outline-none focus:border-brand"
        style={{ aspectRatio: aspect, background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}
        onPaste={(e) => { e.preventDefault(); paste() }}
        title="Clique aqui e use Ctrl+V para colar uma imagem"
      >
        {value ? <FramedImage f={value} /> : <div className="text-center text-xs text-fg-muted">Escolha uma foto<br />ou clique aqui e cole (Ctrl+V)</div>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn !py-1 text-xs" onClick={pick}><ImagePlus size={13} /> Escolher foto</button>
        <button type="button" className="btn !py-1 text-xs" onClick={paste}><ClipboardPaste size={13} /> Colar</button>
        {value && <button type="button" className="btn btn-ghost !py-1 text-xs hover:!text-red-400" onClick={() => onChange(undefined)}><X size={13} /> Remover</button>}
      </div>
      {value && (
        <div className="grid grid-cols-3 gap-3">
          <Slider label="Horizontal" value={value.x} min={0} max={100} onChange={(x) => onChange({ ...value, x })} format={(v) => v + "%"} />
          <Slider label="Vertical" value={value.y} min={0} max={100} onChange={(y) => onChange({ ...value, y })} format={(v) => v + "%"} />
          <Slider label="Zoom" value={Math.round(value.zoom * 100)} min={100} max={200} onChange={(z) => onChange({ ...value, zoom: z / 100 })} format={(v) => v + "%"} />
        </div>
      )}
      {err && <div className="text-xs text-[#ff8f8f]">{err}</div>}
    </fieldset>
  )
}
