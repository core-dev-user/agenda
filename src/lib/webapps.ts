import { useEffect } from "react"
import { create } from "zustand"
import { bridge, type WebAppId, type WebAppState } from "./bridge"
import { useStore } from "./store"
import type { SectionId } from "./types"
import { perfEmbedHz } from "./perf"

/** Estado vindo do processo principal (aberto? encaixado? janela separada? call do Discord…) */
export const useWebApps = create<Partial<Record<WebAppId, WebAppState>>>(() => ({}))
bridge.webapp.onState((s) => useWebApps.setState((all) => ({ [s.id]: { ...all[s.id], ...s } })))

/**
 * Mantém o app web encaixado exatamente sobre `slot`. O painel é uma camada nativa (fica por cima
 * de tudo), então só aparece quando a janela do app está na frente, não minimizada e sem diálogo aberto.
 */
export function useEmbedSlot(id: WebAppId, slot: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = ""
    const check = () => {
      const el = slot.current
      const st = useStore.getState()
      const me = st.windows.find((w) => w.id === (id as SectionId))
      let top = -1
      for (const w of st.windows) if (!w.minimized && w.z > top) top = w.z
      let key = "off"
      let b: { x: number; y: number; w: number; h: number; radius: number } | null = null
      if (!document.hidden && el && me && !me.minimized && me.z === top && !document.querySelector("[data-modal]")) {
        const r = el.getBoundingClientRect()
        const x = Math.max(0, r.left), y = Math.max(0, r.top)
        const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y
        if (w > 40 && h > 40) {
          const radius = parseFloat(getComputedStyle(el).borderRadius) || 0
          b = { x, y, w, h, radius }
          key = [x, y, w, h, radius].map(Math.round).join(",")
        }
      }
      if (key !== last) { last = key; void bridge.webapp.embed(id, b) }
    }
    const tick = () => {
      if (!alive) return
      check()
      // Quadro nativo parado: não consultar DOM a 60 FPS. Taxa adaptável.
      timer = setTimeout(tick, Math.round(1000 / perfEmbedHz()))
    }
    const onMove = (event: PointerEvent) => {
      if (!event.buttons || frame) return
      frame = requestAnimationFrame(() => { frame = 0; check() })
    }
    const off = useStore.subscribe((state, prev) => {
      if (state.windows !== prev.windows) check()
    })
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null
    if (slot.current) observer?.observe(slot.current)
    tick()
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("resize", check)
    window.addEventListener("scroll", check, true)
    document.addEventListener("visibilitychange", check)
    return () => {
      alive = false
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      off()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("resize", check)
      window.removeEventListener("scroll", check, true)
      document.removeEventListener("visibilitychange", check)
      void bridge.webapp.embed(id, null)
    }
  }, [enabled, id, slot])
}
