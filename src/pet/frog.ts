/**
 * Sapinho em pixel art (mesmo esquema do gatinho: formas simples + contorno automático, grade 32×24,
 * olhando para a direita). Corpo agachado, olhos saltados em cima da cabeça, anda aos pulinhos
 * e mostra a língua quando está "se limpando".
 */
import { B, G, GH, Grid, K, L, LID, O, P, S, T, X, type Pal } from "./grid"
import type { Coat, Pose } from "./sprites"

const base = (o: Partial<Pal>): Pal => ({ [G]: "#ffffff", [P]: "#ff7a95", ...o }) as Pal

// T = bochecha/costas · X = pintinhas
export const FROG_COATS: Record<string, Coat> = {
  green: { label: "Verde", pal: base({ [O]: "#152418", [B]: "#6cc35a", [S]: "#4a9a42", [L]: "#e7f2b8", [K]: "#152418", [T]: "#ffaab5", [X]: "#3f8a3a" }), stripes: true },
  lime: { label: "Perereca", pal: base({ [O]: "#18290f", [B]: "#a7e04a", [S]: "#7cb432", [L]: "#f6fbd8", [K]: "#c0392b", [T]: "#ffb35c", [X]: "#7cb432" }) },
  toad: { label: "Sapo-cururu", pal: base({ [O]: "#22180f", [B]: "#a8885a", [S]: "#7f6440", [L]: "#efe0bd", [K]: "#22180f", [T]: "#c99a6a", [X]: "#6b5434" }), patches: true },
  blue: { label: "Azul", pal: base({ [O]: "#0e1630", [B]: "#3d8bff", [S]: "#2a64c4", [L]: "#bfe0ff", [K]: "#0e1630", [T]: "#9fd0ff", [X]: "#10183a" }), patches: true },
  gold: { label: "Dourado", pal: base({ [O]: "#2b1d06", [B]: "#f4c534", [S]: "#cf9a1f", [L]: "#fff2bf", [K]: "#2b1d06", [T]: "#ff9f6b", [X]: "#cf9a1f" }) },
  pink: { label: "Rosinha", pal: base({ [O]: "#3a1a2a", [B]: "#f59ac0", [S]: "#d270a0", [L]: "#ffe3ef", [K]: "#3a1a2a", [T]: "#ff6f9e", [X]: "#d270a0" }) },
}

type Eyes = "open" | "blink" | "happy" | "closed" | "squint"

/** cabeça: olhos saltados e boca larga, centro em (hx, hy) */
function head(g: Grid, hx: number, hy: number, o: { eyes: Eyes; tongue?: number; mouth?: boolean }, c: Coat) {
  g.oval(hx, hy, 4.6, 3, B)
  // olhos saltados
  g.oval(hx - 1.6, hy - 2.6, 1.8, 1.8, B)
  g.oval(hx + 2.2, hy - 2.6, 1.8, 1.8, B)
  // queixo / papo claro
  g.oval(hx + 0.6, hy + 1.8, 3.4, 1.1, L)
  g.paint(hx - 2.5, hy + 0.6, T) // bochecha
  for (const ex of [hx - 1.6, hx + 2.2]) {
    const ey = hy - 2.8
    if (o.eyes === "open") { g.paint(ex - 0.5, ey, K); g.paint(ex + 0.5, ey, K); g.paint(ex - 0.5, ey + 1, K); g.paint(ex + 0.5, ey + 1, K); g.paint(ex - 0.5, ey, G) }
    else if (o.eyes === "happy") { g.paint(ex - 1, ey + 1, LID); g.paint(ex, ey, LID); g.paint(ex + 1, ey + 1, LID) }
    else { g.paint(ex - 1, ey + 0.5, LID); g.paint(ex, ey + 0.5, LID); g.paint(ex + 1, ey + 0.5, LID) }
  }
  // boca (risquinho largo) e língua
  if (o.mouth !== false) for (let x = -2; x <= 3; x++) g.paint(hx + x, hy + 1, S)
  if (o.tongue) {
    const len = Math.round(2 + o.tongue * 4)
    for (let i = 0; i < len; i++) g.set(hx + 4 + i, hy + 1, P)
    g.set(hx + 4 + len, hy + 0.5, P); g.set(hx + 4 + len, hy + 1.5, P)
  }
}

function dots(g: Grid, cx: number, cy: number) {
  g.paint(cx - 3, cy - 2, X); g.paint(cx, cy - 3, X); g.paint(cx + 2, cy - 1, X); g.paint(cx - 1, cy - 1, X); g.paint(cx - 5, cy, X)
}
function stripe(g: Grid, cx: number, cy: number) {
  for (let x = -4; x <= 3; x++) g.paint(cx + x, cy - 3, X)
}

/** pata de trás dobrada (coxa grande + pé no chão) */
function hind(g: Grid, x: number, y: number, ground: number, c: number, ext = 0) {
  g.oval(x, y, 3.2, 2.5, c, -0.3)
  g.line(x - 1 + ext * 0.4, y + 1.5, x + 1.5 + ext, ground - 0.5, 2, c)
  g.rect(Math.round(x + ext), ground, 4, 1, c)
}
function front(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number) {
  g.line(x0, y0, x1, y1, 1.5, c)
  g.set(x1 + 1, y1, c); g.set(x1 - 0.5, y1, c)
}

