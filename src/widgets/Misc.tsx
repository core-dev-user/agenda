import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, ImagePlus } from "lucide-react"
import { useStore } from "@/lib/store"
import { mediaUrl } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn, MONTHS, todayISO } from "@/lib/utils"
import { frameImgStyle, type Frame } from "@/components/ImageFramer"

/* ------------------- Quadro de fotos ------------------- */
/** espaço extra que cada moldura ocupa (para calcular o tamanho ideal do quadro) */
export const PHOTO_FRAME_PAD: Record<string, { w: number; h: number }> = { none: { w: 0, h: 0 }, polaroid: { w: 24, h: 52 }, film: { w: 48, h: 24 } }

/** fotos do quadro: da galeria ligada a ele, ou só dele */
export function usePhotoSource(c: Record<string, any>) {
  const gal = useStore((s) => (c.gallery ? s.photoGalleries.find((g) => g.id === c.gallery) : undefined))
  return { gal, ids: (gal ? gal.ids : c.ids ?? []) as string[], frames: (gal ? gal.frames : c.frames ?? {}) as Record<string, Partial<Frame>> }
}

export function PhotoWidget({ w, onConfigure, onAspect }: { w: Widget; onConfigure: () => void; onAspect?: (a: number | null) => void }) {
  const media = useStore((s) => s.media)
  const { interval = 8, fit = "cover", frame = "none", effect = "fade" } = w.config
  const { ids, frames } = usePhotoSource(w.config)
  const pics = ids.map((id: string) => media.find((m) => m.id === id)).filter(Boolean) as typeof media
  const [i, setI] = useState(0)
  useEffect(() => {
    if (pics.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % pics.length), interval * 1000)
    return () => clearInterval(t)
  }, [pics.length, interval])
  const cur = pics[i % Math.max(1, pics.length)]

  // informa o formato da foto atual: o quadro se ajusta a ela com transição
  const aspect = cur && cur.width && cur.height ? cur.width / cur.height : null
  useEffect(() => { onAspect?.(aspect) }, [aspect])

  if (!cur) return <GalleryChooser w={w} onNew={onConfigure} />

  const variants = {
    fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
    zoom: { initial: { opacity: 0, scale: 1.15 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 } },
    flip: { initial: { rotateY: 90, opacity: 0 }, animate: { rotateY: 0, opacity: 1 }, exit: { rotateY: -90, opacity: 0 } },
    slide: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "-100%" } },
  }[effect as "fade"]

  return (
    <div className={cn("relative h-full w-full", frame === "polaroid" && "bg-[#fbfaf7] p-3 pb-10 shadow-inner", frame === "film" && "bg-black px-6 py-3")} style={{ perspective: 800, borderRadius: "inherit" }}>
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: frame === "none" ? "inherit" : 4 }}>
        <AnimatePresence initial={false} mode={effect === "slide" ? "sync" : "popLayout"}>
          <motion.div key={cur.id} className="absolute inset-0 overflow-hidden" transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }} {...variants}>
            <img src={mediaUrl(cur.file)} className="h-full w-full" style={frameImgStyle(frames[cur.id], fit)} draggable={false} />
          </motion.div>
        </AnimatePresence>
      </div>
      {frame === "polaroid" && <div className="absolute inset-x-0 bottom-2 text-center text-[#444]" style={{ fontFamily: "'Dancing Script Variable', cursive", fontSize: 18 }}>{w.config.caption || cur.name}</div>}
      {frame === "film" && (
        <>
          {[0, 1].map((side) => (
            <div key={side} className="absolute top-0 flex h-full flex-col justify-around py-1" style={{ [side ? "right" : "left"]: 6 } as any}>
              {Array.from({ length: Math.floor(w.h / 22) }, (_, k) => <div key={k} className="h-2.5 w-3 rounded-[2px] bg-white/80" />)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** quadro vazio: escolher uma galeria pronta ou montar uma nova */
function GalleryChooser({ w, onNew }: { w: Widget; onNew: () => void }) {
  const galleries = useStore((s) => s.photoGalleries)
  const media = useStore((s) => s.media)
  const upd = useStore((s) => s.updateWidgetConfig)
  if (!galleries.length)
    return (
      <button onClick={onNew} className="flex h-full w-full flex-col items-center justify-center gap-2 text-fg-muted hover:text-fg">
        <ImagePlus size={32} />
        <span className="text-sm">Escolher fotos</span>
      </button>
    )
  return (
    <div className="flex h-full flex-col gap-2 p-3" data-nodrag>
      <div className="text-sm font-semibold">Escolha uma galeria</div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pr-0.5">
        {galleries.map((g) => {
          const covers = g.ids.map((id) => media.find((m) => m.id === id)).filter(Boolean).slice(0, 3) as typeof media
          return (
            <button key={g.id} onClick={() => upd(w.id, { gallery: g.id })} className="group overflow-hidden rounded-xl border border-line text-left transition-transform hover:-translate-y-0.5">
              <div className="relative h-20 bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]">
                {covers.map((m, i) => (
                  <img key={m.id} src={mediaUrl(m.file)} className="absolute h-full w-[60%] rounded-md object-cover shadow-md" style={{ left: `${i * 20}%`, zIndex: 3 - i, transform: `rotate(${(i - 1) * 4}deg) scale(${1 - i * 0.06})` }} draggable={false} />
                ))}
              </div>
              <div className="px-2 py-1.5"><div className="truncate text-xs font-semibold">{g.name}</div><div className="text-[10px] text-fg-muted">{g.ids.length} foto{g.ids.length === 1 ? "" : "s"}</div></div>
            </button>
          )
        })}
        <button onClick={onNew} className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-fg-muted hover:text-fg"><ImagePlus size={20} /> Nova galeria</button>
      </div>
    </div>
  )
}

/* ------------------- Calendário ------------------- */
export function CalendarWidget({ w }: { w: Widget }) {
  const [ref, setRef] = useState(() => new Date())
  const habits = useStore((s) => s.habits)
  const log = useStore((s) => s.habitLog)
  const open = useStore((s) => s.openWindow)
  const tasks = useStore((s) => s.tasks)
  const taskDays = new Set(w.config.taskDots ? tasks.filter((t) => !t.done && t.date).map((t) => t.date!) : [])
  // eventos da agenda do Google (quando conectada)
  const calEvents = useStore((s) => s.calEvents)
  const evDays = new Map<string, string>()
  for (const e of calEvents) evDays.set(todayISO(new Date(e.start)), e.color)
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const today = todayISO()
  const active = habits.filter((h) => !h.archived)
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <button aria-label="Mês anterior" className="btn btn-ghost btn-icon" onClick={() => setRef(new Date(y, m - 1, 1))}><ChevronLeft size={14} /></button>
        <button className="font-display font-semibold" onClick={() => open("habits")}>{MONTHS[m]} {y}</button>
        <button aria-label="Próximo mês" className="btn btn-ghost btn-icon" onClick={() => setRef(new Date(y, m + 1, 1))}><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] tracking-wider text-fg-muted uppercase">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid flex-1 grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
          const done = (log[iso] ?? []).filter((id) => active.some((h) => h.id === id)).length
          const pct = active.length ? done / active.length : 0
          return (
            <div key={i} className={cn("font-num relative flex flex-col items-center justify-center rounded-lg text-sm", iso === today && "bg-brand font-bold text-white shadow-lg")}>
              {d}
              {pct > 0 && iso !== today && <div className="absolute bottom-0.5 h-1 rounded-full bg-brand" style={{ width: `${20 + pct * 50}%`, opacity: 0.4 + pct * 0.6 }} />}
              {evDays.has(iso) && <div className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background: iso === today ? "#fff" : evDays.get(iso) }} title="Tem evento na agenda" />}
              {taskDays.has(iso) && <div className={cn("absolute top-1 right-1 h-1.5 w-1.5 rounded-full", iso === today ? "bg-white" : "bg-[#ffd36e]")} title="Tem tarefa" />}
            </div>
          )
        })}
      </div>
      {w.h > 320 && active.length > 0 && (
        <div className="mt-2 text-xs text-fg-muted">Hoje: {(log[today] ?? []).length}/{active.length} hábitos</div>
      )}
    </div>
  )
}

/* ------------------- Nota ------------------- */
export function NoteWidget({ w }: { w: Widget }) {
  const upd = useStore((s) => s.updateWidgetConfig)
  return (
    <textarea
      value={w.config.text ?? ""}
      onChange={(e) => upd(w.id, { text: e.target.value })}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder="Escreva algo…"
      className="h-full w-full resize-none bg-transparent p-4 outline-none placeholder:text-fg-muted"
      style={{ fontFamily: w.config.font ? undefined : "var(--font-ui)", fontSize: w.config.size ?? 16, color: w.config.color }}
    />
  )
}
