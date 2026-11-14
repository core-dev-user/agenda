/**
 * Orçamento de CPU de animações: limita atualizações sem alterar o tempo lógico
 * de músicas, relógios ou notificações. Pausa automaticamente quando não há tela.
 */
import { useEffect } from "react"
import { useStore } from "./store"
import { performanceBudget, petAnimationFps } from "./perf-policy"
import { bridge } from "./bridge"

let paused = false
/** jogo conhecido aberto, ou outro programa em tela cheia na frente (um jogo que o Widgy não reconhece) */
const inGame = (s: { gamesRunning: unknown[]; fullscreenOther?: boolean }) => s.gamesRunning.length > 0 || !!s.fullscreenOther
export const perfPaused = () => paused
export const perfVisualFps = () => {
  const s = useStore.getState()
  return performanceBudget(s.settings, inGame(s)).fps
}
export const perfPetFps = () => {
  const s = useStore.getState()
  return petAnimationFps(s.settings, inGame(s))
}
export const perfEmbedHz = () => {
  const s = useStore.getState()
  return performanceBudget(s.settings, inGame(s)).embedHz
}

/** Cada visualização usa apenas a taxa configurada; não fica desenhando a 60 FPS à toa. */
export function rafLoop(step: () => void) {
  let raf = 0, timer: ReturnType<typeof setTimeout> | undefined
  let dead = false
  const run = () => {
    if (dead) return
    if (paused || document.hidden) {
      timer = setTimeout(() => { if (!dead) raf = requestAnimationFrame(run) }, 450)
      return
    }
    step()
    const fps = perfVisualFps()
    if (fps >= 55) raf = requestAnimationFrame(run)
    else timer = setTimeout(() => { if (!dead) raf = requestAnimationFrame(run) }, Math.max(6, 1000 / fps - 2))
  }
  raf = requestAnimationFrame(run)
  return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(timer) }
}

export function usePerf() {
  const gaming = useStore((s) => inGame(s))
  const pauseInGame = useStore((s) => s.settings.perfPauseInGame ?? true)
  const lite = useStore((s) => !!s.settings.perfLite)
  const monitorMs = useStore((s) => performanceBudget(s.settings, inGame(s)).monitorMs)
  const fps = useStore((s) => performanceBudget(s.settings, inGame(s)).fps)
  useEffect(() => { void bridge.sysmon.rate(monitorMs).catch(() => {}) }, [monitorMs])
  useEffect(() => { window.dispatchEvent(new Event("widgy:perf-settings")) }, [fps])
  useEffect(() => {
    let lastMove = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      const looking = document.hasFocus() || Date.now() - lastMove < 4000
      const next = document.hidden || (gaming && pauseInGame && !looking)
      const changed = paused !== next
      paused = next
      document.documentElement.classList.toggle("perf-paused", paused)
      if (changed) window.dispatchEvent(new Event("widgy:perf-state"))
    }
    const moved = () => {
      // Só acompanhar o cursor enquanto há um jogo: pointermove ocorre dezenas
      // de vezes por segundo e agendar um timeout em cada evento é desperdício.
      if (!gaming || !pauseInGame) return
      const now = Date.now()
      if (now - lastMove < 240) return
      lastMove = now
      if (paused) update()
      clearTimeout(timer)
      timer = setTimeout(update, 4100)
    }
    update()
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", update)
    window.addEventListener("blur", update)
    window.addEventListener("pointermove", moved, { passive: true })
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("focus", update)
      window.removeEventListener("blur", update)
      window.removeEventListener("pointermove", moved)
    }
  }, [gaming, pauseInGame])
  useEffect(() => { document.documentElement.classList.toggle("lite", lite) }, [lite])
}
