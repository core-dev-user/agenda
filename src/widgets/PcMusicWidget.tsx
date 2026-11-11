import { useEffect, useState } from "react"
import { Disc3, Headphones, Pause, Play, SkipBack, SkipForward } from "lucide-react"
import { bridge, type PcMedia } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Segmented, Switch } from "@/components/ui/controls"

/**
 * Widgy Music — minimal, album-first desktop player.
 * Keeps the existing Windows SMTC integration, the per-widget source selector
 * and all previously saved pc* configuration keys.
 */
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

const playerName = (id = "") => {
  const v = id.toLowerCase()
  if (v.includes("spotify")) return "Spotify"
  if (v.includes("deezer")) return "Deezer"
  if (v.includes("apple")) return "Apple Music"
  if (v.includes("amazon")) return "Amazon Music"
  if (v.includes("tidal")) return "TIDAL"
  if (v.includes("chrome")) return "Chrome"
  if (v.includes("msedge")) return "Edge"
  if (v.includes("firefox")) return "Firefox"
  return id ? id.split(/[!\\.]/)[0] : "Música do PC"
}
const timeLabel = (s = 0) => {
  const n = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0")
}
function usePcMedia(id: string, app: string) {
  const [media, setMedia] = useState<PcMedia | null>(null)
  const [captured, setCaptured] = useState(() => performance.now())
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    let alive = true
    let received = false
    setMedia(null)
    const receive = (state: PcMedia) => {
      if (!alive || state.widgetId !== id) return
      received = true
      const at = performance.now()
      setMedia(state)
      setCaptured(at)
      setNow(at)
    }
    const unsubscribe = bridge.pcmedia.onState(receive)
    void bridge.pcmedia.sub(id, app).then((state) => {
      // The browser fallback may not contain widgetId; snapshots belong to
      // the specific subscriber, unlike broadcast events.
      if (alive && !received && state) {
        const at = performance.now()
        setMedia(state)
        setCaptured(at)
        setNow(at)
      }
    }).catch(() => {
      if (alive) setMedia({ none: true, error: "Não foi possível conectar à mídia do Windows." })
    })
    return () => {
      alive = false
      unsubscribe()
      void bridge.pcmedia.unsub(id)
    }
  }, [id, app])

  useEffect(() => {
    if (!media?.playing) return
    const timer = window.setInterval(() => setNow(performance.now()), 500)
    return () => window.clearInterval(timer)
  }, [media?.playing])

  const elapsed = media?.playing ? Math.max(0, (now - captured) / 1000) : 0
  const position = media?.pos != null ? Math.max(0, Math.min(media.dur || Infinity, media.pos + elapsed)) : 0
  return { media, position }
}

