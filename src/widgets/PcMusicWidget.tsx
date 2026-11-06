import { useEffect, useState } from "react"
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react"
import { bridge, type PcMedia } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Segmented } from "@/components/ui/controls"

/** players que a pessoa pode fixar no widget (o nome é procurado no id do app no Windows) */
export const PC_PLAYERS = [
  { id: "", label: "Qualquer um" },
  { id: "spotify", label: "Spotify" },
  { id: "deezer", label: "Deezer" },
  { id: "applemusic", label: "Apple Music" },
  { id: "amazon", label: "Amazon Music" },
  { id: "tidal", label: "TIDAL" },
] as const

const appName = (aumid?: string) => {
  const a = (aumid || "").toLowerCase()
  if (a.includes("spotify")) return "Spotify"
  if (a.includes("deezer")) return "Deezer"
  if (a.includes("apple")) return "Apple Music"
  if (a.includes("amazon")) return "Amazon Music"
  if (a.includes("tidal")) return "TIDAL"
  if (a.includes("chrome")) return "Chrome"
  if (a.includes("msedge")) return "Edge"
  if (a.includes("firefox")) return "Firefox"
  if (a.includes("opera")) return "Opera"
  return aumid ? aumid.split(/[!\\.]/)[0] : ""
}

const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

function usePcMedia(id: string, app: string) {
  const [m, setM] = useState<PcMedia | null>(null)
  const [at, setAt] = useState(performance.now())
  useEffect(() => {
    let alive = true
    bridge.pcmedia.sub(id, app).then((s) => alive && s && setM(s))
    const off = bridge.pcmedia.onState((s) => { setM(s); setAt(performance.now()) })
    return () => { alive = false; off(); bridge.pcmedia.unsub(id) }
  }, [id, app])
  // tempo andando entre uma leitura e outra
  const [, tick] = useState(0)
  useEffect(() => {
    if (!m?.playing) return
    const t = setInterval(() => tick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [m?.playing])
  const pos = m?.pos != null ? Math.min(m.dur || Infinity, m.pos + (m.playing ? (performance.now() - at) / 1000 : 0)) : 0
  return { m, pos }
}

export function PcMusicWidget({ w }: { w: Widget }) {
  const app: string = w.config.app ?? ""
  const { m, pos } = usePcMedia(w.id, app)
  const want = PC_PLAYERS.find((p) => p.id === app)?.label
  if (!m || m.none || !m.title) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <Music2 size={26} className="text-fg-muted" />
        <div className="text-sm font-medium">Nada tocando</div>
        <div className="text-xs text-fg-muted">{app ? `Abra o ${want} e dê play.` : "Dê play no Spotify, Deezer ou outro player do PC."}</div>
      </div>
    )
  }
  const pct = m.dur ? Math.min(100, (pos / m.dur) * 100) : 0
  const big = w.h >= 190
  return (
    <div className="flex h-full items-center gap-4 p-4">
      <div className={cn("relative shrink-0 overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] shadow-lg", big ? "size-[132px]" : "size-[92px]")}>
        {m.art ? <img src={m.art} alt="" className="size-full object-cover" draggable={false} /> : <Music2 className="absolute inset-0 m-auto text-fg-muted" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="text-[11px] tracking-wide text-fg-muted uppercase">{appName(m.app)}</div>
        <div className="truncate font-display text-lg leading-tight font-semibold" title={m.title}>{m.title}</div>
        <div className="truncate text-sm text-fg-muted">{m.artist}{m.album && m.album !== m.title ? ` · ${m.album}` : ""}</div>
        {m.dur ? (
          <div className="mt-1">
            <div className="h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_14%,transparent)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: pct + "%" }} />
            </div>
            <div className="mt-0.5 flex justify-between font-num text-[10px] text-fg-muted"><span>{fmt(pos)}</span><span>{fmt(m.dur)}</span></div>
          </div>
        ) : null}
        <div className="flex items-center gap-1" data-nodrag>
          <button className="btn btn-ghost btn-icon" disabled={m.canPrev === false} onClick={() => bridge.pcmedia.cmd("prev")} title="Anterior"><SkipBack size={16} /></button>
          <button className="btn btn-icon !size-10 !rounded-full" onClick={() => bridge.pcmedia.cmd("toggle")} title={m.playing ? "Pausar" : "Tocar"}>
            {m.playing ? <Pause size={18} /> : <Play size={18} className="translate-x-px" />}
          </button>
          <button className="btn btn-ghost btn-icon" disabled={m.canNext === false} onClick={() => bridge.pcmedia.cmd("next")} title="Próxima"><SkipForward size={16} /></button>
        </div>
      </div>
    </div>
  )
}

export function PcMusicSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-fg-muted">Player mostrado</div>
      <Segmented value={w.config.app ?? ""} onChange={(v) => set({ app: v })} options={PC_PLAYERS.map((p) => ({ value: p.id, label: p.label }))} />
    </div>
  )
}
