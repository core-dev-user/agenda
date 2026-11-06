import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Clapperboard, ImageIcon, ListMusic, MicVocal, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, type QueueItem } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { fontFamily } from "@/lib/fonts"
import { Artwork, Controls, MiniVolume, MusicVideo, NotConnected, Progress, useMusic } from "@/components/MusicPlayer"
import { LyricsKaraoke, LyricsScroll, type LyricsLook } from "@/components/Lyrics"

/* ---------------- fila ("A seguir") ---------------- */
function useQueue(enabled: boolean) {
  const title = useMusic((s) => s.title)
  const [q, setQ] = useState<QueueItem[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => bridge.music.queue().then((r) => alive && setQ(r)).catch(() => {})
    load()
    const id = setInterval(load, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [enabled, title])
  return q
}

function Bars() {
  return (
    <span className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] rounded-sm bg-brand" style={{ height: "100%", transformOrigin: "bottom", animation: `eq-bar .9s ${i * 0.18}s ease-in-out infinite alternate` }} />
      ))}
    </span>
  )
}

function QueueList({ onClose, className }: { onClose?: () => void; className?: string }) {
  const q = useQueue(true)
  const box = useRef<HTMLDivElement>(null)
  const cur = q?.findIndex((x) => x.current) ?? -1
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-q="${cur}"]`)
    if (el && box.current) box.current.scrollTo({ top: el.offsetTop - 34, behavior: "smooth" })
  }, [cur])
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 px-1 pb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
        <ListMusic size={12} /> A seguir {q && q.length > 0 && <span className="font-normal normal-case">· {q.length}</span>}
        <div className="flex-1" />
        {onClose && <button className="btn btn-ghost btn-icon !p-1" onClick={onClose} title="Fechar a fila"><X size={12} /></button>}
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto pr-0.5" data-nodrag>
        {q === null && <div className="p-2 text-xs text-fg-muted">Carregando a fila…</div>}
        {q?.length === 0 && <div className="p-2 text-xs text-fg-muted">A fila aparece quando você toca uma playlist, álbum ou rádio.</div>}
        {q?.map((it, i) => (
          <button
            key={i + it.title}
            data-q={i}
            onClick={() => bridge.music.cmd("playQueue", it.i)}
            className={cn("flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]", it.current && "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]", i < cur && "opacity-50")}
            title={`${it.title} — ${it.artist}`}
          >
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-black/30">
              {it.img && <img src={it.img} className="h-full w-full object-cover" draggable={false} />}
              {it.current && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Bars /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-[13px] leading-tight", it.current && "font-semibold text-brand")}>{it.title}</div>
              <div className="truncate text-[11px] leading-tight text-fg-muted">{it.artist}</div>
            </div>
            <span className="font-num shrink-0 text-[10px] text-fg-muted">{it.duration}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Mini player do YouTube Music: capa/vinil/compacto, clipe, volume, letra que cresce com o card e fila. */
export function MusicWidget({ w }: { w: Widget }) {
  const m = useMusic()
  const open = useStore((s) => s.openWindow)
  const upd = useStore((s) => s.updateWidgetConfig)
  const [live, setLive] = useState(false)
  const c = w.config
  const style: "card" | "vinyl" | "compact" = c.style ?? "card"
  const video = !!c.video
  const lyrics = c.lyrics !== false
  const queue = !!c.queue
  const scale = c.lyScale ?? 1
  const look: LyricsLook = { font: c.lyFont ? fontFamily(c.lyFont) : undefined, color: c.lyColor || undefined }
  const lookAt = (base: number): LyricsLook => ({ ...look, size: Math.round(base * scale) })
  if (!m.ready) return <NotConnected small />

  const toggleVideo = () => {
    upd(w.id, { video: !video })
    // igual ao botão "Vídeo" do app: troca a faixa para a versão com clipe, se houver
    if (!video && m.hasVideo && !m.videoMode) bridge.music.cmd("videoOn")
  }
  const btn = (on: boolean, title: string, onClick: () => void, icon: React.ReactNode) => (
    <button className={cn("btn btn-ghost btn-icon !p-1.5", on && "text-brand")} title={title} onClick={onClick}>{icon}</button>
  )
  const lyricsBtn = btn(lyrics, lyrics ? "Esconder a letra" : "Mostrar a letra", () => upd(w.id, { lyrics: !lyrics }), <MicVocal size={15} />)
  const queueBtn = btn(queue, queue ? "Esconder a fila" : "Ver a fila", () => upd(w.id, { queue: !queue }), <ListMusic size={15} />)
  const clipBtn = btn(video, video ? "Mostrar a capa" : "Mostrar o clipe", toggleVideo, video ? <ImageIcon size={15} /> : <Clapperboard size={15} />)

  const title = (
    <button className="min-w-0 text-left" onClick={() => open("music")} title="Abrir a aba Música">
      <div className={cn("truncate font-semibold", style !== "compact" && !video && "pr-[118px]")}>{m.ad && <span className="mr-1.5 rounded bg-[#ffd36e] px-1 text-[10px] font-bold text-black">ANÚNCIO</span>}{m.title}</div>
      <div className="truncate text-sm text-fg-muted">{m.artist}</div>
    </button>
  )

  // fila por cima de tudo (para cards pequenos, compacto e clipe)
  const queueOverlay = (
    <AnimatePresence>
      {queue && (
        <motion.div
          className="absolute inset-0 z-20 flex flex-col p-2.5"
          style={{ background: "color-mix(in srgb, #120a14 94%, transparent)", backdropFilter: "blur(16px)" }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        >
          <QueueList className="h-full text-white [--fg:#fff]" onClose={() => upd(w.id, { queue: false })} />
        </motion.div>
      )}
    </AnimatePresence>
  )

  /* ---------- clipe ocupando o widget, controles por cima ---------- */
  if (video && style !== "compact") {
    return (
      <div className="group/clip relative h-full overflow-hidden bg-black text-white">
        <Artwork size={Math.max(w.w, w.h)} className={cn("!absolute inset-0 !h-full !w-full !rounded-none transition-opacity duration-700", live && "opacity-0")} />
        <MusicVideo quality={Math.min(1280, Math.round(w.w * devicePixelRatio))} className="absolute inset-0 h-full w-full" onLive={setLive} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/35 opacity-0 backdrop-blur-md transition-opacity group-hover/clip:opacity-100">
          <MiniVolume />{lyricsBtn}{queueBtn}{clipBtn}
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-3 [--fg:#fff] [&_.text-fg-muted]:text-white/70">
          {lyrics && <LyricsKaraoke lines={w.h >= 260 ? 3 : 2} look={lookAt(Math.max(15, Math.min(22, w.w / 24)))} className="drop-shadow-[0_2px_8px_rgb(0_0_0/.8)]" />}
          {title}
          <Progress compact />
          <div className="flex justify-center"><Controls /></div>
        </div>
        {queueOverlay}
      </div>
    )
  }

  /* ---------- compacto ---------- */
  if (style === "compact") {
    const sz = Math.min(56, w.h - 20)
    return (
      <div className="relative flex h-full items-center gap-3 px-3">
        {video ? (
          <div className="relative shrink-0 overflow-hidden rounded-[calc(var(--r)*0.45)] bg-black" style={{ width: sz * 1.78, height: sz }}>
            <Artwork size={sz} className={cn("!absolute inset-0 !h-full !w-full transition-opacity", live && "opacity-0")} />
            <MusicVideo quality={320} className="absolute inset-0 h-full w-full" onLive={setLive} />
          </div>
        ) : (
          <Artwork size={sz} />
        )}
        <div className="min-w-0 flex-1 space-y-1">{title}{lyrics && <LyricsKaraoke lines={1} look={lookAt(13)} />}<Progress compact /></div>
        <Controls />
        <div className="flex flex-col items-center">{lyricsBtn}{queueBtn}{clipBtn}</div>
        {queueOverlay}
      </div>
    )
  }

  /* ---------- cartão / vinil ---------- */
  const tools = (
    <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
      <MiniVolume />{lyricsBtn}{queueBtn}{clipBtn}
    </div>
  )
  const bg = m.art && <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: `url("${m.art}")`, backgroundSize: "cover", filter: "blur(30px) saturate(1.4)" }} />
  const art = (size: number) => (style === "vinyl" ? <Artwork size={size} round spinning={m.playing} className="relative" /> : <Artwork size={size} className="relative" />)

  // card alto: player em cima; embaixo a letra (mais linhas quanto maior o card) e a fila
  const TOP = 112
  const tall = w.h >= 250 && (lyrics || queue)
  if (tall) {
    const rest = w.h - TOP - 24 // espaço abaixo do player
    const queueH = queue ? (lyrics ? Math.max(110, Math.round(rest * 0.45)) : rest) : 0
    const lyricsH = lyrics ? rest - queueH - (queue ? 8 : 0) : 0
    return (
      <div className="relative flex h-full flex-col overflow-hidden p-3">
        {bg}
        {tools}
        <div className="relative flex shrink-0 items-center gap-3" style={{ height: TOP - 12 }}>
          {art(TOP - 16)}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pr-1">{title}<Progress compact /><Controls /></div>
        </div>
        {lyrics && (
          <div className="relative mt-2 min-h-0 overflow-hidden rounded-[calc(var(--r)*0.45)]" style={{ height: lyricsH, background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>
            {lyricsH >= 70 ? <LyricsScroll compact look={lookAt(16)} /> : <div className="flex h-full items-center px-3"><LyricsKaraoke lines={1} look={lookAt(14)} className="w-full" /></div>}
          </div>
        )}
        <AnimatePresence initial={false}>
          {queue && (
            <motion.div
              className="relative mt-2 overflow-hidden rounded-[calc(var(--r)*0.45)] p-1.5"
              style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}
              initial={{ height: 0, opacity: 0 }} animate={{ height: queueH, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            >
              <QueueList className="h-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // card baixo: tudo em linha, letra em karaokê
  const cover = Math.min(w.h - 28, w.w * (style === "vinyl" ? 0.42 : 0.36))
  const lyLines: 1 | 2 = w.h >= 200 ? 2 : 1
  return (
    <div className="relative flex h-full items-center gap-4 overflow-hidden p-3.5">
      {bg}
      {tools}
      {art(cover)}
      <div className={cn("relative flex min-w-0 flex-1 flex-col justify-center", lyrics ? "gap-1.5" : "gap-2")}>
        {title}
        {lyrics && <LyricsKaraoke lines={lyLines} look={lookAt(15)} />}
        <Progress compact={lyrics && w.h < 200} />
        <Controls />
      </div>
      {queueOverlay}
    </div>
  )
}
