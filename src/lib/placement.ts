/**
 * Onde colocar um widget novo: no primeiro "buraco" livre colado nos outros widgets,
 * alinhado com as bordas deles, sem cobrir ninguém e longe da barra de tarefas.
 */
import type { Geo } from "./types"

const GAP = 14
const M = 16

export function findSpot(size: { w: number; h: number }, others: Geo[], view: { w: number; h: number }, avoid: Geo[] = []): { x: number; y: number } {
  const w = Math.min(size.w, view.w - M * 2), h = Math.min(size.h, view.h - M * 2)
  const maxX = view.w - w - M, maxY = view.h - h - M
  const center = { x: Math.round((view.w - w) / 2), y: Math.round((view.h - h) / 2) }
  const blocks = [...others, ...avoid]
  if (!others.length && !avoid.length) return center

  // posições candidatas: uma grade + encostado em cada borda dos outros (com o mesmo espaçamento)
  const xs = new Set<number>(), ys = new Set<number>()
  for (let x = M; x <= maxX; x += 24) xs.add(x)
  for (let y = M; y <= maxY; y += 24) ys.add(y)
  for (const o of others) {
    for (const x of [o.x, o.x + o.w + GAP, o.x - w - GAP, o.x + o.w - w]) if (x >= M && x <= maxX) xs.add(Math.round(x))
    for (const y of [o.y, o.y + o.h + GAP, o.y - h - GAP, o.y + o.h - h]) if (y >= M && y <= maxY) ys.add(Math.round(y))
  }
  xs.add(center.x); ys.add(center.y)

  // centro do grupo de widgets (o novo vai para perto dele)
  let cx = view.w / 2, cy = view.h / 2
  if (others.length) {
    let a = 0; cx = 0; cy = 0
    for (const o of others) { const k = o.w * o.h; cx += (o.x + o.w / 2) * k; cy += (o.y + o.h / 2) * k; a += k }
    cx /= a; cy /= a
  }
  const overlap = (x: number, y: number) => {
    let s = 0
    for (const o of blocks) {
      const ix = Math.min(x + w, o.x + o.w + GAP) - Math.max(x, o.x - GAP)
      const iy = Math.min(y + h, o.y + o.h + GAP) - Math.max(y, o.y - GAP)
      // com a tela cheia alguma sobreposição é inevitável: ficar embaixo da barra pesa mais que ficar sobre outro widget
      if (ix > 0 && iy > 0) s += ix * iy * (avoid.includes(o) ? 6 : 1)
    }
    return s
  }
  let best = center, bestCost = Infinity, bestOv = Infinity
  for (const x of xs) for (const y of ys) {
    const ov = overlap(x, y)
    if (ov > bestOv) continue
    // perto dos outros (colado na borda de alguém) e perto do centro do grupo
    let near = Infinity, aligned = 0
    for (const o of others) {
      const dx = Math.max(0, o.x - (x + w), x - (o.x + o.w))
      const dy = Math.max(0, o.y - (y + h), y - (o.y + o.h))
      near = Math.min(near, Math.hypot(dx, dy))
      if (x === o.x || x + w === o.x + o.w) aligned += 1
      if (y === o.y || y + h === o.y + o.h) aligned += 1
    }
    if (!others.length) near = 0
    const cost = Math.max(0, near - GAP) * 2 + Math.hypot(x + w / 2 - cx, y + h / 2 - cy) * 0.35 - Math.min(2, aligned) * 30
    if (ov < bestOv || cost < bestCost) { best = { x, y }; bestCost = cost; bestOv = ov }
  }
  return best
}
