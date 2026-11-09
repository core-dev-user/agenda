/**
 * Cabrinha em pixel art (mesmo esquema do gatinho: formas simples + contorno automático, grade 32×24,
 * olhando para a direita). Cabeça de perfil com chifrinhos para trás, orelha caída, barbicha e cascos.
 */
import { B, G, GH, Grid, HOOF, K, L, LID, O, P, S, T, X, type Pal } from "./grid"
import type { Coat, Pose } from "./sprites"

const base = (o: Partial<Pal>): Pal => ({ [G]: "#ffffff", [P]: "#f2a0ab", ...o }) as Pal

export const GOAT_COATS: Record<string, Coat> = {
  white: { label: "Branca", pal: base({ [O]: "#3f3a45", [B]: "#f6f3ee", [S]: "#dcd5cc", [L]: "#ffffff", [K]: "#2b2530", [T]: "#bfa985", [X]: "#cfc5b8", [HOOF]: "#4a4048" }) },
  brown: { label: "Marrom", pal: base({ [O]: "#2a1c17", [B]: "#a8724a", [S]: "#84553a", [L]: "#ecd3b4", [K]: "#1d1411", [T]: "#e6d6b6", [X]: "#5a3a28", [HOOF]: "#3a2a22" }) },
  black: { label: "Preta", pal: base({ [O]: "#110e14", [B]: "#3a3540", [S]: "#28242d", [L]: "#7a7082", [K]: "#e8c34a", [T]: "#cdbb98", [X]: "#23202a", [HOOF]: "#56505c", [LID]: "#a99cc0" }) },
  spotted: { label: "Malhada", pal: base({ [O]: "#2c2631", [B]: "#fbf8f3", [S]: "#e2dbd2", [L]: "#ffffff", [K]: "#2b2530", [T]: "#bfa985", [X]: "#3d3644", [HOOF]: "#3d3644" }), patches: true },
  alpine: { label: "Alpina", pal: base({ [O]: "#24190f", [B]: "#c48d55", [S]: "#9c6b3d", [L]: "#f3dfc0", [K]: "#1d1411", [T]: "#d8c7a4", [X]: "#2f2620", [HOOF]: "#2f2620" }), points: true },
}

type Eyes = "open" | "blink" | "happy" | "closed" | "squint"

/** cabeça de perfil, centro do crânio em (hx, hy) */
function head(g: Grid, hx: number, hy: number, o: { eyes: Eyes; horns?: "back" | "forward"; chew?: number; ear?: number }, c: Coat) {
  const ear = o.ear ?? 0
  // chifres
  if (o.horns === "forward") { g.curve(hx - 0.5, hy - 2.4, hx + 0.8, hy - 5.8, hx + 3.4, hy - 5.4, 1, T); g.curve(hx + 0.6, hy - 2.4, hx + 1.6, hy - 4.6, hx + 3.8, hy - 4.4, 1, T) }
  else { g.curve(hx - 0.4, hy - 2.4, hx - 0.6, hy - 6.2, hx - 3.6, hy - 5.6, 1, T); g.curve(hx + 0.6, hy - 2.4, hx + 0.6, hy - 5.2, hx - 2.2, hy - 5.6, 1, T) }
  // orelha caída para trás
  g.curve(hx - 1.5, hy - 0.6, hx - 3.4, hy - 0.4 + ear, hx - 5, hy + 1 + ear, 2, B)
  g.oval(hx, hy, 3.2, 2.6, B)
  const jaw = o.chew ? 0.6 : 0
  g.oval(hx + 3, hy + 1.4 + jaw * 0.5, 2.3, 1.5, B)
  // focinho e barbicha
  g.paint(hx + 4, hy + 1.6 + jaw, L); g.paint(hx + 3, hy + 2 + jaw, L)
  g.set(hx + 2, hy + 3 + jaw, S); g.set(hx + 2, hy + 4 + jaw, S); g.set(hx + 2.6, hy + 5 + jaw, S)
  if (c.points) { g.paint(hx + 1, hy, X); g.paint(hx + 2, hy + 0.6, X); g.paint(hx + 3, hy + 1, X); g.paint(hx, hy - 1, X) }
  if (c.patches) { g.paint(hx - 1, hy + 1, X); g.paint(hx - 2, hy + 1, X); g.paint(hx - 1, hy + 2, X) }
  g.paint(hx - 3.4, hy + 0.2 + ear, P)
  g.paint(hx + 5, hy + 1, S) // narina
  // olho
  const ex = hx + 0.6, ey = hy - 0.7
  if (o.eyes === "open") { g.paint(ex, ey, K); g.paint(ex + 1, ey, K) }
  else if (o.eyes === "happy") { g.paint(ex, ey + 0.4, LID); g.paint(ex + 1, ey - 0.4, LID); g.paint(ex + 2, ey + 0.4, LID) }
  else { g.paint(ex, ey + 0.5, LID); g.paint(ex + 1, ey + 0.5, LID) }
}

