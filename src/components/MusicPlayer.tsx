import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import { motion } from "framer-motion"
import { Heart, Music2, Pause, Play, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react"
import { bridge, isDesktop, type MusicState } from "@/lib/bridge"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"

/* ---------------- estado global do player (alimentado pelo processo principal) ---------------- */
export const useMusic = create<MusicState & { at: number }>(() => ({ open: false, at: 0 }))
bridge.music.onState((s) => useMusic.setState({ ...s, at: performance.now() }, true))

/** Tempo atual interpolado localmente entre as atualizações (barra de progresso suave). */
export function useMusicTime() {
  const m = useMusic()
  const [, force] = useState(0)
  useEffect(() => {
    if (!m.playing) return
    const id = setInterval(() => force((x) => x + 1), 200)
    return () => clearInterval(id)
  }, [m.playing])
  const t = (m.time ?? 0) + (m.playing ? (performance.now() - m.at) / 1000 : 0)
  return Math.min(t, m.duration || t)
}

export const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}

const cmd = bridge.music.cmd

/* ---------------- peças ---------------- */
export function Artwork({ size, round, spinning, className }: { size: number; round?: boolean; spinning?: boolean; className?: string }) {
  const art = useMusic((s) => s.art)
  if (round)
    return (
      <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "repeating-radial-gradient(circle at center, #111 0 2px, #1c1c1c 2px 4px)",
            boxShadow: "0 10px 30px rgb(0 0 0 / .55), inset 0 0 0 2px rgb(255 255 255 / .05)",
            animation: "vinyl-spin 4s linear infinite",
            animationPlayState: spinning ? "running" : "paused",
          }}
        >
          <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 30deg, transparent 0 12%, rgb(255 255 255 / .12) 16%, transparent 22% 62%, rgb(255 255 255 / .08) 66%, transparent 72%)" }} />
          <div className="absolute inset-[32%] overflow-hidden rounded-full border-2 border-black/60 bg-brand">
            {art ? <img src={art} className="h-full w-full object-cover" draggable={false} /> : <Music2 className="m-auto h-full w-1/2 text-white/80" />}
          </div>
          <div className="absolute top-1/2 left-1/2 h-[6%] w-[6%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0b0b0b]" />
        </div>
      </div>
    )
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-[calc(var(--r)*0.55)]", className)} style={{ width: size, height: size, boxShadow: "0 10px 26px -8px rgb(0 0 0 / .6)" }}>
      {art ? (
        <img src={art} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#ff5c7a] to-[#7a2a5c]"><Music2 className="text-white/90" size={size * 0.4} /></div>
      )}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(160deg, rgb(255 255 255 / .22), transparent 45%)" }} />
    </div>
  )
}

export function Controls({ big, extra }: { big?: boolean; extra?: boolean }) {
  const m = useMusic()
  const s = big ? 22 : 16
  return (
    <div className="flex items-center justify-center gap-1.5">
      {extra && <button className="btn btn-ghost btn-icon" title="Aleatório" onClick={() => cmd("shuffle")}><Shuffle size={s - 4} /></button>}
      <button className="btn btn-ghost btn-icon" title="Anterior" onClick={() => cmd("prev")}><SkipBack size={s} fill="currentColor" /></button>
      <motion.button
        whileTap={{ scale: 0.88 }}
        title={m.playing ? "Pausar" : "Tocar"}
        onClick={() => cmd("toggle")}
        className="btn btn-accent btn-icon !rounded-full"
        style={{ width: big ? 58 : 38, height: big ? 58 : 38 }}
      >
        {m.playing ? <Pause size={s} fill="currentColor" /> : <Play size={s} fill="currentColor" className="translate-x-[1px]" />}
      </motion.button>
      <button className="btn btn-ghost btn-icon" title="Próxima" onClick={() => cmd("next")}><SkipForward size={s} fill="currentColor" /></button>
      {extra && (
        <button className={cn("btn btn-ghost btn-icon", m.liked && "text-[#ff5c7a]")} title="Gostei" onClick={() => cmd("like")}>
          <Heart size={s - 4} fill={m.liked ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  )
}

export function Progress({ compact }: { compact?: boolean }) {
  const m = useMusic()
  const t = useMusicTime()
  const d = m.duration || 0
  const pct = d ? (t / d) * 100 : 0
  return (
    <div className="w-full">
      <div
        className="group relative h-1.5 cursor-pointer rounded-full bg-[color-mix(in_srgb,var(--fg)_15%,transparent)]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (d) cmd("seek", ((e.clientX - r.left) / r.width) * d)
        }}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: pct + "%" }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100" style={{ left: pct + "%" }} />
      </div>
      {!compact && (
        <div className="font-num mt-1 flex justify-between text-[11px] text-fg-muted">
          <span>{fmtTime(t)}</span>
          <span>{fmtTime(d)}</span>
        </div>
      )}
    </div>
  )
}