function Cover({ image, shape, size }: { image?: string | null; shape: CoverShape; size: number }) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const showImage = !!image && failedImage !== image
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-white/[.08] bg-[#202A35]",
        shape === "circle" ? "rounded-full" : shape === "square" ? "rounded-[9px]" : "rounded-[17px]",
      )}
      style={{ width: size, height: size, boxShadow: "0 10px 28px rgba(0,0,0,.23)" }}
    >
      {showImage ? (
        <img key={image} src={image} alt="Capa da música" draggable={false}
          className="block h-full w-full object-cover" onError={() => setFailedImage(image ?? null)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#273340] via-[#18222D] to-[#111A25] text-[#BAC9D8]">
          <Disc3 size={Math.min(42, size * .4)} strokeWidth={1.1} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

function Controls({ media, id, small, tiny = false }: { media: PcMedia; id: string; small: boolean; tiny?: boolean }) {
  const cmd = (name: "toggle" | "next" | "prev") => { void bridge.pcmedia.cmd(name, id) }
  const side = small ? "size-[30px]" : "size-9"
  const iconSize = small ? 16 : 18
  return (
    <div className="flex items-center gap-2.5" data-nodrag>
      {!tiny && <button type="button" title="Anterior" aria-label="Faixa anterior"
        disabled={media.canPrev === false} onClick={() => cmd("prev")}
        className={cn("grid shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/[.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-25", side)}>
        <SkipBack size={iconSize} fill="currentColor" strokeWidth={1.5} />
      </button>}
      <button type="button" title={media.playing ? "Pausar" : "Reproduzir"}
        aria-label={media.playing ? "Pausar" : "Reproduzir"} onClick={() => cmd("toggle")}
        className={cn("grid shrink-0 place-items-center rounded-full bg-[#F7F9FC] text-[#141B24] shadow-[0_2px_12px_rgba(0,0,0,.18)] transition-transform hover:scale-[1.06] active:scale-[.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#A8CFFF]", small ? "size-9" : "size-10")}>
        {media.playing ? <Pause size={small ? 17 : 19} fill="currentColor" strokeWidth={1.5} /> :
          <Play size={small ? 17 : 19} fill="currentColor" strokeWidth={1.5} className="translate-x-px" />}
      </button>
      {!tiny && <button type="button" title="Próxima" aria-label="Próxima faixa"
        disabled={media.canNext === false} onClick={() => cmd("next")}
        className={cn("grid shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/[.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-25", side)}>
        <SkipForward size={iconSize} fill="currentColor" strokeWidth={1.5} />
      </button>}
    </div>
  )
}

function Progress({ media, seconds, id, accent, times }: {
  media: PcMedia; seconds: number; id: string; accent: string; times: boolean
}) {
  const duration = Number(media.dur) || 0
  const [draft, setDraft] = useState<number | null>(null)
  const display = Math.min(duration, draft ?? seconds)
  if (!duration) return null
  const percent = Math.max(0, Math.min(100, display / duration * 100))
  const seekable = media.canSeek === true
  const commit = () => {
    if (draft === null || !seekable) return
    void bridge.pcmedia.cmd("seek", id, draft)
    setDraft(null)
  }
  return (
    <div className="w-full min-w-0" data-nodrag>
      <div className="relative flex h-3 items-center">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[.18]">
          <div className="h-full rounded-full" style={{ width: percent + "%", background: accent }} />
        </div>
        {seekable && (
          <input type="range" min="0" max={duration} step="1"
            value={display} aria-label="Posição da música"
            title="Arraste para mudar o trecho da música"
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commit} onPointerCancel={() => setDraft(null)}
            onKeyUp={commit} onBlur={commit}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        )}
      </div>
      {times && (
        <div className="mt-0.5 flex justify-between text-[10px] font-medium tabular-nums text-white/45">
          <span>{timeLabel(display)}</span><span>{timeLabel(duration)}</span>
        </div>
      )}
    </div>
  )
}

function Backdrop({ mode, art }: { mode: Background; art?: string | null }) {
  if (mode === "none") return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{
        background: mode === "solid" ? "#111922" :
          mode === "glass" ? "linear-gradient(145deg, rgba(22,31,43,.96), rgba(12,19,28,.94))" :
            "linear-gradient(145deg, #1C2632, #0C141E)",
      }} />
      {mode === "blur" && art && (
        <>
          <div className="absolute -inset-10 opacity-[.27]"
            style={{ backgroundImage: "url(" + JSON.stringify(art) + ")", backgroundSize: "cover",
              backgroundPosition: "center", filter: "blur(38px) saturate(.85)" }} />
          <div className="absolute inset-0 bg-[#101820]/60" />
        </>
      )}
      <div className="absolute inset-0 border border-white/[.04]" style={{ borderRadius: "inherit" }} />
    </div>
  )
}

export function PcMusicWidget({ w }: { w: Widget }) {
  const c = w.config
  const app = typeof c.app === "string" ? c.app : ""
  const { media, position } = usePcMedia(w.id, app)
  const selectedLayout: Layout = c.pcLayout ?? "auto"
  const background: Background = c.pcBg ?? "glass"
  const shape: CoverShape = c.pcArtShape ?? "rounded"
  const tint: Accent = c.pcAccent ?? "blue"
  // Color is an accent, never a giant green play button.
  const accent = tint === "theme" ? "var(--accent)" : tint === "spotify" ? "#55D995" : "#8AC7FF"
  const vertical = selectedLayout === "poster" && w.h >= 310 && w.w >= 215
  const compact = !vertical && (selectedLayout === "compact" || w.w < 370 ||
    w.h < 180 || (selectedLayout === "auto" && w.h < 202))
  const tiny = w.h < 138 || w.w < 255
  const coverSize = vertical ?
    Math.min(w.w - 42, Math.max(105, w.h * .46), 208) :
    compact ? Math.min(110, Math.max(58, w.h - 28), Math.max(58, w.w * .34)) :
      Math.min(180, Math.max(90, w.h - 42), Math.max(90, w.w * .39))
  const showSource = c.pcSource === true
  const showAlbum = c.pcAlbum === true
  const showTimes = c.pcTimes === true && !tiny && (vertical || (!compact && w.h >= 200))
  const showProgress = c.pcProgress !== false && !tiny

  const text = media?.title ? (
    <div className="min-w-0 w-full overflow-hidden">
      {showSource && (
        <div className="mb-1.5 flex items-center gap-1.5 truncate text-[10px] font-medium tracking-[.08em] text-white/45">
          <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: media.playing ? accent : "#7F8A96" }} />
          {playerName(media.app)} {media.playing ? "· Tocando" : "· Pausado"}
        </div>
      )}
      <div className={cn("truncate font-semibold leading-tight tracking-[-.035em] text-[#F5F7FA]",
        compact ? "text-[15px]" : "text-[19px]")}
        title={media.title}>{media.title}</div>
      <div className="mt-1 truncate text-[12px] leading-tight text-white/60" title={media.artist}>
        {media.artist || "Artista desconhecido"}
      </div>
      {showAlbum && media.album && media.album !== media.title && !tiny && (
        <div title={media.album} className="mt-1 truncate text-[11px] text-white/40">{media.album}</div>
      )}
    </div>
  ) : null

  return (
    <div className="relative isolate h-full w-full overflow-hidden text-white">
      <Backdrop mode={background} art={media?.art} />
      {!media?.title || media.none ? (
        <div className="relative flex h-full items-center gap-3.5 p-4">
          <div className="grid size-[52px] shrink-0 place-items-center rounded-[15px] border border-white/[.06] bg-white/[.06]">
            <Headphones size={24} strokeWidth={1.4} className="text-white/70" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[-.015em]">
              {media?.unsupported ? "Somente no Windows" : "Nada tocando"}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/55">
              {media?.error || (media?.unsupported ? "Conecte-se em um computador Windows." :
                app ? "Reproduza algo no " + (PC_PLAYERS.find((p) => p.id === app)?.label || app) + "." :
                  "Abra o Spotify ou outro player para começar.")}
            </p>
          </div>
        </div>
      ) : vertical ? (
        <div className="relative flex h-full w-full flex-col items-center justify-between gap-2.5 p-5 text-center">
          <Cover image={media.art} shape={shape} size={coverSize} />
          {text}
          {showProgress && <Progress media={media} seconds={position} id={w.id} accent={accent} times={showTimes} />}
          {c.pcControls !== false && <Controls media={media} id={w.id} small={false} />}
        </div>
      ) : (
        <div className={cn("relative flex h-full min-w-0 items-center",
          compact ? "gap-3 p-3" : "gap-[18px] p-5")}>
          <Cover image={media.art} shape={shape} size={coverSize} />
          <div className={cn("flex h-full min-w-0 flex-1 flex-col justify-center",
            compact ? "gap-2" : "gap-3")}>
            {text}
            {showProgress && <Progress media={media} seconds={position} id={w.id} accent={accent} times={showTimes} />}
            {c.pcControls !== false && <Controls media={media} id={w.id} small={compact} tiny={tiny} />}
          </div>
        </div>
      )}
    </div>
  )
}

