/**
 * Dragãozinho em pixel art (mesmo esquema do gatinho: formas simples + contorno automático, grade 32×24,
 * olhando para a direita). Chifrinhos, espinhos nas costas, asinhas que batem no ar e rabo com ponta de seta.
 */
import { B, G, GH, Grid, K, L, LID, O, P, S, T, X, type Pal } from "./grid"
import type { Coat, Pose } from "./sprites"

const base = (o: Partial<Pal>): Pal => ({ [G]: "#ffffff", [P]: "#ff8f6b", ...o }) as Pal

// L = barriga · T = asa (membrana) · X = chifres e espinhos
export const DRAGON_COATS: Record<string, Coat> = {
  green: { label: "Verde", pal: base({ [O]: "#132216", [B]: "#4fb36a", [S]: "#35834c", [L]: "#f3dc8a", [K]: "#1a1410", [T]: "#8fd6a0", [X]: "#f6f0d8" }) },
  red: { label: "Vermelho", pal: base({ [O]: "#2a0f12", [B]: "#e2483d", [S]: "#a92f2a", [L]: "#ffd27a", [K]: "#1d0b0b", [T]: "#ff9a6e", [X]: "#ffe9c2" }) },
  purple: { label: "Roxo", pal: base({ [O]: "#1d1230", [B]: "#8b5cf6", [S]: "#6740c4", [L]: "#ffd1f0", [K]: "#14091f", [T]: "#c4a8ff", [X]: "#fff1c9" }) },
  blue: { label: "Azul", pal: base({ [O]: "#0d1a2e", [B]: "#3f8ef0", [S]: "#2b66b8", [L]: "#cfeaff", [K]: "#0b1220", [T]: "#9ccaff", [X]: "#eaf4ff" }) },
  gold: { label: "Dourado", pal: base({ [O]: "#2b1d06", [B]: "#f2b631", [S]: "#c4861c", [L]: "#fff0b8", [K]: "#2b1d06", [T]: "#ffd77a", [X]: "#fffaf0" }) },
  black: { label: "Noturno", pal: base({ [O]: "#08070c", [B]: "#353042", [S]: "#24202e", [L]: "#6c5c8a", [K]: "#ff5a3c", [T]: "#5f4f80", [X]: "#c9c2d8", [LID]: "#a99cc0" }) },
}

type Eyes = "open" | "blink" | "happy" | "closed" | "squint"

/** cabeça de perfil com focinho comprido e chifres, centro do crânio em (hx, hy) */
function head(g: Grid, hx: number, hy: number, o: { eyes: Eyes; mouth?: boolean }) {
  // chifres para trás
  g.curve(hx - 1, hy - 2, hx - 2.4, hy - 4.6, hx - 4.4, hy - 4.8, 1, X)
  g.curve(hx + 0.4, hy - 2.4, hx - 0.4, hy - 5, hx - 2.2, hy - 5.8, 1, X)
  g.oval(hx, hy, 3.3, 2.8, B)
  g.oval(hx + 3.4, hy + 1, 2.8, 1.6, B) // focinho
  g.paint(hx + 2, hy + 2.2, L); g.paint(hx + 3, hy + 2.2, L); g.paint(hx + 4, hy + 2.2, L); g.paint(hx + 1, hy + 2, L)
  g.paint(hx + 5.4, hy + 0.2, S) // narina
  const ex = hx + 0.6, ey = hy - 1
  if (o.eyes === "open") { g.paint(ex, ey, K); g.paint(ex + 1, ey, K); g.paint(ex, ey + 1, K); g.paint(ex + 1, ey + 1, K); g.paint(ex + 1, ey, G) }
  else if (o.eyes === "happy") { g.paint(ex, ey + 1, LID); g.paint(ex + 1, ey, LID); g.paint(ex + 2, ey + 1, LID) }
  else { g.paint(ex, ey + 1, LID); g.paint(ex + 1, ey + 1, LID) }
  if (o.mouth) { g.paint(hx + 2, hy + 1.6, S); g.paint(hx + 3, hy + 1.6, S); g.paint(hx + 4, hy + 1.6, S) }
}

/** espinhos ao longo das costas (de x0 a x1, na altura y) */
function spikes(g: Grid, x0: number, x1: number, y: (x: number) => number) {
  for (let x = Math.ceil(x0); x <= x1; x += 2) g.set(x, Math.round(y(x)) - 1, X)
}

/** rabo comprido com ponta de seta */
function tail(g: Grid, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  g.curve(x0, y0, cx, cy, x1, y1, 2, B)
  const dx = x1 - cx, dy = y1 - cy
  const n = Math.hypot(dx, dy) || 1
  const ux = dx / n, uy = dy / n
  const tx = x1 + ux * 1.5, ty = y1 + uy * 1.5
  g.set(tx, ty, X); g.set(tx - uy * 1.2, ty + ux * 1.2, X); g.set(tx + uy * 1.2, ty - ux * 1.2, X); g.set(tx + ux, ty + uy, X)
}

