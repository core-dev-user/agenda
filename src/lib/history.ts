/**
 * Ctrl+Z / Ctrl+Y: desfaz e refaz o que você mexeu nos widgets e na aparência
 * (mover, mudar tamanho, tirar, adicionar, trocar cor, tema…).
 *
 * Só entra no histórico o que muda logo depois de um clique ou tecla seu: atualizações automáticas
 * (um widget guardando o próprio estado em segundo plano) não viram "ação" para desfazer.
 * Um arrasto ou um slider inteiro conta como uma ação só.
 */
import { useEffect } from "react"
import { toast } from "./toast"
import { useStore } from "./store"
import type { Settings, Widget } from "./types"

interface Snap { widgets: Widget[]; settings: Settings }
const MAX = 60
const past: Snap[] = []
const future: Snap[] = []
let lastInput = 0
let burst = 0
let recorded = -1
let restoring = false

const typing = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("input:not([type=range]):not([type=checkbox]):not([type=color]),textarea,[contenteditable=true]")

function restore(from: Snap[], to: Snap[]) {
  const snap = from.pop()
  if (!snap) return false
  const s = useStore.getState()
  to.push({ widgets: s.widgets, settings: s.settings })
  restoring = true
  useStore.setState({ widgets: snap.widgets, settings: snap.settings })
  restoring = false
  recorded = -1
  return true
}
export const undo = () => restore(past, future)
export const redo = () => restore(future, past)

/** liga o histórico e os atalhos */
export function useHistory() {
  useEffect(() => {
    let lastKey = 0
    const input = (e: Event) => {
      lastInput = Date.now()
      // digitando: as teclas seguidas viram uma ação só
      if (e.type === "keydown") {
        if (typing(e.target) && lastInput - lastKey < 1200) { lastKey = lastInput; return }
        lastKey = lastInput
      }
      burst++
    }
    const opts = { capture: true, passive: true }
    window.addEventListener("pointerdown", input, opts)
    window.addEventListener("keydown", input, opts)
    window.addEventListener("wheel", input, opts)
    // soltar o mouse (fim de um arrasto longo) também conta como "você mexeu agora"
    const up = () => { lastInput = Date.now() }
    window.addEventListener("pointerup", up, opts)

    const unsub = useStore.subscribe((s, prev) => {
      if (restoring || (s.widgets === prev.widgets && s.settings === prev.settings)) return
      // mudança automática (sem você ter mexido agora): não entra no histórico
      if (Date.now() - lastInput > 1500) return
      if (recorded === burst) return
      recorded = burst
      past.push({ widgets: prev.widgets, settings: prev.settings })
      if (past.length > MAX) past.shift()
      future.length = 0
    })

    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || typing(e.target)) return
      const z = e.key.toLowerCase() === "z", y = e.key.toLowerCase() === "y"
      if (!z && !y) return
      const isRedo = y || (z && e.shiftKey)
      e.preventDefault()
      const ok = isRedo ? redo() : undo()
      toast(ok ? (isRedo ? "Refeito" : "Desfeito") : isRedo ? "Nada para refazer" : "Nada para desfazer")
    }
    window.addEventListener("keydown", key)
    return () => {
      unsub()
      window.removeEventListener("pointerdown", input, opts)
      window.removeEventListener("keydown", input, opts)
      window.removeEventListener("wheel", input, opts)
      window.removeEventListener("pointerup", up, opts)
      window.removeEventListener("keydown", key)
    }
  }, [])
}
