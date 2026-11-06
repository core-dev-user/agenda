import { useMemo } from "react"
import { Disc3, Mic } from "lucide-react"
import { useStore } from "@/lib/store"
import { aggregate, emptyListen, fmtMin } from "@/lib/listening"
import type { Widget } from "@/lib/types"

/** Widget: o que você mais ouviu nos últimos 7 dias (YouTube Music). */
export function MusicStatsWidget({ w }: { w: Widget }) {
  const L = useStore((s) => s.listening) ?? emptyListen()
  const open = useStore((s) => s.openWindow)
  const week = useMemo(() => aggregate(L, "7"), [L])
  const today = useMemo(() => aggregate(L, "today"), [L])
  const top = week.tracks[0]
  const n = Math.max(0, Math.floor((w.h - 230) / 30))
  return (
    <button className="flex h-full w-full flex-col gap-2.5 p-3.5 text-left" onClick={() => { useStore.setState({ musicTab: "stats" }); open("music") }}>
      <div className="flex items-center gap-2">
        <img src="logos/youtube-music.svg" className="h-6 w-6" draggable={false} />
        <div className="flex-1 text-sm font-semibold">Sua semana na música</div>
      </div>
      {week.total < 30 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-fg-muted">Ouça algo no YouTube Music e as estatísticas aparecem aqui.</div>
      ) : (
        <>
          <div className="flex gap-4">
            <div><div className="font-num text-2xl font-semibold">{fmtMin(week.total)}</div><div className="text-[11px] text-fg-muted">em 7 dias · hoje {fmtMin(today.total)}</div></div>
          </div>
          {top?.meta && (
            <div className="relative flex items-center gap-2.5 overflow-hidden rounded-xl p-2" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
              {top.meta.art && <img src={top.meta.art} className="h-12 w-12 rounded-lg object-cover" draggable={false} />}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Mais ouvida</div>
                <div className="truncate text-sm font-semibold">{top.meta.title}</div>
                <div className="truncate text-xs text-fg-muted">{top.meta.artist} · {top.plays}×</div>
              </div>
            </div>
          )}
          <div className="flex gap-2 text-xs">
            {week.artists[0] && <span className="min-w-0 flex-1 truncate rounded-lg px-2 py-1" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}><Mic size={11} className="mr-1 inline text-fg-muted" />{week.artists[0].name}</span>}
            {week.genres[0] && <span className="min-w-0 flex-1 truncate rounded-lg px-2 py-1" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}><Disc3 size={11} className="mr-1 inline text-fg-muted" />{week.genres[0][0]}</span>}
          </div>
          {n > 0 && (
            <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
              {week.tracks.slice(1, n + 1).map((t, i) => (
                <div key={t.k} className="flex items-center gap-2 text-xs">
                  <span className="font-num w-4 text-fg-muted">{i + 2}</span>
                  <span className="min-w-0 flex-1 truncate">{t.meta?.title} <span className="text-fg-muted">· {t.meta?.artist}</span></span>
                  <span className="font-num">{t.plays}×</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </button>
  )
}