/** asa: dobrada nas costas (open=0) ou aberta para cima (open=1), presa em (x, y) */
function wing(g: Grid, x: number, y: number, open: number) {
  if (open <= 0) {
    // dobrada: triângulo baixo sobre as costas
    for (let r = 0; r < 4; r++) for (let i = 0; i <= 5 - r; i++) g.set(x - 3 + i + r * 0.5, y - r, T)
    g.line(x - 3, y, x + 2, y - 3, 1, S)
  } else {
    const up = 4 + open * 5
    // osso da asa + membrana em leque
    g.line(x, y, x - 2, y - up, 1, S)
    g.line(x - 2, y - up, x - 7, y - up + 3, 1, S)
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      g.line(x + 1, y, x - 2 - 5 * t, y - up + 3 * t + (k % 2 ? 1 : 0), 1, T)
    }
    g.line(x, y, x - 2, y - up, 1, S)
  }
}

/** asa batendo no voo: a = 1 lá em cima, a = -1 lá embaixo */
function wingFly(g: Grid, x: number, y: number, a: number) {
  const up = 10 * a
  const sg = a >= 0 ? 1 : -1
  // membrana em leque: do ombro até a borda de trás, que fica mais perto do corpo
  for (let k = 0; k <= 8; k++) {
    const t = k / 8
    g.line(x + 1.5, y, x - 1 - 7 * t, y - up * (1 - t * 0.55), 1, T)
  }
  // osso da frente (mais escuro) com garrinha na ponta
  g.line(x + 1, y, x - 1, y - up, 1, S)
  g.set(x - 1, y - up - sg, X)
}

function leg(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number) {
  g.line(x0, y0, x1, y1 - 1, 2, c)
  g.set(Math.round(x1) - 1, Math.round(y1), c); g.set(Math.round(x1), Math.round(y1), c); g.set(Math.round(x1) + 1, Math.round(y1), X)
}

