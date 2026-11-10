import { useEffect, useState } from "react"
import { Disc3, Headphones, Music2, Pause, Play, SkipBack, SkipForward, Waves } from "lucide-react"
import { bridge, type PcMedia } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Segmented, Switch } from "@/components/ui/controls"

/** Native Windows media sessions (SMTC): no Spotify login/API key required. */
export const PC_PLAYERS = [
  { id: "", label: "Automático" },
  { id: "spotify", label: "Spotify" },
  { id: "deezer", label: "Deezer" },
  { id: "applemusic", label: "Apple Music" },
  { id: "amazon", label: "Amazon Music" },
  { id: "tidal", label: "TIDAL" },
] as const

type Layout = "auto" | "wide" | "compact" | "poster"
type Background = "blur" | "glass" | "solid" | "none"
type CoverShape = "rounded" | "square" | "circle"
type Accent = "spotify" | "theme" | "blue"

const appName = (id = "") => {
  const a = id.toLowerCase()
  if (a.includes("spotify")) return "Spotify"
  if (a.includes("deezer")) return "Deezer"
  if (a.includes("apple")) return "Apple Music"
  if (a.includes("amazon")) return "Amazon Music"
  if (a.includes("tidal")) return "TIDAL"
  if (a.includes("chrome")) return "Chrome"
  if (a.includes("msedge")) return "Edge"
  if (a.includes("firefox")) return "Firefox"
  if (a.includes("opera")) return "Opera"
  return id ? id.split(/[!\\.]/)[0] : "Player"
}
const formatTime = (s = 0) => {
  const sec = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0")
}
function usePcMedia(id: string, app: string) {
  const [media, setMedia] = useState<PcMedia | null>(null)
  const [captured, setCaptured] = useState(performance.now())
  const [now, setNow] = useState(performance.now())
  useEffect(() => {
    let alive = true
    let gotEvent = false
    setMedia(null)
    const receive = (state: PcMedia) => {
      if (!alive || state.widgetId !== id) return
      gotEvent = true
      setMedia(state)
      setCaptured(performance.now())
    }
    // Subscribe to notifications before the initial snapshot, avoiding a lost first artwork.
    const off = bridge.pcmedia.onState(receive)
    void bridge.pcmedia.sub(id, app).then((state) => {
      if (alive && !gotEvent && state) {
        setMedia(state)
        setCaptured(performance.now())
      }
    }).catch(() => {
      if (alive) setMedia({ none: true, error: "Não foi possível conectar ao Windows." })
    })
    return () => { alive = false; off(); void bridge.pcmedia.unsub(id) }
  }, [id, app])
  useEffect(() => {
    if (!media?.playing) return
    const handle = window.setInterval(() => setNow(performance.now()), 500)
    return () => window.clearInterval(handle)
  }, [media?.playing])
  const position = media?.pos != null
    ? Math.max(0, Math.min(media.dur || Infinity,
        media.pos + (media.playing ? (now - captured) / 1000 : 0)))
    : 0
  return { media, position }
}

