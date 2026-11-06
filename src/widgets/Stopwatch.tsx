import { useEffect, useState } from "react"
import { Flag, Pause, Play, RotateCcw, Timer, Watch } from "lucide-react"
import { useStore } from "@/lib/store"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

const fmt = (ms: number, cs = true) => {
  const neg = ms < 0
  ms = Math.abs(ms)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const c = Math.floor((ms % 1000) / 10)
  const z = (n: number) => String(n).padStart(2, "0")
  return (neg ? "-" : "") + (h ? `${h}:` : "") + `${z(m)}:${z(s)}` + (cs ? `.${z(c)}` : "")
}

function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.2, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.22)
    })
  } catch {}
}

/** Cronômetro e timer. O estado fica salvo, então continua contando mesmo após fechar o app. */
export function StopwatchWidget({ w }: { w: Widget }) {
  const upd = useStore((s) => s.updateWidgetConfig)
  const { mode = "stopwatch", startedAt = null, acc = 0, laps = [] as number[], duration = 25 * 60000, alerted = false } = w.config
  const [, force] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => force((x) => x + 1), 33)
    return () => clearInterval(id)
  }, [startedAt])

  const elapsed = acc + (startedAt ? Date.now() - startedAt : 0)
  const remaining = duration - elapsed
  const running = !!startedAt

  useEffect(() => {
    if (mode === "timer" && running && remaining <= 0 && !alerted) {
      beep()
      upd(w.id, { alerted: true })
    }
  })

  const toggle = () => (running ? upd(w.id, { startedAt: null, acc: elapsed }) : upd(w.id, { startedAt: Date.now(), alerted: false }))
  const reset = () => upd(w.id, { startedAt: null, acc: 0, laps: [], alerted: false })
  const lap = () => upd(w.id, { laps: [elapsed, ...laps].slice(0, 20) })
  const scale = Math.min(w.w / 300, w.h / 200)
  const progress = mode === "timer" ? Math.max(0, Math.min(1, elapsed / duration)) : 0

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["stopwatch", "timer"] as const).map((m) => (
            <button key={m} onClick={() => upd(w.id, { mode: m, startedAt: null, acc: 0, laps: [] })} className={cn("btn btn-ghost px-2 py-0.5 text-xs", mode === m && "!bg-brand/30")}>
              {m === "stopwatch" ? <><Watch size={12} /> Cronômetro</> : <><Timer size={12} /> Timer</>}
            </button>
          ))}
        </div>
        {mode === "timer" && !running && elapsed === 0 && (
          <select className="field py-0.5 text-xs" value={duration} onChange={(e) => upd(w.id, { duration: Number(e.target.value) })}>
            {[1, 5, 10, 15, 25, 30, 45, 60, 90].map((m) => <option key={m} value={m * 60000}>{m} min</option>)}
          </select>
        )}
      </div>
      <div className="relative flex flex-1 items-center justify-center">
        {mode === "timer" && (
          <div className="absolute inset-x-0 bottom-1 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]">
            <div className="h-full bg-brand transition-[width]" style={{ width: progress * 100 + "%" }} />
          </div>
        )}
        <div className={cn("font-num font-semibold tracking-tight", mode === "timer" && remaining <= 0 && "animate-pulse text-red-400")} style={{ fontSize: 46 * scale }}>
          {mode === "timer" ? fmt(Math.max(0, remaining), false) : fmt(elapsed)}
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <button className="btn btn-accent" onClick={toggle}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pausar" : "Iniciar"}</button>
        {mode === "stopwatch" && <button className="btn btn-icon" onClick={lap} disabled={!running} title="Volta"><Flag size={15} /></button>}
        <button className="btn btn-icon" onClick={reset} title="Zerar"><RotateCcw size={15} /></button>
      </div>
      {mode === "stopwatch" && laps.length > 0 && w.h > 240 && (
        <div className="mt-3 flex-1 overflow-auto text-sm">
          {laps.map((l: number, i: number) => (
            <div key={i} className="flex justify-between border-b border-line py-1 font-num">
              <span className="text-fg-muted">Volta {laps.length - i}</span>
              <span>{fmt(l)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
