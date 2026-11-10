import { create } from "zustand"
import { bridge, type ScreenRect } from "./bridge"

/**
 * Monitores dentro da janela principal. No modo área de trabalho com dois ou mais monitores, a janela do Agenda
 * cobre todos eles como uma tela só: os widgets andam livres entre os monitores, mas o papel de parede é desenhado
 * em cada um, e as abas, a busca e os avisos abrem no monitor onde você está mexendo ("ativo").
 */
interface Screens { list: ScreenRect[]; active: number }

const whole = (): ScreenRect => ({ id: 0, x: 0, y: 0, w: innerWidth, h: innerHeight, primary: true, home: true })

export const useScreens = create<Screens>(() => ({ list: [], active: 0 }))

/** a lista (ou a página inteira, se o app não informou monitores) */
export const screenList = (): ScreenRect[] => {
  const l = useScreens.getState().list
  return l.length ? l : [whole()]
}
export function useScreenList(): ScreenRect[] {
  const l = useScreens((s) => s.list)
  return l.length ? l : [whole()]
}

/** monitor que contém o ponto (ou o mais perto dele) */
export function screenAt(x: number, y: number): ScreenRect {
  const l = screenList()
  let best = l[0], bd = Infinity
  for (const s of l) {
    const dx = Math.max(s.x - x, 0, x - (s.x + s.w)), dy = Math.max(s.y - y, 0, y - (s.y + s.h))
    const d = dx * dx + dy * dy
    if (d < bd) { bd = d; best = s }
  }
  return best
}

/** monitor onde você está mexendo agora */
export function activeScreen(): ScreenRect {
  const l = screenList()
  const id = useScreens.getState().active
  return l.find((s) => s.id === id) ?? l.find((s) => s.home) ?? l[0]
}
export function useActiveScreen(): ScreenRect {
  const l = useScreenList()
  const id = useScreens((s) => s.active)
  return l.find((s) => s.id === id) ?? l.find((s) => s.home) ?? l[0]
}
export const setActiveScreen = (id: number) => { if (useScreens.getState().active !== id) useScreens.setState({ active: id }) }

/** começa a acompanhar os monitores e qual está ativo (clique em qualquer lugar da página) */
export function initScreens() {
  if (!bridge.mode.screens) return
  bridge.mode.screens().then((list) => {
    if (!list?.length) return
    useScreens.setState({ list, active: (list.find((s) => s.home) ?? list[0]).id })
  }).catch(() => {})
  bridge.mode.onScreens((list) => useScreens.setState({ list }))
  window.addEventListener("pointerdown", (e) => { if (useScreens.getState().list.length > 1) setActiveScreen(screenAt(e.clientX, e.clientY).id) }, true)
}