function Artwork({ image, shape, size, accent }: { image?: string | null; shape: CoverShape; size: number; accent: string }) {
  return (
    <div className={cn("relative isolate shrink-0 overflow-hidden border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,.3)]",
      shape === "circle" ? "rounded-full" : shape === "square" ? "rounded-lg" : "rounded-2xl")}
      style={{ width: size, height: size, background: "linear-gradient(135deg, #17273a, #0c1421)" }}>
      {image ? (
        <img src={image} alt="Capa do álbum" className="h-full w-full object-cover" draggable={false}
          onError={(event) => { event.currentTarget.style.display = "none" }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Disc3 aria-hidden="true" style={{ color: accent, width: size * .45, height: size * .45 }} strokeWidth={1.25} />
        </div>
      )}
    </div>
  )
}

function PlaybackControls({ media, id, accent, small = false }: {
  media: PcMedia; id: string; accent: string; small?: boolean
}) {
  const command = (name: "toggle" | "next" | "prev") => { void bridge.pcmedia.cmd(name, id) }
  return (
    <div className="flex items-center gap-1" data-nodrag>
      <button type="button" aria-label="Faixa anterior" title="Anterior"
        disabled={media.canPrev === false} onClick={() => command("prev")}
        className="flex size-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25">
        <SkipBack size={small ? 15 : 18} fill="currentColor" />
      </button>
      <button type="button" aria-label={media.playing ? "Pausar" : "Reproduzir"}
        title={media.playing ? "Pausar" : "Reproduzir"} onClick={() => command("toggle")}
        className={cn("flex items-center justify-center rounded-full text-[#071423] shadow-lg transition hover:scale-105 active:scale-95", small ? "size-9" : "size-10")}
        style={{ background: accent }}>
        {media.playing ? <Pause size={small ? 17 : 20} fill="currentColor" /> :
          <Play size={small ? 17 : 20} fill="currentColor" className="translate-x-px" />}
      </button>
      <button type="button" aria-label="Próxima faixa" title="Próxima"
        disabled={media.canNext === false} onClick={() => command("next")}
        className="flex size-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25">
        <SkipForward size={small ? 15 : 18} fill="currentColor" />
      </button>
    </div>
  )
}

function Timeline({ media, pos, id, accent, showTimes = true }: {
  media: PcMedia; pos: number; id: string; accent: string; showTimes?: boolean
}) {
  const duration = Math.max(0, media.dur || 0)
  if (!duration) return null
  const pct = Math.min(100, pos / duration * 100)
  return (
    <div className="w-full" data-nodrag>
      <input type="range" min={0} max={duration} step={1} value={Math.min(duration, pos)}
        disabled={media.canSeek !== true} aria-label="Posição na música"
        title={media.canSeek ? "Arraste para avançar ou voltar" : "Este player não permite avançar pelo Windows"}
        onChange={(event) => { void bridge.pcmedia.cmd("seek", id, Number(event.target.value)) }}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:cursor-default"
        style={{ background: "linear-gradient(to right, " + accent + " " + pct + "%, rgba(255,255,255,.18) " + pct + "%)" }} />
      {showTimes && <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/60">
        <span>{formatTime(pos)}</span><span>{formatTime(duration)}</span>
      </div>}
    </div>
  )
}

function SourceLabel({ media, accent }: { media: PcMedia; accent: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-white/65">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: media.playing ? accent : "#8290A4" }} />
      <span className="truncate">{appName(media.app)}</span>
      <span className="text-white/35">{media.playing ? "• Tocando" : "• Pausado"}</span>
    </div>
  )
}

export function PcMusicWidget({ w }: { w: Widget }) {
  const c = w.config
  const app = typeof c.app === "string" ? c.app : ""
  const { media, position } = usePcMedia(w.id, app)
  const layout: Layout = c.pcLayout ?? "auto"
  const mode: Background = c.pcBg ?? "blur"
  const shape: CoverShape = c.pcArtShape ?? "rounded"
  const tint: Accent = c.pcAccent ?? "spotify"
  const accent = tint === "theme" ? "var(--accent)" : tint === "blue" ? "#5AB8FF" : "#1ED760"
  const compact = layout === "compact" || (layout === "auto" && (w.h < 170 || w.w < 350))
  const poster = layout === "poster" && w.h >= 255
  const image = media?.art
  const bgImage = mode === "blur" && image
  const backdrop = mode === "glass" ? "linear-gradient(135deg, #14283C, #0C1728)" :
    mode === "solid" ? "#101923" : mode === "none" ? "transparent" :
    "linear-gradient(145deg, #10243B, #080E19)"

  const overlay = (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: backdrop }} />
      {bgImage && (
        <>
          <div className="pointer-events-none absolute -inset-5 opacity-55"
            style={{ backgroundImage: "url(" + JSON.stringify(image) + ")", backgroundSize: "cover",
              backgroundPosition: "center", filter: "blur(32px) saturate(1.25)" }} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#07111B]/65 via-[#091321]/75 to-[#050A12]/90" />
        </>
      )}
    </>
  )

  if (!media || media.none || !media.title) {
    const requested = PC_PLAYERS.find((p) => p.id === app)?.label || (app || "um player")
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden p-4 text-center text-white">
        {overlay}
        <div className="relative flex size-12 items-center justify-center rounded-2xl bg-white/10" style={{ color: accent }}>
          <Headphones size={24} />
        </div>
        <div className="relative text-sm font-semibold">{media?.unsupported ? "Disponível no Windows" : "Aguardando música"}</div>
        <div className="relative max-w-[300px] text-xs leading-relaxed text-white/60">
          {media?.error ?? (media?.unsupported ? "O widget acompanha o player instalado no Windows." :
            app ? "Abra o " + requested + " e reproduza uma música." : "Reproduza no Spotify, Deezer ou outro player do PC.")}
        </div>
      </div>
    )
  }
  const coverSize = poster ? Math.min(w.w - 40, Math.max(82, w.h - 187), 218)
    : compact ? Math.max(48, Math.min(70, w.h - 34))
      : Math.min(Math.max(82, w.h - 34), Math.max(76, w.w * .33), 144)

  const controls = c.pcControls !== false &&
    <PlaybackControls media={media} id={w.id} accent={accent} small={compact} />
  const timeline = c.pcProgress !== false &&
    <Timeline media={media} pos={position} id={w.id} accent={accent} showTimes={c.pcTimes !== false} />
  const source = c.pcSource !== false && <SourceLabel media={media} accent={accent} />
  const label = <div className="min-w-0">
    <div className={cn("truncate font-semibold tracking-[-.025em]", compact ? "text-[15px]" : "text-[18px]")}
      title={media.title}>{media.title}</div>
    <div className="truncate text-[12px] text-white/70" title={media.artist}>{media.artist || "Artista desconhecido"}</div>
    {c.pcAlbum !== false && !!media.album && media.album !== media.title &&
      <div className="mt-0.5 truncate text-[11px] text-white/45" title={media.album}>{media.album}</div>}
  </div>

  return (
    <div className="relative isolate h-full w-full overflow-hidden text-white">
      {overlay}
      {poster ? (
        <div className="relative flex h-full flex-col items-center justify-between gap-2 p-4 text-center">
          {source}
          <Artwork image={image} size={coverSize} shape={shape} accent={accent} />
          <div className="w-full">{label}</div>
          <div className="w-full max-w-[300px]">{timeline}</div>
          {controls}
        </div>
      ) : (
        <div className={cn("relative flex h-full items-center", compact ? "gap-3 p-3" : "gap-4 p-4")}>
          <Artwork image={image} size={coverSize} shape={shape} accent={accent} />
          <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1.5">
            {source}
            {label}
            {timeline}
            {controls}
          </div>
        </div>
      )}
    </div>
  )
}