const options = <T extends string,>(items: { value: T; label: string }[]) => items

export function PcMusicSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const c = w.config
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-semibold">Aplicativo</div>
        <select className="field w-full" value={c.app ?? ""} onChange={(e) => set({ app: e.target.value })}>
          {PC_PLAYERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold">Estilo do player</div>
        <Segmented className="flex flex-wrap" value={c.pcLayout ?? "auto"} onChange={(v) => set({ pcLayout: v })}
          options={options([{ value: "auto", label: "Adaptável" }, { value: "wide", label: "Cartão" },
            { value: "compact", label: "Mini" }, { value: "poster", label: "Capa grande" }])} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
          Adaptável ajusta capa e controles automaticamente quando você redimensiona o widget.
        </p>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold">Fundo</div>
        <Segmented className="flex flex-wrap" value={c.pcBg ?? "glass"} onChange={(v) => set({ pcBg: v })}
          options={options([{ value: "glass", label: "Discreto" }, { value: "blur", label: "Capa suave" },
            { value: "solid", label: "Sólido" }, { value: "none", label: "Sem fundo" }])} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold">Capa</div>
        <Segmented className="flex flex-wrap" value={c.pcArtShape ?? "rounded"} onChange={(v) => set({ pcArtShape: v })}
          options={options([{ value: "rounded", label: "Arredondada" }, { value: "square", label: "Quadrada" },
            { value: "circle", label: "Circular" }])} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold">Cor da barra de progresso</div>
        <Segmented className="flex flex-wrap" value={c.pcAccent ?? "blue"} onChange={(v) => set({ pcAccent: v })}
          options={options([{ value: "blue", label: "Widgy" }, { value: "spotify", label: "Spotify" },
            { value: "theme", label: "Meu tema" }])} />
      </div>
      <div className="border-t border-line pt-2">
        <Switch checked={c.pcControls !== false} onChange={(v) => set({ pcControls: v })} label="Controles de reprodução" />
        <Switch checked={c.pcProgress !== false} onChange={(v) => set({ pcProgress: v })} label="Progresso da música" />
        <Switch checked={c.pcSource === true} onChange={(v) => set({ pcSource: v })} label="Mostrar aplicativo e estado" />
        <Switch checked={c.pcAlbum === true} onChange={(v) => set({ pcAlbum: v })} label="Mostrar álbum" />
        {c.pcProgress !== false && <Switch checked={c.pcTimes === true} onChange={(v) => set({ pcTimes: v })} label="Mostrar os tempos" />}
      </div>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        A capa é recebida da central de mídia do Windows. Caso o aplicativo não forneça a arte, o Widgy mostra um ícone neutro no mesmo espaço.
      </p>
    </div>
  )
}
