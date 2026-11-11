import { useEffect, useRef } from "react"
import { Clapperboard } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import { perfEmbedHz } from "@/lib/perf"
import { Artwork, useMusic } from "@/components/MusicPlayer"
import type { Widget } from "@/lib/types"

export const CLIP_BAR = 26

/**
 * Coloca o player do YouTube Music exatamente sobre o espaço do vídeo deste widget.
 * O player é uma camada nativa (fica por cima de tudo): some quando uma janela do Agenda,
 * um menu ou uma caixa de diálogo passa por cima, e volta sozinho depois.
 */
function useClipSlot(slot: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let alive = true
    let pending: ReturnType<typeof setTimeout> | undefined
    let frame = 0
    let last = ""
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const check = () => {
      const el = slot.current
      let key = "off"
      let b: { x: number; y: number; w: number; h: number; radius: number } | null = null
      if (el && !document.hidden && !document.querySelector("[data-modal]")) {
        const r = el.getBoundingClientRect()
        const covered = [...document.querySelectorAll<HTMLElement>("[data-appwin]")].some((w) => w.style.pointerEvents !== "none" && overlaps(w.getBoundingClientRect(), r))
        if (!covered && r.width > 40 && r.height > 30) {
          b = { x: r.left, y: r.top, w: r.width, h: r.height, radius: parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0 }
          key = [b.x, b.y, b.w, b.h, b.radius].map(Math.round).join(",")
        }
      }
      if (key !== last) { last = key; void bridge.music.clip(b) }
    }
    const tick = () => {
      if (!alive) return
      check()
      pending = setTimeout(tick, Math.round(1000 / perfEmbedHz()))
    }
    // Arrastar o widget usa atualizações imediatas, mas parado não precisa de RAF.
    const moving = (ev: PointerEvent) => {
      if (!ev.buttons || frame) return
      frame = requestAnimationFrame(() => { frame = 0; check() })
    }
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null
    if (slot.current) observer?.observe(slot.current)
    tick()
    window.addEventListener("pointermove", moving, { passive: true })
    window.addEventListener("resize", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      alive = false
      clearTimeout(pending)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener("pointermove", moving)
      window.removeEventListener("resize", check)
      document.removeEventListener("visibilitychange", check)
      void bridge.music.clip(null)
    }
  }, [slot])
}

/** Widget só do clipe, no formato do vídeo, liso como no app (o próprio player, não uma cópia quadro a quadro). */
export function MusicClipWidget({ w }: { w: Widget }) {
  const m = useMusic()
  const slot = useRef<HTMLDivElement>(null)
  useClipSlot(slot)
  // ajusta o widget ao formato do clipe (16:9, 4:3, vertical…)
  useEffect(() => {
    if (!m.vw || !m.vh) return
    const h = Math.round((w.w * m.vh) / m.vw) + CLIP_BAR
    if (Math.abs(h - w.h) > 3) useStore.getState().setWidgetGeo(w.id, { x: w.x, y: w.y, w: w.w, h: Math.min(h, innerHeight - 40) })
  }, [m.vw, m.vh, w.w])
  // garante a versão em vídeo da faixa
  useEffect(() => { if (m.ready && m.hasVideo && !m.videoMode) bridge.music.cmd("videoOn") }, [m.title, m.hasVideo])

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex shrink-0 items-center gap-2 px-2.5 text-xs" style={{ height: CLIP_BAR }}>
        <Clapperboard size={12} className="shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate">{m.ready ? <><b>{m.title}</b> <span className="opacity-60">· {m.artist}</span></> : "Clipe"}</span>
      </div>
      <div ref={slot} className="relative min-h-0 flex-1 overflow-hidden" style={{ borderBottomLeftRadius: "inherit", borderBottomRightRadius: "inherit" }}>
        {/* aparece quando o player não está aqui (aba Música na frente, janela por cima…) */}
        {m.art ? <Artwork size={Math.max(w.w, w.h)} className="!absolute inset-0 !h-full !w-full !rounded-none opacity-60" /> : null}
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">{m.ready ? (m.hasVideo ? "" : "Esta faixa não tem clipe") : "Abra o YouTube Music"}</div>
      </div>
    </div>
  )
}
