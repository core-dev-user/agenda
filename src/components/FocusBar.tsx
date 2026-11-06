import { AnimatePresence, motion } from "framer-motion"
import { Pause, X } from "lucide-react"
import { useStore, DEFAULT_FOCUS } from "@/lib/store"
import { useNow } from "@/widgets/Clock"

export const useFocusActive = () => {
  const running = useStore((s) => !!s.studyTimer?.startedAt)
  const manual = useStore((s) => s.focusManual)
  const auto = useStore((s) => s.settings.focus?.auto ?? DEFAULT_FOCUS.auto)
  return manual || (auto && running)
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const z = (n: number) => String(n).padStart(2, "0")
  return `${Math.floor(s / 3600)}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}`
}

/** pílula no topo enquanto o modo foco está ligado */
export function FocusBar() {
  const active = useFocusActive()
  const timer = useStore((s) => s.studyTimer)
  const subject = useStore((s) => s.subjects.find((x) => x.id === s.studyTimer?.subjectId))
  const now = useNow(1000)
  const elapsed = timer ? timer.elapsed + (timer.startedAt ? now.getTime() - timer.startedAt : 0) : 0
  const stop = () => {
    const s = useStore.getState()
    useStore.setState({ focusManual: false })
    if (s.studyTimer?.startedAt) s.set("studyTimer", { ...s.studyTimer, elapsed: s.studyTimer.elapsed + Date.now() - s.studyTimer.startedAt, startedAt: null })
  }
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="surface fixed top-3 left-1/2 z-[850] flex -translate-x-1/2 items-center gap-3 !rounded-full py-1.5 pr-1.5 pl-4 text-sm"
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60" /><span className="relative h-2.5 w-2.5 rounded-full bg-brand" /></span>
          <span className="font-semibold">Modo foco</span>
          {subject && <span className="text-fg-muted">{subject.emoji} {subject.name}</span>}
          {timer?.startedAt && <span className="font-num">{fmt(elapsed)}</span>}
          <button className="btn !rounded-full !py-1 text-xs" onClick={stop} title={timer?.startedAt ? "Pausa o cronômetro de estudo e sai do foco" : "Sair do foco"}>
            {timer?.startedAt ? <><Pause size={12} /> Pausar</> : <><X size={12} /> Sair</>}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
