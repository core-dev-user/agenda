import { useEffect } from "react"
import { create } from "zustand"
import { bridge, type WebAppId, type WebAppState } from "./bridge"
import { useStore } from "./store"
import type { SectionId } from "./types"

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
    let raf = 0
    let last = ""
    const loop = () => {
      const el = slot.current
      const st = useStore.getState()
      const me = st.windows.find((w) => w.id === (id as SectionId))
      const open = st.windows.filter((w) => !w.minimized)
      const top = open.length ? Math.max(...open.map((w) => w.z)) : -1
      let key = "off"
      let b: { x: number; y: number; w: number; h: number; radius: number } | null = null
      if (el && me && !me.minimized && me.z === top && !document.querySelector("[data-modal]")) {
        const r = el.getBoundingClientRect()
        const x = Math.max(0, r.left), y = Math.max(0, r.top)
        const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y
        if (w > 40 && h > 40) {
          b = { x, y, w, h, radius: parseFloat(getComputedStyle(el).borderRadius) || 0 }
          key = [x, y, w, h].map(Math.round).join(",")
        }
      }
      if (key !== last) { last = key; bridge.webapp.embed(id, b) }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => { cancelAnimationFrame(raf); bridge.webapp.embed(id, null) }
  }, [enabled, id])
}
