import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { WandSparkles, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { mediaUrl } from "@/lib/bridge"
import { AutoStyle } from "./AutoStyle"

/** Quando uma imagem nova vira papel de parede, oferece personalizar tudo de acordo com ela. */
export function AutoStylePrompt() {
  const wp = useStore((s) => s.settings.wallpaper)
  const img = wp.type === "image" ? wp.image : null
  const prev = useRef(img)
  const [ask, setAsk] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const before = prev.current
    prev.current = img
    if (!img || img === before) return
    setAsk(img)
    const t = setTimeout(() => setAsk((a) => (a === img ? null : a)), 20000)
    return () => clearTimeout(t)
  }, [img])
  useEffect(() => {
    const h = () => setOpen(true)
    window.addEventListener("agenda:autostyle", h)
    return () => window.removeEventListener("agenda:autostyle", h)
  }, [])
  return (
    <>
      <AnimatePresence>
        {ask && !open && (
          <motion.div
            data-modal
            className="surface fixed top-5 left-1/2 z-[4000] flex w-[440px] -translate-x-1/2 items-center gap-3 p-3"
            initial={{ opacity: 0, y: -20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }}
          >
            <img src={mediaUrl(ask)} className="h-12 w-20 shrink-0 rounded-lg object-cover" draggable={false} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Personalizar tudo por esta foto?</div>
              <div className="text-xs text-fg-muted">Cores, fontes, cursor, relógio e widgets combinando com ela.</div>
            </div>
            <button className="btn btn-accent shrink-0 !py-1.5 text-sm" onClick={() => { setOpen(true); setAsk(null) }}><WandSparkles size={14} /> Personalizar</button>
            <button className="btn btn-ghost btn-icon shrink-0 !p-1" onClick={() => setAsk(null)} title="Agora não"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <AutoStyle open={open} onClose={() => setOpen(false)} />
    </>
  )
}
