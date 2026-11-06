import { useEffect, useState } from "react"
import { Check, ClipboardPaste, ImagePlus } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl, type MediaDesc } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Modal, Empty } from "./ui/controls"

const add = (items: MediaDesc[]) => (items.length ? useStore.getState().addMedia(items) : [])

/** Abre o seletor de arquivos já na pasta Imagens (ou na última pasta usada). */
export async function importImages() {
  return add(await bridge.media.import())
}
/** Cola uma imagem copiada (print, navegador) ou um arquivo copiado no Explorer. */
export async function pasteImages() {
  return add(await bridge.media.paste())
}
export async function importDropped(files: FileList | File[]) {
  return add(await bridge.media.importFiles(files))
}

const typing = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("input,textarea,[contenteditable=true]")

/**
 * Ctrl+V e arrastar-e-soltar de imagens enquanto `active`.
 * Devolve `dragging` para mostrar um destaque na área de soltar.
 */
export function usePasteAndDrop(active: boolean, onAdded: (items: MediaItem[]) => void) {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!active) return
    const key = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !typing(e.target)) {
        e.preventDefault()
        const n = await pasteImages()
        if (n.length) onAdded(n)
      }
    }
    let depth = 0
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { depth++; setDragging(true) } }
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault() }
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const n = await importDropped(e.dataTransfer.files)
      if (n.length) onAdded(n)
    }
    window.addEventListener("keydown", key, true)
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragleave", leave)
    window.addEventListener("dragover", over)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("dragover", over)
      window.removeEventListener("drop", drop)
    }
  }, [active, onAdded])
  return dragging
}

export function DropOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[7000] flex items-center justify-center bg-black/55">
      <div className="surface flex flex-col items-center gap-2 px-10 py-8 text-lg">
        <ImagePlus size={36} className="text-brand" />
        Solte as imagens aqui
      </div>
    </div>
  )
}

/** Botões padrão para adicionar imagens. */
export function AddImageButtons({ onAdded, compact }: { onAdded?: (items: MediaItem[]) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn" onClick={async () => onAdded?.(await importImages())}><ImagePlus size={15} /> {compact ? "Do computador" : "Adicionar do computador"}</button>
      <button className="btn" onClick={async () => onAdded?.(await pasteImages())} title="Cola uma imagem ou arquivo copiado (Ctrl+V)"><ClipboardPaste size={15} /> Colar</button>
      {!compact && <span className="text-xs text-fg-muted">ou Ctrl+V · ou arraste arquivos para cá</span>}
    </div>
  )
}

export function MediaPicker({
  open, onClose, onPick, multi = false, selected = [],
}: { open: boolean; onClose: () => void; onPick: (ids: string[]) => void; multi?: boolean; selected?: string[] }) {
  const media = useStore((s) => s.media)
  const [sel, setSel] = useState<string[]>(selected)
  useEffect(() => { if (open) setSel(selected) }, [open])
  const added = (n: MediaItem[]) => { if (multi) setSel((s) => [...s, ...n.map((x) => x.id)]) }
  const dragging = usePasteAndDrop(open, added)
  const toggle = (id: string) => {
    if (!multi) { onPick([id]); onClose(); return }
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  return (
    <Modal open={open} onClose={onClose} title="Suas imagens" width={780}>
      <DropOverlay show={dragging} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <AddImageButtons onAdded={added} />
        {multi && <button className="btn btn-accent" onClick={() => { onPick(sel); onClose() }}>Usar {sel.length} foto(s)</button>}
      </div>
      {media.length === 0 ? (
        <Empty icon="🖼️" title="Nenhuma imagem ainda">Adicione, cole (Ctrl+V) ou arraste imagens.</Empty>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {media.map((m) => (
            <button key={m.id} onClick={() => toggle(m.id)} className={cn("relative aspect-square overflow-hidden rounded-xl ring-2 ring-transparent transition", sel.includes(m.id) && "ring-brand")}>
              <img src={mediaUrl(m.file)} className="h-full w-full object-cover" loading="lazy" draggable={false} />
              <div className="absolute top-1 left-1 flex gap-1">
                {m.upscaled && <span className="rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">{m.upscaled.toUpperCase()}</span>}
                {m.animated && <span className="rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">{m.living ? "VIVA" : "GIF"}</span>}
              </div>
              {sel.includes(m.id) && <span className="absolute top-1 right-1 rounded-full bg-brand p-1 text-white"><Check size={12} /></span>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