/** perna fina com casco */
function leg(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number) {
  g.line(x0, y0, x1, y1 - 1, 2, c)
  g.set(Math.round(x1) - 1, Math.round(y1), HOOF); g.set(Math.round(x1), Math.round(y1), HOOF)
}

export function drawGoat(p: Pose, c: Coat): Uint8Array {
  const g = new Grid()
  const ground = GH - 2
  const legC = c.points ? X : B
  const farC = c.points ? X : S

  if (p.k === "stand") {
    const cr = p.crouch ?? 0
    const stride = p.run ? 3 : 2
    const bob = p.move ? Math.round(Math.abs(Math.sin(p.phase * Math.PI * 2)) * (p.run ? 1.4 : 0.8)) : 0
    const by = 13.5 + cr - bob * 0.6
    const legAt = (bx: number, off: number, col: number) => {
      const ph = (p.phase + off) * Math.PI * 2
      const dx = p.move ? Math.sin(ph) * stride : 0
      const lift = p.move && Math.cos(ph) > 0.2 ? (p.run ? 2 : 1) : 0
      leg(g, bx, by + 2, bx + dx, ground - lift, col)
    }
    legAt(11.5, 0.5, farC); legAt(19.5, 0, farC)
    g.curve(7, by - 2, 5.5, by - 4, 5 + p.tail * 0.6, by - 6, 2, c.patches ? X : B) // rabinho para cima
    g.oval(14.5, by, p.run ? 8.8 : 8.2, 3.8, B)
    g.oval(15, by + 2.3, 5, 1.2, L)
    if (c.patches) { g.oval(11, by - 1, 3, 2.2, X); g.oval(18, by - 0.5, 1.8, 1.6, X) }
    if (c.points) for (let x = 8; x < 21; x++) g.paint(x, Math.floor(by - 3.6), X)
    legAt(9.5, 0, legC); legAt(21.5, 0.5, legC)
    const hx = 24.5 + (p.run ? 1.5 : 0), hy = by - 7 + cr * 0.6 + (p.run ? 2.5 : 0)
    g.line(20, by - 1, hx - 1, hy + 1.5, 3, B) // pescoço
    head(g, hx, hy, { eyes: p.eyes, ear: p.run ? -0.6 : 0 }, c)
  } else if (p.k === "sit") {
    // deitada de pernas dobradas, ruminando
    g.curve(6, 16.5, 5, 15, 4.5 + p.tail * 0.6, 13.8, 2, c.patches ? X : B)
    g.line(8.5, ground - 0.5, 4.5, ground - 0.5, 2, farC)
    g.set(3.5, ground, HOOF); g.set(4.5, ground, HOOF)
    g.oval(14, 18.2, 8.6, 3.7, B)
    if (c.patches) { g.oval(10.5, 17.4, 3, 2, X); g.oval(17, 17.6, 1.8, 1.4, X) }
    if (c.points) for (let x = 8; x < 20; x++) g.paint(x, 15, X)
    g.line(19, ground - 0.5, 24, ground - 0.5, 2, legC)
    g.set(24, ground, HOOF); g.set(25, ground, HOOF)
    g.line(19, 17, 22, 12, 3, B)
    head(g, 23, 10, { eyes: p.eyes, chew: p.paw ? (p.paw >= 1 ? 1 : 0) : 0 }, c)
  } else if (p.k === "sleep") {
    const br = p.breath
    g.curve(6, 17.5, 5, 16.5, 4.5 + p.tail * 0.3, 15.8, 2, c.patches ? X : B)
    g.line(8.5, ground - 0.5, 4.5, ground - 0.5, 2, farC)
    g.set(3.5, ground, HOOF); g.set(4.5, ground, HOOF)
    g.oval(14, 18.7 - br * 0.2, 8.8, 3.3 + br * 0.45, B)
    if (c.patches) { g.oval(10.5, 18, 3, 2, X); g.oval(17, 18, 1.8, 1.4, X) }
    if (c.points) for (let x = 8; x < 20; x++) g.paint(x, 16, X)
    g.line(19, 19, 23, 19.5, 3, B)
    head(g, 24.5, 19.4 - br * 0.15, { eyes: "closed", ear: 1 }, c)
  } else if (p.k === "jump") {
    // pulo de cabrito: patas da frente dobradas, de trás esticadas
    const a = -0.22
    g.curve(7, 10.5, 5.5, 8.5, 4.5 + p.tail * 0.5, 7.5, 2, c.patches ? X : B)
    leg(g, 12, 13.5, 7, 17.5, farC)
    leg(g, 21, 12, 25, 14.5, farC)
    g.oval(14.5, 12, 8.2, 3.5, B, a)
    g.oval(15, 14, 5, 1.1, L, a)
    if (c.patches) g.oval(11.5, 12, 3, 2, X, a)
    leg(g, 10, 14, 5, 18, legC)
    leg(g, 19.5, 13, 23.5, 15.5, legC)
    g.line(20, 10, 23.5, 7.5, 3, B)
    head(g, 25, 6, { eyes: "happy", ear: -0.6 }, c)
  } else if (p.k === "fall") {
    g.curve(7, 11, 5.5, 9, 4.5 + p.tail * 0.5, 7.8, 2, c.patches ? X : B)
    leg(g, 11.5, 14.5, 10, 21, farC)
    leg(g, 19.5, 14.5, 21, 21, farC)
    g.oval(14.5, 12.5, 8.2, 3.8, B, 0.08)
    g.oval(15, 14.6, 5, 1.2, L, 0.08)
    if (c.patches) g.oval(11, 12, 3, 2.2, X)
    leg(g, 9.5, 14.5, 7.5, 21, legC)
    leg(g, 21.5, 14.5, 23.5, 21, legC)
    g.line(20, 11, 23.5, 7.5, 3, B)
    head(g, 24.5, 6.5, { eyes: "open", ear: -1 }, c)
  } else if (p.k === "stretch") {
    // cabeça baixa, chifres para a frente (espreguiçando / pronta para uma marradinha)
    const a = p.amt
    g.curve(7, 11 - a * 0.5, 5.5, 9 - a * 0.5, 4.5 + p.tail * 0.5, 7.5 - a * 0.5, 2, c.patches ? X : B)
    leg(g, 11.5, 15 - a * 0.5, 11.5, ground, farC)
    g.oval(14.5, 13.5 - a * 0.3, 8.2, 3.6, B, 0.12 + a * 0.05)
    if (c.patches) g.oval(11, 13, 3, 2, X)
    leg(g, 9.5, 15 - a * 0.5, 9.5, ground, legC)
    leg(g, 19.5, 16, 23 + a, ground, farC)
    leg(g, 21, 16, 25 + a, ground, legC)
    g.line(20, 15, 23.5, 15.5 + a * 0.4, 3, B)
    head(g, 25.5 + a * 0.4, 15 + a * 0.5, { eyes: "squint", horns: "forward" }, c)
  } else if (p.k === "drag") {
    const s = p.swing
    leg(g, 14, 17, 13.5 - s, 22, farC)
    leg(g, 18, 17, 17.5 - s, 22, farC)
    g.oval(16, 13, 4.4, 6, B, s * 0.08)
    if (c.patches) g.oval(15, 11.5, 2.4, 2, X)
    leg(g, 15, 17, 15 - s, 22.5, legC)
    leg(g, 17, 10, 19.5 - s, 15, legC)
    g.set(16 + s, 19.5, B)
    head(g, 17, 4, { eyes: "blink", ear: 1 }, c)
  }
  g.outline()
  return g.d
}
