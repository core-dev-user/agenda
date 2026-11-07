/**
 * Arruma os widgets bem encaixados: empacota todos (sem mudar o tamanho de ninguém) com o mesmo espaçamento,
 * sem sobrepor, longe da barra, e escolhe a largura do bloco que melhor aproveita a tela.
 * Widgets do mesmo tópico ficam juntos.
 */
import { useStore } from "./store"
import { widgetGeo } from "./viewport"
import { useUiMode } from "./uimode"
import type { Geo, Widget } from "./types"

export type ArrangeStyle = "centro" | "esquerda" | "direita" | "topo"

const GAP = 14
const M = 24

interface Item { id: string; w: number; h: number; order: number }

/** empacotamento "linha do horizonte": cada widget vai para o lugar mais alto livre, da esquerda para a direita */
function skyline(items: Item[], width: number) {
  let sky = [{ x: 0, y: 0, w: width }]
  const out = new Map<string, { x: number; y: number }>()
  let maxW = 0, maxH = 0
  for (const it of items) {
    const w = Math.min(it.w, width)
    let best: { x: number; y: number } | null = null
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x
      if (x + w > width) break
      // o espaço à direita (GAP) também precisa estar livre, menos encostado na borda
      const need = Math.min(w + GAP, width - x)
      let y = 0, j = i, covered = 0
      while (covered < need && j < sky.length) { y = Math.max(y, sky[j].y); covered = sky[j].x + sky[j].w - x; j++ }
      if (covered < need) continue
      if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y }
    }
    if (!best) best = { x: 0, y: Math.max(...sky.map((s) => s.y)) }
    out.set(it.id, best)
    // atualiza o horizonte com o novo bloco (mais o espaçamento)
    const nx = best.x, nw = w + GAP, ny = best.y + it.h + GAP
    const next: typeof sky = []
    for (const s of sky) {
      const a = s.x, b = s.x + s.w
      if (b <= nx || a >= nx + nw) { next.push(s); continue }
      if (a < nx) next.push({ x: a, y: s.y, w: nx - a })
      if (b > nx + nw) next.push({ x: nx + nw, y: s.y, w: b - (nx + nw) })
    }
    next.push({ x: nx, y: ny, w: Math.min(nw, width - nx) })
    next.sort((p, q) => p.x - q.x)
    // junta pedaços vizinhos na mesma altura
    sky = []
    for (const s of next) {
      const l = sky[sky.length - 1]
      if (l && l.y === s.y && l.x + l.w === s.x) l.w += s.w
      else if (s.w > 0) sky.push({ ...s })
    }
    maxW = Math.max(maxW, best.x + w)
    maxH = Math.max(maxH, best.y + it.h)
  }
  return { pos: out, w: maxW, h: maxH }
}

const TOPIC: Record<string, number> = {
  clock: 0, calendar: 1, agenda: 1, tasks: 2, note: 2, stopwatch: 3, weather: 4, news: 5, finance: 6,
  music: 10, pcmusic: 10, musicclip: 11, lyrics: 12, musicstats: 13,
  football: 20, cs2: 21, valorant: 21, valagent: 22, gaming: 23,
  discord: 30, whatsapp: 31, ifood: 32, sysmon: 40, photo: 50, shortcut: 60,
}

/** área livre para os widgets (sem a barra de tarefas interna) */
function freeArea() {
  const s = useStore.getState().settings
  const v = { x: M, y: M, w: innerWidth - M * 2, h: innerHeight - M * 2 }
  if (useUiMode.getState().mainBar || s.taskbar.autoHide) return v
  const band = s.taskbar.size + 28
  if (s.taskbar.position === "bottom") v.h -= band
  else if (s.taskbar.position === "top") { v.y += band; v.h -= band }
  else if (s.taskbar.position === "left") { v.x += band; v.w -= band }
  else v.w -= band
  return v
}

/** calcula as posições novas (sem aplicar) */
export function planArrange(style: ArrangeStyle = "centro", only?: string[]): Map<string, Geo> {
  const st = useStore.getState()
  const view = { w: innerWidth, h: innerHeight, portrait: innerHeight > innerWidth }
  const area = freeArea()
  const ws = st.widgets.filter((w) => !only || only.includes(w.id))
  const items: Item[] = ws
    .map((w) => { const g = widgetGeo(w, view, st.settings.layoutRef); return { id: w.id, w: Math.min(g.w, area.w), h: g.h, order: TOPIC[w.type] ?? 70 } })
    // por tópico; dentro do tópico, os maiores primeiro (encaixam melhor)
    .sort((a, b) => a.order - b.order || b.h * b.w - a.h * a.w)
  if (!items.length) return new Map()

  // testa várias larguras de bloco e fica com a que cabe na tela com o melhor aproveitamento
  const minW = Math.max(...items.map((i) => i.w))
  let best: ReturnType<typeof skyline> | null = null, bestCost = Infinity
  const step = Math.max(24, Math.round((area.w - minW) / 40))
  for (let W = minW; ; W = Math.min(area.w, W + step)) {
    const r = skyline(items, W)
    const scale = Math.max(r.w / area.w, r.h / area.h)
    const fill = items.reduce((a, i) => a + i.w * i.h, 0) / Math.max(1, r.w * r.h)
    const cost = (scale > 1 ? 10 + scale * 10 : scale) - fill * 0.35
    if (cost < bestCost) { bestCost = cost; best = r }
    if (W >= area.w) break
  }
  const r = best!
  const ox = style === "esquerda" ? area.x : style === "direita" ? area.x + area.w - r.w : area.x + Math.round((area.w - r.w) / 2)
  const oy = style === "topo" || r.h > area.h ? area.y : area.y + Math.round((area.h - r.h) / 2)
  const out = new Map<string, Geo>()
  for (const it of items) { const p = r.pos.get(it.id)!; out.set(it.id, { x: ox + p.x, y: oy + p.y, w: it.w, h: it.h }) }
  return out
}

/** aplica de uma vez (uma única alteração: o Ctrl+Z desfaz tudo junto) e devolve o layout anterior */
export function applyGeos(geos: Map<string, Geo>): Widget[] {
  const before = useStore.getState().widgets
  const portrait = innerHeight > innerWidth
  useStore.setState((s) => ({
    widgets: s.widgets.map((w) => { const g = geos.get(w.id); return g ? (portrait ? { ...w, portrait: g } : { ...w, ...g }) : w }),
    settings: portrait ? s.settings : { ...s.settings, layoutRef: { w: innerWidth, h: innerHeight } },
  }))
  return before
}

export function arrangeWidgets(style: ArrangeStyle = "centro") {
  return applyGeos(planArrange(style))
}