const choices = <T extends string,>(items: { id: T; name: string }[]) => items.map((x) => ({ value: x.id, label: x.name }))

export function PcMusicSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const c = w.config
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-fg-muted">Player acompanhado</div>
      <select className="field w-full" value={c.app ?? ""} onChange={(e) => set({ app: e.target.value })}>
        {PC_PLAYERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <p className="text-xs text-fg-muted">Acompanha o player do Windows, sem login nem API do Spotify. Cada widget pode mostrar um aplicativo diferente.</p>

      <div className="text-xs font-medium text-fg-muted">Layout</div>
      <Segmented value={c.pcLayout ?? "auto"} onChange={(v) => set({ pcLayout: v })}
        options={choices([{ id: "auto", name: "Auto" }, { id: "wide", name: "Cartão" },
          { id: "compact", name: "Compacto" }, { id: "poster", name: "Capa" }])} />

      <div className="text-xs font-medium text-fg-muted">Fundo</div>
      <Segmented value={c.pcBg ?? "blur"} onChange={(v) => set({ pcBg: v })}
        options={choices([{ id: "blur", name: "Capa desfocada" }, { id: "glass", name: "Vidro" },
          { id: "solid", name: "Sólido" }, { id: "none", name: "Transparente" }])} />

      <div className="text-xs font-medium text-fg-muted">Formato da capa</div>
      <Segmented value={c.pcArtShape ?? "rounded"} onChange={(v) => set({ pcArtShape: v })}
        options={choices([{ id: "rounded", name: "Arredondada" }, { id: "square", name: "Quadrada" },
          { id: "circle", name: "Circular" }])} />

      <div className="text-xs font-medium text-fg-muted">Cor dos controles</div>
      <Segmented value={c.pcAccent ?? "spotify"} onChange={(v) => set({ pcAccent: v })}
        options={choices([{ id: "spotify", name: "Verde" }, { id: "blue", name: "Azul Widgy" },
          { id: "theme", name: "Do tema" }])} />

      <div className="border-t border-line pt-2">
        <Switch checked={c.pcAlbum !== false} onChange={(v) => set({ pcAlbum: v })} label="Mostrar álbum" />
        <Switch checked={c.pcSource !== false} onChange={(v) => set({ pcSource: v })} label="Mostrar nome do player e estado" />
        <Switch checked={c.pcProgress !== false} onChange={(v) => set({ pcProgress: v })} label="Mostrar progresso" />
        {c.pcProgress !== false && <Switch checked={c.pcTimes !== false} onChange={(v) => set({ pcTimes: v })} label="Mostrar tempo decorrido e total" />}
        <Switch checked={c.pcControls !== false} onChange={(v) => set({ pcControls: v })} label="Mostrar botões de reprodução" />
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">A capa e a opção de avançar dependem das informações fornecidas pelo aplicativo à central de mídia do Windows. Se o Spotify não compartilhar uma capa, o widget mantém uma arte alternativa elegante.</p>
    </div>
  )
}