export function drawDragon(p: Pose, _c: Coat): Uint8Array {
  const g = new Grid()
  const ground = GH - 2

  if (p.k === "stand") {
    const cr = p.crouch ?? 0
    const stride = p.run ? 3 : 2
    const bob = p.move ? Math.round(Math.abs(Math.sin(p.phase * Math.PI * 2)) * (p.run ? 1.4 : 0.8)) : 0
    const by = 15.5 + cr - bob * 0.6
    const legAt = (bx: number, off: number, col: number) => {
      const ph = (p.phase + off) * Math.PI * 2
      const dx = p.move ? Math.sin(ph) * stride : 0
      const lift = p.move && Math.cos(ph) > 0.2 ? (p.run ? 2 : 1) : 0
      leg(g, bx, by + 1.5, bx + dx, ground - lift, col)
    }
    legAt(12, 0.5, S); legAt(20, 0, S)
    tail(g, 8.5, by, 3, by + 2.5 + p.tail * 0.6, 1.5, by - 3 + p.tail * 1.4)
    g.oval(15, by, 7.8, 3.8, B)
    g.oval(15.5, by + 2.3, 5.4, 1.3, L)
    spikes(g, 9, 19, (x) => by - 3.6 + Math.abs(x - 15) * 0.12)
    wing(g, 15, by - 2.5, p.run ? 0.4 : 0)
    legAt(10, 0, B); legAt(22, 0.5, B)
    const hx = 24 + (p.run ? 1 : 0), hy = by - 5.5 + cr * 0.8 + (p.run ? 1.5 : 0)
    g.line(20.5, by - 1, hx - 1, hy + 1, 3, B)
    head(g, hx, hy, { eyes: p.eyes, mouth: p.eyes === "happy" })
  } else if (p.k === "sit") {
    tail(g, 10, ground - 0.5, 4, ground + 0.5, 3.5 + p.tail, ground - 4 - p.tail * 0.8)
    g.oval(13.5, 18, 5.8, 4.8, B)
    g.oval(17.5, 14.5, 4, 5.8, B)
    g.oval(18.8, 16, 2, 4, L)
    spikes(g, 10, 15, (x) => 13.6 + (15 - x) * 0.5)
    wing(g, 15, 13.5, 0)
    leg(g, 16.5, 17, 16.5, ground, S)
    if (p.paw) {
      // "se limpar" = soltar uma fumacinha (boca aberta)
      leg(g, 19.5, 17, 19.5, ground, B)
      head(g, 20.5, 8, { eyes: "closed", mouth: false })
      g.rect(22, 9.2, 3, 1, P)
    } else {
      leg(g, 19.5, 17, 19.5, ground, B)
      head(g, 20.5, 8, { eyes: p.eyes, mouth: p.eyes === "happy" })
    }
    g.rect(9, ground - 1, 4, 2, B)
  } else if (p.k === "sleep") {
    const br = p.breath
    tail(g, 6, ground - 1, 3, ground + 1, 12 + p.tail * 0.5, ground)
    g.oval(14.5, ground - 2.8 - br * 0.3, 8.8, 3.6 + br * 0.45, B)
    spikes(g, 9, 20, (x) => ground - 6.4 - br * 0.6 + Math.abs(x - 14.5) * 0.2)
    wing(g, 14, ground - 4.5, 0)
    g.rect(19, ground - 1, 4, 2, B)
    head(g, 23, ground - 3.2 - br * 0.2, { eyes: "closed" })
  } else if (p.k === "jump" || p.k === "fall") {
    // voando: asas abertas batendo (o rabo serve de relógio para a batida)
    const flap = p.k === "jump" ? 1 : 0.35 + (p.tail > 0 ? 0.4 : 0)
    const a = p.k === "jump" ? -0.25 : 0.05
    const by = p.k === "jump" ? 12.5 : 13.5
    tail(g, 8, by, 3.5, by + 1.5, 1.5, by - 3 + p.tail)
    leg(g, 11, by + 2, p.k === "jump" ? 7 : 10, by + 6, S)
    g.oval(15, by, 7.8, 3.5, B, a)
    g.oval(15.5, by + 2, 5, 1.1, L, a)
    spikes(g, 9, 19, (x) => by - 3.4 + (x - 15) * (p.k === "jump" ? 0.25 : -0.05))
    leg(g, 20, by + 1.5, p.k === "jump" ? 24 : 21, by + 5.5, B)
    wing(g, 15, by - 2.5, flap)
    head(g, 24, by - 5.5, { eyes: p.k === "jump" ? "happy" : "open", mouth: p.k === "jump" })
  } else if (p.k === "fly") {
    // voando: corpo na horizontal, patinhas encolhidas para trás, rabo ondulando
    const by = 11.5
    const a = 1 - p.flap * 1.8
    // asa de lá (mais escura) atrás do corpo, um pouco defasada
    if (a < 0.3) wingFly(g, 13, by - 2.5, Math.min(1, a + 0.6))
    tail(g, 8, by, 3.5, by + 1.5 + p.tail, 1, by - 1.5 + p.tail * 2)
    g.line(12, by + 2, 9.5, by + 4, 2, S); g.set(8.5, by + 4.5, X)
    g.oval(15, by, 7.8, 3.5, B, -0.04)
    g.oval(15.5, by + 2, 5, 1.1, L, -0.04)
    spikes(g, 9, 19, (x) => by - 3.4 + Math.abs(x - 15) * 0.1)
    g.line(20, by + 2.5, 21.5, by + 4.5, 2, B); g.set(22.5, by + 4.5, X)
    g.line(18, by + 2.5, 19, by + 4.5, 2, S)
    wingFly(g, 15.5, by - 2.5, a)
    const hy = by - 5.5
    g.line(20.5, by - 1, 23, hy + 1, 3, B)
    head(g, 24, hy, { eyes: p.fire ? "squint" : "open", mouth: !p.fire })
    // boca aberta para soltar o fogo
    if (p.fire) { g.set(26, hy + 2.6, P); g.set(27, hy + 2.6, P); g.set(28, hy + 2.6, P); g.set(26, hy + 3.4, B); g.set(27, hy + 3.4, B) }
  } else if (p.k === "stretch") {
    const a = p.amt
    tail(g, 8, 13 - a, 4, 9 - a, 2.5 + p.tail, 6 - a)
    leg(g, 11, 15 - a, 11, ground, S)
    g.oval(15, 15 - a * 0.3, 7.8, 3.5, B, 0.2 + a * 0.08)
    spikes(g, 9, 19, (x) => 12 - a * 0.6 + (x - 9) * 0.25)
    wing(g, 14, 12.5 - a * 0.4, 0.5 + a * 0.2)
    leg(g, 9, 15 - a, 9, ground, B)
    leg(g, 20, 18, 26 + a, ground, S)
    leg(g, 21, 18, 28 + a, ground, B)
    head(g, 24 + a * 0.5, 15.5 + a * 0.3, { eyes: "squint", mouth: true })
  } else if (p.k === "drag") {
    const s = p.swing
    tail(g, 16, 18, 16 + s * 2, 21.5, 19 + s * 3, 22)
    leg(g, 13.5, 16, 13 - s, 21, S)
    leg(g, 19, 16, 19 - s, 21, S)
    g.oval(16, 13, 4.6, 6, B, s * 0.08)
    g.oval(16.5, 14, 2.4, 4, L, s * 0.08)
    wing(g, 13, 11, 0.6)
    leg(g, 14.5, 12, 13.5 - s, 17, B)
    leg(g, 18, 12, 18.5 - s, 17, B)
    head(g, 16.5, 5, { eyes: "blink" })
  }
  g.outline()
  return g.d
}