export function VolumeControl() {
  const vol = useMusic((s) => s.volume ?? 100)
  const [v, setV] = useState(vol)
  useEffect(() => setV(vol), [vol])
  const Icon = v === 0 ? VolumeX : v < 50 ? Volume1 : Volume2
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost btn-icon" onClick={() => cmd("volume", v === 0 ? 60 : 0)}><Icon size={16} /></button>
      <input type="range" min={0} max={100} value={v} className="agenda-range w-28" style={{ ["--pct" as any]: v + "%" }} onChange={(e) => { setV(Number(e.target.value)); cmd("volume", Number(e.target.value)) }} />
    </div>
  )
}

/** Volume compacto: ícone (clique = mudo, roda do mouse = ajusta) + barra que abre ao passar o mouse. */
export function MiniVolume({ className, alwaysOpen }: { className?: string; alwaysOpen?: boolean }) {
  const vol = useMusic((s) => s.volume ?? 100)
  const [v, setV] = useState(vol)
  const lastSet = useRef(0)
  const before = useRef(60)
  // ignora o eco atrasado do player logo depois de mexer (senão a barra "pula" de volta)
  useEffect(() => { if (performance.now() - lastSet.current > 1500) setV(vol) }, [vol])
  const set = (x: number) => {
    x = Math.max(0, Math.min(100, Math.round(x)))
    if (x > 0) before.current = x
    lastSet.current = performance.now()
    setV(x)
    cmd("volume", x)
  }
  const Icon = v === 0 ? VolumeX : v < 50 ? Volume1 : Volume2
  return (
    <div
      className={cn("group/vol flex items-center", className)}
      onWheel={(e) => { e.stopPropagation(); set(v - Math.sign(e.deltaY) * 5) }}
      title={`Volume ${v}% (role o mouse para ajustar)`}
    >
      <button className="btn btn-ghost btn-icon !p-1.5" onClick={() => set(v === 0 ? before.current : 0)}><Icon size={15} /></button>
      <div className={cn("overflow-hidden transition-all duration-300", alwaysOpen ? "w-20 opacity-100" : "w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100")}>
        <input
          type="range" min={0} max={100} value={v}
          className="agenda-range mx-1 w-[72px]"
          style={{ ["--pct" as any]: v + "%" }}
          onChange={(e) => set(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

let viewerSeq = 0
/**
 * Clipe ao vivo: recebe os quadros do vídeo que toca na janela (escondida) do YouTube Music.
 * Some suavemente quando não há vídeo chegando (ex.: pausado há muito tempo ou desconectado).
 */
export function MusicVideo({ quality = 640, className, fit = "cover", onLive }: { quality?: number; className?: string; fit?: "cover" | "contain"; onLive?: (live: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  useEffect(() => { onLive?.(live) }, [live])
  useEffect(() => {
    const id = "v" + ++viewerSeq
    bridge.music.video(id, true, quality)
    let last = 0
    let pending = false
    const img = new Image()
    const off = bridge.music.onFrame(async ({ url, w, h }) => {
      if (pending) return
      pending = true
      try {
        img.src = url
        await img.decode()
        const c = ref.current
        if (c) {
          if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
          c.getContext("2d")!.drawImage(img, 0, 0)
          last = performance.now()
          setLive(true)
        }
      } catch {}
      pending = false
    })
    const chk = setInterval(() => {
      // pausado não manda quadros novos: só esconde se nunca chegou nada
      if (!last) setLive(false)
    }, 1500)
    return () => { off(); clearInterval(chk); bridge.music.video(id, false) }
  }, [quality])
  return <canvas ref={ref} className={cn("transition-opacity duration-700", live ? "opacity-100" : "opacity-0", className)} style={{ objectFit: fit }} />
}

export function NotConnected({ small }: { small?: boolean }) {
  const open = useMusic((s) => s.open)
  const openWindow = useStore((s) => s.openWindow)
  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-2 text-center", small ? "p-3" : "p-8")}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff0033] text-white shadow-lg"><Play size={22} fill="currentColor" className="translate-x-[1px]" /></div>
      <div className={cn("font-display font-semibold", small ? "text-sm" : "text-xl")}>{open ? "Escolha uma música" : "YouTube Music"}</div>
      {!small && <div className="max-w-sm text-sm text-fg-muted">{open ? "Toque algo no YouTube Music (aba Música) e o player aparece aqui." : "Conecte uma vez com sua conta Google. Depois a música toca em segundo plano e você controla tudo pelo Widgy."}</div>}
      <button className="btn btn-accent" disabled={!isDesktop} onClick={() => { bridge.music.open(); openWindow("music") }}>Abrir YouTube Music</button>
    </div>
  )
}
