/**
 * Economia de processamento: as animações (pétalas, cursor, efeitos) param quando ninguém está vendo:
 * Agenda minimizado/na bandeja, ou um jogo aberto com o Agenda em segundo plano.
 */
import { useEffect } from "react"
import { useStore } from "./store"

let paused = false
export const perfPaused = () => paused

/** laço de animação que dorme enquanto está pausado (sem gastar quadros) */
export function rafLoop(step: () => void) {
  let raf = 0, t = 0, dead = false
  const run = () => {
    if (dead) return
    if (paused) { t = window.setTimeout(run, 500); return }
    step()
    raf = requestAnimationFrame(run)
  }
  raf = requestAnimationFrame(run)
  return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(t) }
}

export function usePerf() {
  const gaming = useStore((s) => s.gamesRunning.length > 0)
  const pauseInGame = useStore((s) => s.settings.perfPauseInGame ?? true)
  const lite = useStore((s) => !!s.settings.perfLite)
  useEffect(() => {
    const update = () => {
      paused = document.hidden || (gaming && pauseInGame && !document.hasFocus())
      document.documentElement.classList.toggle("perf-paused", paused)
    }
    update()
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", update)
    window.addEventListener("blur", update)
    return () => {
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("focus", update)
      window.removeEventListener("blur", update)
    }
  }, [gaming, pauseInGame])
  useEffect(() => { document.documentElement.classList.toggle("lite", lite) }, [lite])
}
