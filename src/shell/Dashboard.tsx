import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CloudSun, Cpu, Droplets, HardDrive, LayoutDashboard, MemoryStick,
  Music2, Pause, Play, SkipBack, SkipForward, Thermometer, Wind, Gauge as GaugeIcon, MonitorSmartphone,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, type PcMedia, type SysStats } from "@/lib/bridge"
import { useNow } from "@/widgets/Clock"
import { LABEL, WxIcon, loadWeather, type Wx } from "@/widgets/Weather"
import { useLyrics, lineAt } from "@/lib/lyrics"
import { rafLoop } from "@/lib/perf"
import { Logo } from "@/components/Logo"
import { ensureFont, fontFamily } from "@/lib/fonts"

/** fonte condensada só do relógio grande do painel */
const CLOCK_FONT = "gf-bebas-neue"
import { cn } from "@/lib/utils"
import { useShell, type DashTab } from "./pack"

const TABS: { id: DashTab; label: string; icon: typeof Cpu }[] = [
  { id: "dash", label: "Painel", icon: LayoutDashboard },
  { id: "media", label: "Mídia", icon: Music2 },
  { id: "perf", label: "Desempenho", icon: GaugeIcon },
  { id: "weather", label: "Clima", icon: CloudSun },
]

/* ───────────────────────────── dados ───────────────────────────── */

/** música tocando no PC (Spotify e outros, pela central de mídia do Windows) */
function useMedia() {
  const [m, setM] = useState<PcMedia | null>(null)
  const [at, setAt] = useState(performance.now())
  const [now, setNow] = useState(performance.now())
  useEffect(() => {
    const id = "carbono-dash"
    let alive = true
    const got = (s: PcMedia) => { if (alive && s.widgetId === id) { setM(s); setAt(performance.now()) } }
    const off = bridge.pcmedia.onState(got)
    void bridge.pcmedia.sub(id, "").then((s) => s && got(s)).catch(() => {})
    return () => { alive = false; off(); void bridge.pcmedia.unsub(id) }
  }, [])
  useEffect(() => {
    if (!m?.playing) return
    const t = window.setInterval(() => setNow(performance.now()), 500)
    return () => clearInterval(t)
  }, [m?.playing])
  const pos = m?.pos != null ? Math.min(m.dur || Infinity, m.pos + (m.playing ? (now - at) / 1000 : 0)) : 0
  const cmd = (c: "toggle" | "next" | "prev" | "seek", s?: number) => { void bridge.pcmedia.cmd(c, "carbono-dash", s) }
  return { m: m && !m.none && m.title ? m : null, pos, cmd }
}

function useSys() {
  const [s, setS] = useState<SysStats | null>(null)
  useEffect(() => {
    const off = bridge.sysmon.onData(setS)
    void bridge.sysmon.sub("carbono-dash")
    return () => { off(); void bridge.sysmon.unsub("carbono-dash") }
  }, [])
  return s
}

function useWeather() {
  const city = useStore((s) => s.settings.weatherCity)
  const [wx, setWx] = useState<Wx | null>(null)
  useEffect(() => { let a = true; loadWeather(city).then((w) => a && setWx(w)).catch(() => {}); return () => { a = false } }, [city])
  return wx
}