export function drawFrog(p: Pose, c: Coat): Uint8Array {
  const g = new Grid()
  const ground = GH - 2

  if (p.k === "stand") {
    const cr = p.crouch ?? 0
    // anda aos pulinhos: a fase vira um saltinho
    const hop = p.move ? Math.max(0, Math.sin(p.phase * Math.PI * 2)) * (p.run ? 3 : 2) : 0
    const by = 17.5 + cr * 0.6 - hop
    hind(g, 12, by + 1, ground, S, hop * 0.6)
    g.oval(15.5, by, 7.6, 3.8, B, -0.12)
    g.oval(16.5, by + 2.2, 5, 1.2, L)
    if (c.patches) dots(g, 14.5, by)
    if (c.stripes) stripe(g, 15, by + 0.5)
    hind(g, 11, by + 1.5, ground, B, hop * 0.6)
    front(g, 20, by + 2, 21 + hop * 0.3, ground, B)
    head(g, 22, by - 2.6 + cr * 0.3, { eyes: p.eyes }, c)
  } else if (p.k === "sit") {
    // sentado mais em pé; "se limpar" = mostrar a língua
    hind(g, 12.5, 18.5, ground, S)
    g.oval(15.5, 16.5, 5.6, 5, B, -0.5)
    g.oval(17.2, 18, 3, 3, L)
    if (c.patches) dots(g, 14, 16)
    if (c.stripes) for (let y = 13; y < 19; y++) g.paint(12, y, X)
    hind(g, 11.5, 19, ground, B)
    front(g, 18.5, 18, 19.5, ground, B)
    front(g, 20, 18, 21.5, ground, B)
    head(g, 19.5, 10.5, { eyes: p.eyes, tongue: p.paw ? p.paw : 0 }, c)
  } else if (p.k === "sleep") {
    const br = p.breath
    hind(g, 11, ground - 2, ground, S)
    g.oval(15.5, ground - 2.6 - br * 0.25, 8.2, 2.8 + br * 0.4, B)
    g.oval(16.5, ground - 1, 5, 0.9, L)
    if (c.patches) dots(g, 14.5, ground - 2)
    if (c.stripes) stripe(g, 15, ground - 1.5)
    hind(g, 10, ground - 1.5, ground, B)
    head(g, 22, ground - 3 - br * 0.2, { eyes: "closed", mouth: false }, c)
  } else if (p.k === "jump") {
    // esticado no ar, patas de trás para trás
    const a = -0.35
    g.line(10, 13, 3, 18, 2, S); g.rect(1, 18, 3, 1, S)
    g.oval(15.5, 11.5, 8, 3.2, B, a)
    g.oval(16.5, 13.3, 5, 1, L, a)
    if (c.patches) dots(g, 15, 11)
    if (c.stripes) for (let x = 11; x < 19; x++) g.paint(x, 9 + (19 - x) * 0.35, X)
    g.line(10, 14, 4, 20, 2, B); g.rect(2, 20, 3, 1, B)
    front(g, 21, 10, 25, 9, B)
    head(g, 23.5, 6, { eyes: "happy" }, c)
  } else if (p.k === "fall") {
    // patas abertas, pronto para aterrissar
    hind(g, 11, 15, 21, S, -1)
    g.oval(15.5, 13, 7.6, 3.6, B, 0.05)
    g.oval(16.5, 15, 5, 1.1, L)
    if (c.patches) dots(g, 14.5, 13)
    if (c.stripes) stripe(g, 15, 13.5)
    hind(g, 10, 15.5, 21, B, -2)
    front(g, 20, 15, 22, 21, B)
    head(g, 22, 9.5, { eyes: "open" }, c)
  } else if (p.k === "stretch") {
    // bocejo: estica as pernas da frente e abre a boca
    const a = p.amt
    hind(g, 11.5, 18, ground, S)
    g.oval(15.5, 16.5 - a * 0.6, 7, 3.8 + a * 0.3, B, -0.35)
    g.oval(16.5, 18.5 - a * 0.6, 4.4, 1.1, L)
    if (c.patches) dots(g, 14.5, 16)
    hind(g, 10.5, 18.5, ground, B)
    front(g, 20, 17.5, 22 + a, ground, B)
    head(g, 21.5, 11.5 - a, { eyes: "squint", mouth: false }, c)
    // boca aberta
    g.rect(20, 12.5 - a, 5, 1 + Math.round(a * 0.6), P)
  } else if (p.k === "drag") {
    const s = p.swing
    g.line(14, 16, 12 - s, 22, 2, S); g.rect(11 - s, 22, 3, 1, S)
    g.oval(16, 12.5, 4.6, 5.6, B, s * 0.08)
    g.oval(16.6, 14, 2.6, 3.6, L, s * 0.08)
    if (c.patches) dots(g, 16, 12)
    g.line(18, 16, 19.5 - s, 22, 2, B); g.rect(19 - s, 22, 3, 1, B)
    front(g, 14, 11, 12 - s, 15, B)
    front(g, 18.5, 11, 20 - s, 15, B)
    head(g, 16, 5.5, { eyes: "blink" }, c)
  }
  g.outline()
  return g.d
}
