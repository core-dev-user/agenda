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
    // mouse em cima do Agenda (mesmo sem clicar, com o jogo no outro monitor) = alguém está olhando:
    // volta a desenhar na hora, senão a seta personalizada some até o primeiro clique
    let lastMove = 0
    let t: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      const looking = document.hasFocus() || Date.now() - lastMove < 4000
      paused = document.hidden || (gaming && pauseInGame && !looking)
      document.documentElement.classList.toggle("perf-paused", paused)
    }
    const moved = () => {
      lastMove = Date.now()
      if (paused) update()
      clearTimeout(t)
      t = setTimeout(update, 4100)
    }
    update()
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", update)
    window.addEventListener("blur", update)
    window.addEventListener("pointermove", moved, { passive: true })
    return () => {
      clearTimeout(t)
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("focus", update)
      window.removeEventListener("blur", update)
      window.removeEventListener("pointermove", moved)
    }
  }, [gaming, pauseInGame])
  useEffect(() => { document.documentElement.classList.toggle("lite", lite) }, [lite])
}