const fmt = (s = 0) => { const v = Math.max(0, Math.floor(s)); return Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0") }
const gb = (b: number) => (b / 1024 ** 3).toFixed(b > 100 * 1024 ** 3 ? 0 : 1)
const rate = (b: number) => (b > 1024 ** 2 ? (b / 1024 ** 2).toFixed(1) + " MB/s" : Math.round(b / 1024) + " KB/s")
const appLabel = (id = "") => {
  const a = id.toLowerCase()
  return a.includes("spotify") ? "Spotify" : a.includes("chrome") ? "Chrome" : a.includes("msedge") ? "Edge" : a.includes("firefox") ? "Firefox" : a.includes("deezer") ? "Deezer" : a.includes("apple") ? "Apple Music" : id.split(/[!\\.]/)[0] || "Player"
}

/* ───────────────────────────── painel ───────────────────────────── */

export function Dashboard() {
  const tab = useShell((s) => s.tab)
  return (
    <div className="w-[min(860px,calc(100vw-120px))] px-4 pb-4">
      <div className="relative flex border-b" style={{ borderColor: "var(--sh-line)" }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => useShell.setState({ tab: t.id })}
            className="relative flex flex-1 flex-col items-center gap-1 pb-2.5 pt-2 text-[11px] font-medium transition-colors"
            style={{ color: tab === t.id ? "var(--sh-fg)" : "var(--sh-muted)" }}>
            <t.icon size={15} />
            {t.label}
            {tab === t.id && <motion.span layoutId="sh-tab" className="absolute -bottom-px left-[30%] right-[30%] h-[3px] rounded-t-full" style={{ background: "var(--sh-accent)" }} transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          </button>
        ))}
      </div>
      <motion.div layout transition={{ type: "spring", stiffness: 380, damping: 36 }} className="pt-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            {tab === "dash" && <DashTab />}
            {tab === "media" && <MediaTab />}
            {tab === "perf" && <PerfTab />}
            {tab === "weather" && <WeatherTab />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function DashTab() {
  const wx = useWeather()
  const sys = useSys()
  const media = useMedia()
  const now = useNow(1000)
  useEffect(() => { void ensureFont(CLOCK_FONT) }, [])
  const nick = useStore((s) => s.settings.nick) || "Você"
  const up = sys?.uptime ?? 0
  const upText = up >= 3600 ? `${Math.floor(up / 3600)} h ${Math.floor((up % 3600) / 60)} min` : `${Math.floor(up / 60)} min`
  const memPct = sys ? (sys.mem.used / sys.mem.total) * 100 : 0
  const disk = sys?.drives?.[0]
  const diskPct = disk ? ((disk.size - disk.free) / disk.size) * 100 : 0

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "168px minmax(0,1fr) 64px 190px", gridTemplateRows: "auto 1fr" }}>
      <div className="sh-card flex items-center gap-3 px-4 py-3">
        {wx ? <WxIcon code={wx.code} day={wx.isDay} size={38} /> : <CloudSun size={30} style={{ color: "var(--sh-muted)" }} />}
        <div className="min-w-0">
          <div className="text-[22px] font-semibold leading-none tabular-nums">{wx ? Math.round(wx.temp) + "°" : "--°"}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-tight" style={{ color: "var(--sh-muted)" }}>{wx ? LABEL(wx.code) : "Carregando"}</div>
        </div>
      </div>
      <div className="sh-card flex items-center gap-3.5 px-4 py-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--sh-2)" }}><Logo size={26} glyphOnly /></span>
        <div className="min-w-0 space-y-1 text-[12px]">
          <div className="flex items-center gap-2"><span className="font-semibold" style={{ color: "var(--sh-fg)" }}>{nick}</span></div>
          <div className="flex items-center gap-1.5 truncate" style={{ color: "var(--sh-muted)" }}><MonitorSmartphone size={12} /> {sys?.cpu.name ?? "Windows"}</div>
          <div className="flex items-center gap-1.5" style={{ color: "var(--sh-muted)" }}><span className="size-1.5 rounded-full" style={{ background: "var(--sh-accent)" }} /> ligado há {upText}</div>
        </div>
      </div>
      <div className="sh-card row-span-2 flex flex-col items-center justify-around py-3">
        <Ring value={sys?.cpu.usage ?? 0} size={46} stroke={4} icon={<Cpu size={13} />} title="Processador" />
        <Ring value={memPct} size={46} stroke={4} icon={<MemoryStick size={13} />} title="Memória" />
        <Ring value={diskPct} size={46} stroke={4} icon={<HardDrive size={13} />} title="Disco" />
      </div>
      <MiniPlayer {...media} />
      <div className="sh-card flex flex-col items-center justify-center py-4 leading-[.9]" style={{ fontFamily: fontFamily(CLOCK_FONT) }}>
        <span className="text-[52px] tabular-nums">{String(now.getHours()).padStart(2, "0")}</span>
        <span className="my-1 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1 rounded-full" style={{ background: "var(--sh-accent)" }} />)}</span>
        <span className="text-[52px] tabular-nums">{String(now.getMinutes()).padStart(2, "0")}</span>
        <span className="mt-2 text-[11px] font-medium tracking-wide" style={{ fontFamily: "var(--font-ui)", color: "var(--sh-muted)" }}>
          {now.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}
        </span>
      </div>
      <Calendar />
    </div>
  )
}

