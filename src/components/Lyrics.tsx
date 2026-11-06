import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, MicVocal } from "lucide-react"
import { bridge } from "@/lib/bridge"
import { lineAt, useLyrics, type LyricLine } from "@/lib/lyrics"
import { cn } from "@/lib/utils"
import { useMusic, useMusicTime } from "./MusicPlayer"

// a letra costuma vir um pouco "atrasada" em relação ao áudio: adianta um tiquinho
const LEAD = 0.25

function useCurrentLyrics(enabled = true) {
  const m = useMusic()
  const ly = useLyrics(m.ad ? undefined : m.title, m.artist, m.duration, enabled && !!m.ready)
  return { m, ly }
}

function Status({ ly, small }: { ly: ReturnType<typeof useLyrics>; small?: boolean }) {
  const m = useMusic()
  if (!m.ready) return <div className={cn("text-fg-muted", small ? "text-xs" : "text-sm")}>Toque uma música no YouTube Music</div>
  if (m.ad) return <div className={cn("text-fg-muted", small ? "text-xs" : "text-sm")}>Anúncio… a letra volta já</div>
  if (ly === null) return <div className={cn("flex items-center gap-2 text-fg-muted", small ? "text-xs" : "text-sm")}><Loader2 size={small ? 12 : 15} className="animate-spin" /> Procurando a letra…</div>
  return <div className={cn("flex items-center gap-2 text-fg-muted", small ? "text-xs" : "text-sm")}><MicVocal size={small ? 12 : 15} /> Letra não encontrada para esta música</div>
}

/** Aparência da letra (cada widget pode ter a sua). */
export interface LyricsLook {
  /** família CSS da fonte */
  font?: string
  /** cor da linha cantada (as outras usam a mesma cor mais apagada) */
  color?: string
  /** tamanho base em px */
  size?: number
}
const dim = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

/** Letra rolando, linha atual em destaque (estilo Apple Music). Clicar numa linha pula para ela. */
export function LyricsScroll({ className, align = "left", look, compact }: { className?: string; align?: "left" | "center"; look?: LyricsLook; compact?: boolean }) {
  const { ly } = useCurrentLyrics()
  const t = useMusicTime() + LEAD
  const box = useRef<HTMLDivElement>(null)
  const lines: LyricLine[] | null = ly && ly.synced ? ly.synced : null
  const idx = lines ? lineAt(lines, t) : -1
  const size = look?.size ?? (compact ? 16 : 19)
  const color = look?.color || "var(--fg)"
  const font = look?.font || "var(--font-display)"

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${Math.max(0, idx)}"]`)
    const c = box.current
    if (!el || !c) return
    c.scrollTo({ top: el.offsetTop - c.clientHeight * (compact ? 0.32 : 0.38), behavior: "smooth" })
  }, [idx, compact])

  if (!ly) return <div className={cn("flex h-full items-center justify-center p-3 text-center", className)}><Status ly={ly} small={compact} /></div>
  if (!lines)
    return (
      <div className={cn("h-full overflow-auto leading-relaxed whitespace-pre-line", compact ? "p-3" : "p-5", className)} style={{ fontFamily: font, fontSize: size * 0.8, color: dim(color, 85) }}>
        <div className="mb-2 text-xs text-fg-muted">Letra sem sincronia</div>
        {ly.plain}
      </div>
    )
  return (
    <div
      ref={box}
      className={cn("relative h-full overflow-auto [scrollbar-width:none]", compact ? "px-3 py-[22%]" : "px-5 py-[35%]", align === "center" && "text-center", className)}
      style={{ maskImage: "linear-gradient(transparent, #000 16%, #000 80%, transparent)", fontFamily: font }}
      data-nodrag
    >
      {lines.map((l, i) => {
        const d = i - idx
        const active = d === 0
        return (
          <div
            key={i}
            data-i={i}
            onClick={() => bridge.music.cmd("seek", l.t)}
            className={cn("cursor-pointer leading-snug font-semibold transition-all duration-500 hover:opacity-100", compact ? "py-1" : "py-1.5", !l.text && "py-2")}
            style={{
              fontSize: active ? size * 1.2 : size,
              color: active ? color : dim(color, d < 0 ? 28 : 38),
              filter: active || Math.abs(d) > 6 ? undefined : `blur(${Math.min(1.6, Math.abs(d) * 0.35)}px)`,
              textShadow: active ? `0 0 18px ${dim(color, 35)}` : undefined,
            }}
          >
            {l.text || "♪"}
          </div>
        )
      })}
      {!compact && <div className="pt-6 text-xs text-fg-muted">Letra: {ly.source} · lrclib.net</div>}
    </div>
  )
}

/**
 * Linha atual se preenchendo como karaokê.
 * lines: 1 = só a linha atual (cortada se não couber) · 2 = linha atual quebrando em até 2 linhas
 * · 3 = linha atual (até 2 linhas) + a próxima embaixo
 */
export function LyricsKaraoke({ className, size, lines: nLines = 3, look }: { className?: string; size?: number; lines?: 1 | 2 | 3; look?: LyricsLook }) {
  const { ly } = useCurrentLyrics()
  const t = useMusicTime() + LEAD
  const lines = ly && ly.synced ? ly.synced : null
  const fs = look?.size ?? size ?? 15
  const color = look?.color || "var(--fg)"
  const font = look?.font || "var(--font-display)"
  if (!lines) return <div className={cn(nLines === 1 ? "min-h-[1.4em]" : "min-h-[2.6em]", className)}><Status ly={ly} small /></div>
  const idx = lineAt(lines, t)
  const cur = idx >= 0 ? lines[idx] : null
  const next = lines.slice(idx + 1).find((l) => l.text)
  const endT = lines[idx + 1]?.t ?? (cur ? cur.t + 4 : 0)
  const pct = cur ? Math.max(0, Math.min(1, (t - cur.t) / Math.max(0.5, endT - cur.t))) : 0
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ fontSize: fs, fontFamily: font }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={idx}
          initial={{ y: 14, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -14, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* preenchimento letra por letra: funciona mesmo quando a linha quebra */}
          <div className={cn("leading-snug font-semibold", nLines === 1 ? "truncate" : "line-clamp-2")}>
            {(() => {
              const text = cur?.text || (idx < 0 ? "♪ …" : "♪")
              const k = Math.round(pct * text.length)
              return (
                <>
                  <span style={{ color }}>{text.slice(0, k)}</span>
                  <span style={{ color: dim(color, 45) }}>{text.slice(k)}</span>
                </>
              )
            })()}
          </div>
          {nLines === 3 && <div className="truncate text-[0.8em] leading-snug" style={{ color: dim(color, 55) }}>{next?.text ?? ""}</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
