import { useStore } from "@/lib/store"
import type { Widget } from "@/lib/types"
import { NotConnected, useMusic } from "@/components/MusicPlayer"
import { LyricsKaraoke, LyricsScroll } from "@/components/Lyrics"
import { fontFamily } from "@/lib/fonts"

/** Letra da música que está tocando, sincronizada. Estilos: rolagem (Apple Music) ou karaokê. */
export function LyricsWidget({ w }: { w: Widget }) {
  const m = useMusic()
  const open = useStore((s) => s.openWindow)
  if (!m.ready) return <NotConnected small />
  const karaoke = (w.config.style ?? "scroll") === "karaoke"
  const c = w.config
  const look = (base: number) => ({ font: c.lyFont ? fontFamily(c.lyFont) : undefined, color: c.lyColor || undefined, size: Math.round(base * (c.lyScale ?? 1)) })
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {m.art && <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: `url("${m.art}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) saturate(1.5)", transform: "scale(1.4)" }} />}
      <button className="relative flex items-center gap-2 px-4 pt-3 text-left" onClick={() => open("music")} title="Abrir a aba Música">
        {m.art && <img src={m.art} className="h-8 w-8 rounded-md object-cover" draggable={false} />}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{m.title}</div>
          <div className="truncate text-xs text-fg-muted">{m.artist}</div>
        </div>
      </button>
      <div className="relative min-h-0 flex-1" data-nodrag={karaoke ? undefined : ""}>
        {karaoke ? (
          <div className="flex h-full items-center px-4"><LyricsKaraoke className="w-full" look={look(Math.max(16, Math.min(30, w.w / 16)))} /></div>
        ) : (
          <LyricsScroll align={w.config.align ?? "left"} look={look(19)} />
        )}
      </div>
    </div>
  )
}
