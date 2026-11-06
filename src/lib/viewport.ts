import { useEffect, useState } from "react"
import type { Geo, Widget } from "./types"

export interface Viewport {
  w: number
  h: number
  portrait: boolean
}

const read = (): Viewport => ({ w: innerWidth, h: innerHeight, portrait: innerHeight > innerWidth })

/** Tamanho da área do app, atualizado ao redimensionar ou trocar de monitor (em pé/deitado). */
export function useViewport() {
  const [v, setV] = useState(read)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const on = () => {
      clearTimeout(t)
      t = setTimeout(() => setV(read()), 60)
    }
    window.addEventListener("resize", on)
    return () => {
      clearTimeout(t)
      window.removeEventListener("resize", on)
    }
  }, [])
  return v
}

const M = 8

/** Garante que um retângulo caiba e fique visível na tela. */
export function fitGeo(g: Geo, v: Viewport, minW = 140, minH = 100): Geo {
  const w = Math.max(minW, Math.min(g.w, v.w - M * 2))
  const h = Math.max(minH, Math.min(g.h, v.h - M * 2))
  return {
    w,
    h,
    x: Math.round(Math.max(M, Math.min(g.x, v.w - w - M))),
    y: Math.round(Math.max(M, Math.min(g.y, v.h - h - M))),
  }
}

/**
 * Geometria do widget para a orientação atual.
 * Em pé sem layout próprio: redistribui proporcionalmente a partir do layout deitado.
 */
export function widgetGeo(wd: Widget, v: Viewport, ref: { w: number; h: number } | undefined): Geo {
  if (v.portrait) {
    if (wd.portrait) return fitGeo(wd.portrait, v)
    const rw = ref?.w || 1920
    const rh = ref?.h || 1080
    const cx = ((wd.x + wd.w / 2) / rw) * v.w
    const cy = ((wd.y + wd.h / 2) / rh) * v.h
    const w = Math.min(wd.w, v.w - 16)
    return fitGeo({ w, h: wd.h, x: cx - w / 2, y: cy - wd.h / 2 }, v)
  }
  return fitGeo(wd, v)
}
