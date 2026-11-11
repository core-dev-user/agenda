/**
 * Cachorrinho em pixel art (mesmo esquema do gatinho: formas simples + contorno automático, grade 32×24,
 * olhando para a direita). Cabeça de perfil com focinho, orelha caída, coleira e rabo abanando.
 */
import { B, G, GH, Grid, K, L, LID, O, P, S, T, X, type Pal } from "./grid"
import type { Coat, Pose } from "./sprites"

const base = (o: Partial<Pal>): Pal => ({ [G]: "#ffffff", [P]: "#ff8fa3", ...o }) as Pal

// T = orelha / manchas · X = coleira
export const DOG_COATS: Record<string, Coat> = {
  caramel: { label: "Caramelo", pal: base({ [O]: "#2b1a12", [B]: "#e0a15e", [S]: "#b9773d", [L]: "#f8dcb2", [K]: "#22150f", [T]: "#a8642e", [X]: "#e2475f" }) },
  choco: { label: "Chocolate", pal: base({ [O]: "#1d120d", [B]: "#7a4b2e", [S]: "#5b3520", [L]: "#b9845c", [K]: "#140c08", [T]: "#4a2a18", [X]: "#3fa9f5" }) },
  black: { label: "Pretinho", pal: base({ [O]: "#0e0b10", [B]: "#36313b", [S]: "#25212a", [L]: "#d9c8b4", [K]: "#f2c14e", [T]: "#24202a", [X]: "#ff6b8b", [LID]: "#a99cc0" }) },
  dalmatian: { label: "Dálmata", pal: base({ [O]: "#2a2530", [B]: "#f7f4f0", [S]: "#dad3cc", [L]: "#ffffff", [K]: "#231d27", [T]: "#2c2730", [X]: "#e2475f" }), patches: true },
  husky: { label: "Husky", pal: base({ [O]: "#1f2129", [B]: "#7d8494", [S]: "#5f6575", [L]: "#f1f3f7", [K]: "#4aa8ff", [T]: "#5a6070", [X]: "#f2c14e" }), points: true },
  golden: { label: "Golden", pal: base({ [O]: "#2b1d0e", [B]: "#f0c56e", [S]: "#cf9c45", [L]: "#fbe7b6", [K]: "#22170c", [T]: "#d99b3e", [X]: "#4caf7d" }) },
}

type Eyes = "open" | "blink" | "happy" | "closed" | "squint"

/** cabeça de perfil, centro do crânio em (hx, hy) */
function head(g: Grid, hx: number, hy: number, o: { eyes: Eyes; ear?: number; tongue?: boolean; mouth?: boolean }, c: Coat) {
  const ear = o.ear ?? 0
  g.oval(hx, hy, 3.6, 3.1, B)
  g.oval(hx + 3.4, hy + 1.3, 2.6, 1.7, B) // focinho
  g.paint(hx + 3, hy + 2.4, L); g.paint(hx + 4, hy + 2.4, L); g.paint(hx + 2, hy + 2.4, L)
  if (c.points) { g.oval(hx + 1.5, hy + 1.4, 2.4, 1.6, L); g.paint(hx + 0.6, hy - 0.4, L) }
  if (c.patches) { g.paint(hx - 1, hy - 2, T); g.paint(hx + 2, hy + 0.4, T) }
  // nariz
  g.set(hx + 5.6, hy + 0.4, K); g.set(hx + 5.6, hy + 1.2, K); g.set(hx + 4.8, hy + 0.4, K)
  // orelha caída
  g.oval(hx - 1.3, hy + 0.8 + ear, 1.3, 2.7, T, 0.25)
  // olho
  const ex = hx + 0.9, ey = hy - 1
  if (o.eyes === "open") { g.paint(ex, ey, K); g.paint(ex + 1, ey, K); g.paint(ex, ey + 1, K); g.paint(ex + 1, ey + 1, K); g.paint(ex, ey, G) }
  else if (o.eyes === "happy") { g.paint(ex, ey + 1, LID); g.paint(ex + 1, ey, LID); g.paint(ex + 2, ey + 1, LID) }
  else { g.paint(ex, ey + 1, LID); g.paint(ex + 1, ey + 1, LID) }
  // língua para fora (feliz / correndo)
  if (o.tongue) { g.set(hx + 3, hy + 3.2, P); g.set(hx + 3, hy + 4, P); g.set(hx + 4, hy + 3.2, P) }
  else if (o.mouth) g.paint(hx + 3, hy + 2.4, S)
}

