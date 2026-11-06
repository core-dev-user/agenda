/**
 * Copiar e colar a configuração de um widget em outro.
 * Mesmo tipo: copia tudo (estilo, opções, aparência, fundo). Tipos diferentes: só a aparência
 * (fundo, borda, cantos, sombra, cores, fonte, opacidade e imagem de fundo).
 */
import { useStore } from "./store"
import type { Widget, WidgetType } from "./types"

interface Clip { type: WidgetType; config: Record<string, any>; w: number; h: number }
const KEY = "agenda.widgetClip"
/** chaves que são "aparência" e servem para qualquer widget */
const LOOK_KEYS = ["look", "bg", "opacity", "bare"]
/** chaves que são conteúdo/estado (não fazem sentido em outro widget) */
const STATE_KEYS = ["text", "startedAt", "acc", "laps", "alerted", "rest"]

let mem: Clip | null = null
export function widgetClip(): Clip | null {
  if (mem) return mem
  try { mem = JSON.parse(localStorage.getItem(KEY) || "null") } catch { /* sem armazenamento */ }
  return mem
}

export function copyWidget(w: Widget) {
  const config = JSON.parse(JSON.stringify(w.config ?? {}))
  for (const k of STATE_KEYS) delete config[k]
  mem = { type: w.type, config, w: w.w, h: w.h }
  try { localStorage.setItem(KEY, JSON.stringify(mem)) } catch { /* ok */ }
}

/** cola no widget; devolve o que foi colado ("tudo" ou "aparência") ou null se não havia nada */
export function pasteWidget(id: string, withSize = false): "tudo" | "aparência" | null {
  const c = widgetClip()
  const st = useStore.getState()
  const w = st.widgets.find((x) => x.id === id)
  if (!c || !w) return null
  const same = c.type === w.type
  const patch: Record<string, any> = {}
  if (same) Object.assign(patch, JSON.parse(JSON.stringify(c.config)))
  else for (const k of LOOK_KEYS) patch[k] = c.config[k] !== undefined ? JSON.parse(JSON.stringify(c.config[k])) : undefined
  st.updateWidgetConfig(id, patch)
  if (withSize && same) st.setWidgetGeo(id, { x: w.x, y: w.y, w: c.w, h: c.h })
  return same ? "tudo" : "aparência"
}