function Calendar() {
  const today = new Date()
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [view])
  const events = useStore((s) => s.calEvents)
  const hasEvent = (d: Date) => events.some((e) => { const s = new Date(e.start); return s.toDateString() === d.toDateString() })
  const shift = (n: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1))
  return (
    <div className="sh-card px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <button type="button" className="sh-btn size-7" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft size={14} /></button>
        <button type="button" className="text-[12.5px] font-medium" onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))}>
          {(() => { const t = view.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1) })()}
        </button>
        <button type="button" className="sh-btn size-7" aria-label="Próximo mês" onClick={() => shift(1)}><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10.5px] tabular-nums">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i} className="pb-1 font-medium" style={{ color: "var(--sh-dim)" }}>{d}</span>)}
        {days.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString()
          const out = d.getMonth() !== view.getMonth()
          return (
            <span key={i} className="relative mx-auto flex size-6 items-center justify-center rounded-full"
              style={{ background: isToday ? "var(--sh-accent)" : undefined, color: isToday ? "#141414" : out ? "var(--sh-dim)" : "var(--sh-fg)", fontWeight: isToday ? 600 : 400 }}>
              {d.getDate()}
              {!isToday && hasEvent(d) && <span className="absolute bottom-0.5 size-[3px] rounded-full" style={{ background: "var(--sh-accent)" }} />}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function MiniPlayer({ m, pos, cmd }: ReturnType<typeof useMedia>) {
  const pct = m?.dur ? Math.min(100, (pos / m.dur) * 100) : 0
  return (
    <div className="sh-card row-span-2 flex flex-col items-center px-4 py-4 text-center">
      <Spikes art={m?.art} playing={!!m?.playing} size={118} />
      <div className="mt-3 w-full truncate text-[13px] font-semibold">{m?.title ?? "Nada tocando"}</div>
      <div className="w-full truncate text-[11px]" style={{ color: "var(--sh-muted)" }}>{m?.artist || (m ? "" : "Toque algo no Spotify")}</div>
      <div className="mt-auto w-full pt-3">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--sh-3)" }}>
          <div className="h-full rounded-full" style={{ width: pct + "%", background: "var(--sh-accent)" }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums" style={{ color: "var(--sh-dim)" }}><span>{fmt(pos)}</span><span>{fmt(m?.dur)}</span></div>
      </div>
      <div className="flex items-center gap-1 pt-2">
        <button type="button" className="sh-btn size-8" aria-label="Anterior" disabled={!m} onClick={() => cmd("prev")}><SkipBack size={14} fill="currentColor" /></button>
        <button type="button" aria-label={m?.playing ? "Pausar" : "Tocar"} disabled={!m} onClick={() => cmd("toggle")}
          className="flex h-8 w-12 items-center justify-center rounded-full transition-transform active:scale-90" style={{ background: "var(--sh-fg)", color: "#141414" }}>
          {m?.playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="translate-x-px" />}
        </button>
        <button type="button" className="sh-btn size-8" aria-label="Próxima" disabled={!m} onClick={() => cmd("next")}><SkipForward size={14} fill="currentColor" /></button>
      </div>
    </div>
  )
}

/* ───────────────────────────── mídia ───────────────────────────── */

function MediaTab() {
  const { m, pos, cmd } = useMedia()
  const lyrics = useLyrics(m?.title, m?.artist, m?.dur, !!m)
  const lines = lyrics && lyrics.synced ? lyrics.synced : null
  const cur = lines ? lineAt(lines, pos + 0.3) : -1
  const lyricBox = useRef<HTMLDivElement>(null)
  useEffect(() => { lyricBox.current?.querySelector(`[data-l="${cur}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }) }, [cur])

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "230px minmax(0,1fr) 250px" }}>
      <div className="flex items-center justify-center py-2">
        <Spikes art={m?.art} playing={!!m?.playing} size={196} />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1 py-2">
        <div className="truncate text-[22px] font-semibold tracking-[-.01em]">{m?.title ?? "Nada tocando"}</div>
        <div className="truncate text-[13px]" style={{ color: "var(--sh-muted)" }}>{m?.artist || "Abra o Spotify ou outro player"}</div>
        {m?.album && m.album !== m.title && <div className="truncate text-[12px]" style={{ color: "var(--sh-dim)" }}>{m.album}</div>}
        <div className="mt-4 flex items-center gap-3 text-[11px] tabular-nums" style={{ color: "var(--sh-muted)" }}>
          <span>{fmt(pos)}</span>
          <WaveProgress value={m?.dur ? pos / m.dur : 0} playing={!!m?.playing} onSeek={m?.canSeek && m.dur ? (p) => cmd("seek", p * m.dur!) : undefined} />
          <span>{fmt(m?.dur)}</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <button type="button" className="sh-btn size-10" aria-label="Anterior" disabled={!m || m.canPrev === false} onClick={() => cmd("prev")}><SkipBack size={17} fill="currentColor" /></button>
          <motion.button type="button" aria-label={m?.playing ? "Pausar" : "Tocar"} disabled={!m} onClick={() => cmd("toggle")}
            animate={{ width: m?.playing ? 64 : 48, borderRadius: m?.playing ? 16 : 24 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="flex h-12 items-center justify-center" style={{ background: "var(--sh-fg)", color: "#141414" }}>
            {m?.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
          </motion.button>
          <button type="button" className="sh-btn size-10" aria-label="Próxima" disabled={!m || m.canNext === false} onClick={() => cmd("next")}><SkipForward size={17} fill="currentColor" /></button>
        </div>
      </div>
      <div className="sh-card flex min-h-[230px] flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[12px] font-semibold"><Music2 size={13} /> Letra</div>
        <div ref={lyricBox} className="sh-scroll relative flex-1 overflow-y-auto px-4 pb-3 text-[12.5px] leading-relaxed" style={{ maskImage: "linear-gradient(transparent, #000 18%, #000 82%, transparent)" }}>
          <div className="h-12" />
          {!m && <p style={{ color: "var(--sh-dim)" }}>A letra aparece aqui quando uma música tocar.</p>}
          {m && lyrics === null && <p style={{ color: "var(--sh-dim)" }}>Procurando a letra…</p>}
          {m && lyrics === false && <p style={{ color: "var(--sh-dim)" }}>Letra não encontrada para esta música.</p>}
          {lines?.map((l, i) => (
            <p key={i} data-l={i} className="py-0.5 transition-colors duration-300" style={{ color: i === cur ? "var(--sh-fg)" : i < cur ? "var(--sh-dim)" : "var(--sh-muted)", fontWeight: i === cur ? 600 : 400 }}>{l.text || "♪"}</p>
          ))}
          {lyrics && !lines && lyrics.plain && <p className="whitespace-pre-line" style={{ color: "var(--sh-muted)" }}>{lyrics.plain}</p>}
          <div className="h-12" />
        </div>
        <div className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-full py-1.5 text-[11px]" style={{ background: "var(--sh-2)", color: "var(--sh-muted)" }}>
          <span className="size-1.5 rounded-full" style={{ background: m?.playing ? "var(--sh-accent)" : "var(--sh-dim)" }} />
          {m ? appLabel(m.app) : "Nenhum player"}
        </div>
      </div>
    </div>
  )
}

/**
 * Capa redonda com uma coroa de traços que pulsa enquanto a música toca.
 * (O Windows não entrega o áudio do player; os traços seguem um ritmo suave, não o espectro real.)
 */
function Spikes({ art, playing, size }: { art?: string | null; playing: boolean; size: number }) {
  const path = useRef<SVGPathElement>(null)
  const N = 72
  const r0 = size * 0.37
  useEffect(() => {
    let energy = playing ? 1 : 0
    const t0 = performance.now()
    const draw = (now: number) => {
      energy += ((playing ? 1 : 0.12) - energy) * 0.06
      const t = (now - t0) / 1000
      let d = ""
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2
        const n = 0.5 + 0.5 * Math.sin(i * 0.9 + t * 3.1) * Math.sin(i * 0.37 - t * 1.7) + 0.25 * Math.sin(i * 2.3 + t * 5.3)
        const len = 3 + Math.max(0, n) * size * 0.07 * energy
        const x1 = size / 2 + Math.cos(a) * (r0 + 4), y1 = size / 2 + Math.sin(a) * (r0 + 4)
        const x2 = size / 2 + Math.cos(a) * (r0 + 4 + len), y2 = size / 2 + Math.sin(a) * (r0 + 4 + len)
        d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
      }
      path.current?.setAttribute("d", d)
    }
    if (!playing) { path.current?.setAttribute("d", ""); return }
    return rafLoop(() => draw(performance.now()))
  }, [playing, size, r0])
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        <path ref={path} stroke="var(--sh-accent)" strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      </svg>
      <motion.div className="absolute overflow-hidden rounded-full" style={{ inset: size / 2 - r0, background: "var(--sh-2)" }}
        animate={{ rotate: playing ? 360 : 0 }} transition={playing ? { duration: 24, ease: "linear", repeat: Infinity } : { duration: 0.6 }}>
        {art ? <img src={art} alt="" className="h-full w-full object-cover" draggable={false} />
          : <span className="flex h-full w-full items-center justify-center"><Music2 size={size * 0.16} style={{ color: "var(--sh-dim)" }} /></span>}
      </motion.div>
    </div>
  )
}

/** linha de progresso em onda enquanto toca (reta quando pausa); clique para pular */
function WaveProgress({ value, playing, onSeek }: { value: number; playing: boolean; onSeek?: (p: number) => void }) {
  const path = useRef<SVGPathElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const v = Math.max(0, Math.min(1, value))
  useEffect(() => {
    let amp = playing ? 3 : 0
    const draw = (now: number) => {
      amp += ((playing ? 3 : 0) - amp) * 0.08
      const end = Math.max(0, v * w - 6)
      let d = "M0 8"
      for (let x = 2; x <= end; x += 2) d += `L${x} ${(8 + Math.sin(x / 7 - now / 260) * amp).toFixed(2)}`
      path.current?.setAttribute("d", d)
    }
    if (!playing) { draw(0); return }
    return rafLoop(() => draw(performance.now()))
  }, [playing, v, w])
  return (
    <div ref={box} className={cn("relative h-4 flex-1", onSeek && "cursor-pointer")} role="slider" aria-label="Posição na música" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}
      onClick={(e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width) }}>
      <svg width={w} height={16} className="absolute inset-0 overflow-visible" aria-hidden>
        <line x1={v * w + 6} y1={8} x2={w} y2={8} stroke="var(--sh-3)" strokeWidth={3} strokeLinecap="round" />
        <path ref={path} fill="none" stroke="var(--sh-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={v * w - 1.5} y={2} width={3} height={12} rx={1.5} fill="var(--sh-fg)" />
      </svg>
    </div>
  )
}

/* ───────────────────────────── desempenho ───────────────────────────── */

function PerfTab() {
  const s = useSys()
  if (!s) return <div className="py-12 text-center text-[13px]" style={{ color: "var(--sh-muted)" }}>Lendo o desempenho do PC…</div>
  const memPct = (s.mem.used / s.mem.total) * 100
  const disk = s.drives?.[0]
  const diskPct = disk ? ((disk.size - disk.free) / disk.size) * 100 : 0
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-4 gap-2.5">
        <BigGauge value={s.cpu.usage} icon={<Cpu size={18} />} label="Processador" sub={s.cpu.speed ? (s.cpu.speed / 1000).toFixed(2) + " GHz" : `${s.cpu.cores.length} núcleos`} />
        <BigGauge value={s.gpu?.usage ?? 0} icon={<MonitorSmartphone size={18} />} label="Placa de vídeo" sub={s.gpu ? (s.gpu.temp != null ? s.gpu.temp + " °C" : s.gpu.name) : "Indisponível"} muted={!s.gpu || s.gpu.usage == null} />
        <BigGauge value={memPct} icon={<MemoryStick size={18} />} label="Memória" sub={`${gb(s.mem.used)} de ${gb(s.mem.total)} GB`} />
        <BigGauge value={diskPct} icon={<HardDrive size={18} />} label={disk ? "Disco " + disk.id : "Disco"} sub={disk ? `${gb(disk.free)} GB livres` : "—"} />
      </div>
      <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
        <div className="sh-card flex items-center justify-around px-4 py-3 text-[12px]">
          <span className="flex items-center gap-2"><ArrowDown size={14} style={{ color: "var(--sh-accent)" }} /><span className="tabular-nums">{s.net ? rate(s.net.rx) : "—"}</span></span>
          <span className="flex items-center gap-2"><ArrowUp size={14} style={{ color: "var(--sh-accent-2)" }} /><span className="tabular-nums">{s.net ? rate(s.net.tx) : "—"}</span></span>
        </div>
        <div className="sh-card px-4 py-2.5">
          {s.top.slice(0, 3).map((p) => (
            <div key={p.name} className="flex items-center gap-3 py-0.5 text-[11.5px]">
              <span className="w-28 truncate" style={{ color: "var(--sh-fg)" }}>{p.name}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--sh-3)" }}>
                <span className="block h-full rounded-full" style={{ width: Math.min(100, (p.mem / s.mem.total) * 100 * 4) + "%", background: "var(--sh-muted)" }} />
              </span>
              <span className="w-14 text-right tabular-nums" style={{ color: "var(--sh-muted)" }}>{gb(p.mem)} GB</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Ring({ value, size, stroke, icon, title }: { value: number; size: number; stroke: number; icon: ReactNode; title: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="relative" style={{ width: size, height: size }} title={`${title}: ${Math.round(v)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sh-3)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sh-accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center" style={{ color: "var(--sh-fg)" }}>{icon}</span>
    </div>
  )
}

/** medidor em arco de 270°, valor grande no meio */
function BigGauge({ value, icon, label, sub, muted }: { value: number; icon: ReactNode; label: string; sub: string; muted?: boolean }) {
  const size = 132, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r, arc = c * 0.75
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="sh-card flex flex-col items-center px-3 pb-3 pt-4">
      <div className="relative" style={{ width: size, height: size * 0.86 }}>
        <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sh-3)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${arc} ${c}`} />
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={muted ? "var(--sh-dim)" : "var(--sh-accent)"} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${arc} ${c}`} animate={{ strokeDashoffset: arc * (1 - v / 100) }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
        </svg>
        <div className="absolute inset-x-0 top-[30%] flex flex-col items-center">
          <span style={{ color: "var(--sh-muted)" }}>{icon}</span>
          <span className="mt-1 text-[22px] font-semibold tabular-nums">{muted ? "—" : Math.round(v) + "%"}</span>
        </div>
      </div>
      <div className="text-[12px] font-medium">{label}</div>
      <div className="w-full truncate text-center text-[11px]" style={{ color: "var(--sh-muted)" }}>{sub}</div>
    </div>
  )
}

/* ───────────────────────────── clima ───────────────────────────── */

function WeatherTab() {
  const wx = useWeather()
  if (!wx) return <div className="py-12 text-center text-[13px]" style={{ color: "var(--sh-muted)" }}>Carregando a previsão…</div>
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[1.2fr_1fr] gap-2.5">
        <div className="sh-card flex items-center gap-5 px-6 py-5">
          <WxIcon code={wx.code} day={wx.isDay} size={84} />
          <div>
            <div className="text-[13px]" style={{ color: "var(--sh-muted)" }}>{wx.city}</div>
            <div className="text-[46px] font-semibold leading-none tabular-nums">{Math.round(wx.temp)}°</div>
            <div className="mt-1 text-[13px]">{LABEL(wx.code)}</div>
            <div className="text-[11px]" style={{ color: "var(--sh-muted)" }}>Máx. {Math.round(wx.max)}° · Mín. {Math.round(wx.min)}°</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: <Thermometer size={16} />, label: "Sensação", v: Math.round(wx.feels) + "°" },
            { icon: <Droplets size={16} />, label: "Umidade", v: Math.round(wx.hum) + "%" },
            { icon: <Wind size={16} />, label: "Vento", v: Math.round(wx.wind) + " km/h" },
          ].map((x) => (
            <div key={x.label} className="sh-card flex flex-col items-center justify-center gap-1.5 py-3">
              <span style={{ color: "var(--sh-accent)" }}>{x.icon}</span>
              <span className="text-[16px] font-semibold tabular-nums">{x.v}</span>
              <span className="text-[11px]" style={{ color: "var(--sh-muted)" }}>{x.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sh-card flex justify-between px-4 py-3">
        {wx.hours.slice(0, 8).map((h) => (
          <div key={h.t} className="flex flex-col items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--sh-muted)" }}>{h.t}</span>
            <WxIcon code={h.code} size={24} />
            <span className="font-medium tabular-nums">{Math.round(h.temp)}°</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2.5">
        {wx.days.slice(0, 5).map((d) => (
          <div key={d.d} className="sh-card flex flex-col items-center gap-1 py-3 text-[11px]">
            <span className="capitalize" style={{ color: "var(--sh-muted)" }}>{d.d}</span>
            <WxIcon code={d.code} size={28} />
            <span className="tabular-nums"><b className="font-semibold">{Math.round(d.max)}°</b> <span style={{ color: "var(--sh-dim)" }}>{Math.round(d.min)}°</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}