/** coleira em volta do pescoço */
function collar(g: Grid, x0: number, y0: number, x1: number, y1: number) {
  for (let i = 0; i <= 3; i++) {
    const t = i / 3
    g.paint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, X)
  }
}

function leg(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number, paw: number) {
  g.line(x0, y0, x1, y1 - 1, 2, c)
  g.set(Math.round(x1) - 1, Math.round(y1), paw); g.set(Math.round(x1), Math.round(y1), paw); g.set(Math.round(x1) + 1, Math.round(y1), paw)
}

function spots(g: Grid, cx: number, cy: number) {
  g.paint(cx - 4, cy - 1, T); g.paint(cx - 3, cy - 1, T); g.paint(cx + 1, cy - 2, T); g.paint(cx + 4, cy, T); g.paint(cx - 1, cy + 1, T); g.paint(cx + 2, cy + 1, T); g.paint(cx - 6, cy + 1, T)
}

export function drawDog(p: Pose, c: Coat): Uint8Array {
  const g = new Grid()
  const ground = GH - 2
  const pawC = c.points ? L : c.patches ? B : L
  const farC = S
  const tailC = c.points ? T : B

  if (p.k === "stand") {
    const cr = p.crouch ?? 0
    const stride = p.run ? 3 : 2
    const bob = p.move ? Math.round(Math.abs(Math.sin(p.phase * Math.PI * 2)) * (p.run ? 1.4 : 0.8)) : 0
    const by = 14.5 + cr - bob * 0.6
    const legAt = (bx: number, off: number, col: number) => {
      const ph = (p.phase + off) * Math.PI * 2
      const dx = p.move ? Math.sin(ph) * stride : 0
      const lift = p.move && Math.cos(ph) > 0.2 ? (p.run ? 2 : 1) : 0
      leg(g, bx, by + 1.5, bx + dx, ground - lift, col, col === farC ? farC : pawC)
    }
    legAt(11, 0.5, farC); legAt(20, 0, farC)
    // rabo abanando para cima
    const w = p.move ? p.tail : p.tail * 1.6
    g.curve(7.5, by - 1.5, 4.5, by - 3, 4 + w * 1.6, by - 7.5, 2, tailC, c.points ? L : undefined)
    g.oval(15, by, p.run ? 9 : 8.6, 4, B)
    g.oval(15.5, by + 2.4, 5.6, 1.3, L)
    if (c.points) g.oval(15, by - 1.8, 7.2, 1.8, T)
    if (c.patches) spots(g, 15, by)
    legAt(9, 0, B); legAt(22, 0.5, B)
    const hx = 24 + (p.run ? 1 : 0), hy = by - 5.5 + cr * 0.8 + (p.run ? 1.5 : 0)
    g.line(20.5, by - 1, hx - 1, hy + 1.5, 4, B) // pescoço
    collar(g, hx - 2.5, hy + 0.5, hx - 0.5, hy + 3.4)
    head(g, hx, hy, { eyes: p.eyes, ear: p.run ? -0.8 : 0, tongue: p.run || p.eyes === "happy", mouth: true }, c)
  } else if (p.k === "sit") {
    // sentado de perfil, rabo varrendo o chão
    g.curve(9, ground - 0.5, 5, ground + 0.5, 3 + p.tail * 1.4, ground - 1.5 - Math.abs(p.tail), 2, tailC)
    g.oval(13.5, 18, 5.6, 4.6, B) // quadril
    g.oval(18, 14.5, 4, 5.6, B) // peito
    g.oval(19.2, 16, 2, 3.6, L)
    if (c.points) g.oval(13, 15.5, 4, 1.8, T)
    if (c.patches) spots(g, 14, 17)
    leg(g, 16.5, 17, 16.5, ground, farC, farC)
    if (p.paw) leg(g, 19.5, 15, 22 + p.paw, 13 - p.paw, B, pawC) // dá a patinha
    else leg(g, 19.5, 17, 19.5, ground, B, pawC)
    g.rect(9, ground - 1, 5, 2, B)
    g.set(13, ground, pawC); g.set(12, ground, pawC); g.set(14, ground, pawC)
    collar(g, 18, 10.5, 20.5, 12.5)
    head(g, 21, 7.5, { eyes: p.eyes, tongue: p.eyes === "happy" || !!p.paw, mouth: true }, c)
  } else if (p.k === "sleep") {
    const br = p.breath
    g.curve(6, ground - 1, 4, ground + 1, 12 + p.tail * 0.5, ground, 2, tailC)
    g.oval(14, ground - 2.8 - br * 0.3, 9, 3.9 + br * 0.45, B)
    if (c.points) g.oval(13, ground - 5, 6.4, 1.6, T)
    if (c.patches) spots(g, 14, ground - 3)
    // cabeça deitada nas patas
    g.rect(20, ground - 1, 6, 2, B)
    g.set(25, ground, pawC); g.set(26, ground, pawC)
    head(g, 22.5, ground - 3.4 - br * 0.2, { eyes: "closed", ear: 1 }, c)
  } else if (p.k === "jump") {
    const a = -0.3
    g.curve(8, 12, 4, 10, 2.5 + p.tail, 6.5, 2, tailC)
    leg(g, 11, 14.5, 6, 18.5, farC, farC)
    leg(g, 20.5, 11.5, 25, 10.5, farC, farC)
    g.oval(15, 12, 8.6, 3.6, B, a)
    g.oval(15.5, 14, 5, 1.2, L, a)
    if (c.points) g.oval(14.5, 10, 6.4, 1.5, T, a)
    if (c.patches) spots(g, 15, 12)
    leg(g, 9, 14.5, 4, 17.5, B, pawC)
    leg(g, 22, 10.5, 27, 8.5, B, pawC)
    head(g, 25, 5.5, { eyes: "happy", ear: -1.2, tongue: true }, c)
  } else if (p.k === "fall") {
    g.curve(8, 12.5, 4, 10, 3 + p.tail, 6, 2, tailC)
    leg(g, 11, 15, 9, 21, farC, farC)
    leg(g, 20, 15, 22, 21, farC, farC)
    g.oval(15, 13, 8.4, 3.8, B, 0.1)
    g.oval(15.5, 15, 5, 1.2, L, 0.1)
    if (c.points) g.oval(14.5, 11, 6.4, 1.5, T, 0.1)
    if (c.patches) spots(g, 15, 13)
    leg(g, 9, 15, 7, 21, B, pawC)
    leg(g, 22, 15, 24, 21, B, pawC)
    head(g, 24.5, 8, { eyes: "open", ear: -1.5 }, c)
  } else if (p.k === "stretch") {
    // "reverência": peito no chão, bumbum para cima, rabo abanando
    const a = p.amt
    g.curve(8, 11 - a, 4.5, 8 - a, 4 + p.tail * 1.5, 3.5 - a, 2, tailC)
    leg(g, 10.5, 14 - a, 10.5, ground, farC, farC)
    g.oval(15, 14.5 - a * 0.3, 8.4, 3.6, B, 0.22 + a * 0.08)
    if (c.points) g.oval(14, 12.5 - a * 0.3, 6, 1.4, T, 0.22)
    if (c.patches) spots(g, 15, 15)
    leg(g, 8.5, 14 - a, 8.5, ground, B, pawC)
    leg(g, 20, 18.5, 26 + a, ground, farC, farC)
    leg(g, 21, 18.5, 28 + a, ground, B, pawC)
    head(g, 23.5 + a * 0.5, 15.5 + a * 0.3, { eyes: "squint", tongue: true }, c)
  } else if (p.k === "drag") {
    const s = p.swing
    g.curve(16, 18, 16 + s * 2, 21.5, 18.5 + s * 3, 22.5, 2, tailC)
    leg(g, 13.5, 16, 13 - s, 21, farC, farC)
    leg(g, 19, 16, 19 - s, 21, farC, farC)
    g.oval(16, 13, 5, 6, B, s * 0.08)
    g.oval(16.5, 14, 2.4, 4, L, s * 0.08)
    if (c.patches) spots(g, 16, 13)
    leg(g, 14, 12, 13 - s, 18, B, pawC)
    leg(g, 18.5, 12, 19 - s, 18, B, pawC)
    head(g, 15.5, 5, { eyes: "blink", ear: 1.5 }, c)
  }
  g.outline()
  return g.d
}
