/**
 * Gatinho em pixel art, desenhado por código: cada pose é montada com formas simples numa grade de 32×24,
 * e o contorno escuro é gerado sozinho em volta da silhueta. Assim dá para ter muitos quadros intermediários
 * (pernas, rabo, respiração) sem desenhar cada um à mão — o movimento fica fluido.
 * Tudo olhando para a direita; para a esquerda o desenho é espelhado na hora de pintar.
 */

import { B, E, G, GH, GW, Grid, K, L, LID, O, P, S, T, X, type Pal } from "./grid"
import { drawGoat, GOAT_COATS } from "./goat"
import { drawDog, DOG_COATS } from "./dog"
import { drawFrog, FROG_COATS } from "./frog"
import { drawDragon, DRAGON_COATS } from "./dragon"
export { GH, GW }

export type Species = "cat" | "goat" | "dog" | "frog" | "dragon"
export interface Coat { label: string; pal: Pal; stripes?: boolean; points?: boolean; patches?: boolean }

export const COATS: Record<string, Coat> = {
  orange: { label: "Laranja", pal: { [O]: "#2a1d2b", [B]: "#f2a65a", [S]: "#cf7a36", [L]: "#ffe2b8", [P]: "#ff8fa3", [K]: "#2a1d2b", [G]: "#ffffff", [T]: "#d97a2b", [X]: "#cf7a36" }, stripes: true },
  gray: { label: "Cinza", pal: { [O]: "#262331", [B]: "#a3abbd", [S]: "#7b8296", [L]: "#eef0f5", [P]: "#ff9db0", [K]: "#262331", [G]: "#ffffff", [T]: "#868da1", [X]: "#7b8296" } },
  black: { label: "Pretinho", pal: { [O]: "#110d16", [B]: "#3b3445", [S]: "#2a2433", [L]: "#544a60", [P]: "#ff8fa3", [K]: "#d8f06a", [G]: "#ffffff", [T]: "#332c3c", [X]: "#2a2433", [LID]: "#a99cc0" } },
  white: { label: "Branquinho", pal: { [O]: "#4b4153", [B]: "#f7f3ef", [S]: "#ddd5ce", [L]: "#ffffff", [P]: "#ff9db0", [K]: "#3a3142", [G]: "#ffffff", [T]: "#e6ded6", [X]: "#ddd5ce" } },
  siamese: { label: "Siamês", pal: { [O]: "#2b1f24", [B]: "#f3e6cf", [S]: "#dcc9a8", [L]: "#fff6e6", [P]: "#e88f9b", [K]: "#3d7fd9", [G]: "#ffffff", [T]: "#f3e6cf", [X]: "#6b4a3a" }, points: true },
  tabby: { label: "Rajado", pal: { [O]: "#2a2019", [B]: "#c2a37e", [S]: "#9c7f5c", [L]: "#f1e2cb", [P]: "#ff9a9a", [K]: "#2a2019", [G]: "#ffffff", [T]: "#6f5641", [X]: "#9c7f5c" }, stripes: true },
  calico: { label: "Tricolor", pal: { [O]: "#2a1d2b", [B]: "#fbf6f0", [S]: "#e4d9cf", [L]: "#ffffff", [P]: "#ff9db0", [K]: "#2a1d2b", [G]: "#ffffff", [T]: "#f0a050", [X]: "#3b3240" }, patches: true },
}

/* ---------------------------------------------------- partes do gato ---------------------------------------------------- */

export interface Look { stripes?: boolean; points?: boolean; patches?: boolean }

/** cabeça de frente (estilo fofinho), centro em (cx, cy) */
function head(g: Grid, cx: number, cy: number, o: { eyes: "open" | "blink" | "closed" | "happy" | "squint"; earDrop?: number; tilt?: number }, look: Look) {
  const drop = o.earDrop ?? 0
  const tl = o.tilt ?? 0
  // orelhas (triângulos)
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i <= r; i++) {
      g.set(cx - 4 + i + (drop > 0 ? -r * 0.4 : 0), cy - 6 + r + drop + tl, B)
      g.set(cx + 3 - i + (drop > 0 ? r * 0.4 : 0), cy - 6 + r + drop - tl, B)
    }
  }
  g.oval(cx, cy - 0.5, 5.4, 4.3, B)
  // focinho claro e bochechas
  g.oval(cx, cy + 1.7, 3, 1.6, L)
  if (look.points) { g.oval(cx, cy + 0.6, 3.3, 2.4, X); g.oval(cx, cy + 1.9, 1.9, 1.1, X) }
  if (look.stripes) { g.paint(cx - 1, cy - 4, T); g.paint(cx, cy - 4, T); g.paint(cx - 1, cy - 3, T); g.paint(cx + 1, cy - 4, T) }
  if (look.patches) { g.oval(cx - 2.6, cy - 2.6, 2.4, 1.8, T); g.paint(cx + 2, cy - 4, X); g.paint(cx + 3, cy - 4, X); g.paint(cx + 3, cy - 3, X) }
  // orelha por dentro
  if (!drop) { g.paint(cx - 3, cy - 5, look.points ? X : P); g.paint(cx + 2, cy - 5, look.points ? X : P) }
  if (look.points) { g.paint(cx - 4, cy - 5 + drop, X); g.paint(cx + 3, cy - 5 + drop, X); g.paint(cx - 4, cy - 4 + drop, X); g.paint(cx + 3, cy - 4 + drop, X) }
  // olhos
  const ex1 = cx - 3, ex2 = cx + 2, ey = cy - 1
  if (o.eyes === "open") {
    for (const ex of [ex1, ex2]) { g.paint(ex, ey, K); g.paint(ex + 1, ey, K); g.paint(ex, ey + 1, K); g.paint(ex + 1, ey + 1, K); g.paint(ex, ey, G) }
  } else if (o.eyes === "blink" || o.eyes === "squint") {
    for (const ex of [ex1, ex2]) { g.paint(ex, ey + 1, LID); g.paint(ex + 1, ey + 1, LID) }
  } else if (o.eyes === "happy") {
    // ^ ^
    for (const ex of [ex1, ex2]) { g.paint(ex, ey + 1, LID); g.paint(ex + 1, ey, LID); g.paint(ex + 2, ey + 1, LID) }
  } else {
    // dormindo: ‿ ‿
    for (const ex of [ex1, ex2]) { g.paint(ex - 0.2, ey + 1, LID); g.paint(ex + 1, ey + 1, LID) }
  }
  // nariz
  g.paint(cx - 1, cy + 1, P); g.paint(cx, cy + 1, P)
  if (o.eyes !== "closed") { g.paint(cx - 1, cy + 2, S); g.paint(cx, cy + 2, S) }
}

/** perna de cima (x0,y0) até a pata (x1,y1) */
function leg(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number, paw: number) {
  g.line(x0, y0, x1, y1 - 1, 2, c)
  g.set(Math.round(x1) - 1, Math.round(y1), paw); g.set(Math.round(x1), Math.round(y1), paw)
}

function stripesBody(g: Grid, xs: number[], y0: number, y1: number) {
  for (const x of xs) for (let y = y0; y <= y1; y++) if (g.get(x, y) === B) g.set(x, y, T)
}

/* ---------------------------------------------------- poses ---------------------------------------------------- */

export type Pose =
  | { k: "stand"; phase: number; move: number; tail: number; eyes: "open" | "blink" | "happy"; crouch?: number; run?: boolean }
  | { k: "sit"; tail: number; eyes: "open" | "blink" | "happy" | "closed"; paw?: number }
  | { k: "sleep"; breath: number; tail: number }
  | { k: "jump"; tail: number }
  | { k: "fall"; tail: number }
  | { k: "stretch"; amt: number; tail: number }
  | { k: "drag"; swing: number }
  /** só o dragão: voando (flap 0–1 = batida das asas) e, às vezes, cuspindo fogo */
  | { k: "fly"; flap: number; tail: number; fire?: boolean }

export function draw(p: Pose, look: Look): Uint8Array {
  const g = new Grid()
  const pawC = look.points ? X : look.patches ? B : L
  const tailC = look.points ? X : B
  const tailTip = look.stripes ? T : look.patches ? X : look.points ? X : undefined
  const ground = GH - 2

  if (p.k === "stand") {
    const cr = p.crouch ?? 0
    const stride = p.run ? 3 : 2
    const bob = p.move ? Math.round(Math.abs(Math.sin(p.phase * Math.PI * 2)) * (p.run ? 1.4 : 0.8)) : 0
    const by = 15.5 + cr - bob * 0.6
    // pernas do lado de lá (mais escuras) primeiro
    const legAt = (bx: number, off: number, c: number) => {
      const ph = (p.phase + off) * Math.PI * 2
      const dx = p.move ? Math.sin(ph) * stride : 0
      const lift = p.move && Math.cos(ph) > 0.2 ? (p.run ? 2 : 1) : 0
      leg(g, bx, by + 1, bx + dx, ground - lift, c, c === S ? S : pawC)
    }
    legAt(12, 0.5, S); legAt(22, 0, S)
    // rabo
    const sw = p.tail
    if (p.run) g.curve(8, by - 1, 3, by - 2, 0.5 + sw * 0.5, by - 4 + sw, 2, tailC, tailTip)
    else g.curve(8, by - 1, 2.5, by - 1, 3 + sw * 1.6, by - 8 - Math.abs(sw) * 0.4, 2, tailC, tailTip)
    // corpo
    g.oval(15.5, by, p.run ? 9 : 8.4, 3.9 - cr * 0.15, B)
    g.oval(16.5, by + 2.2, 5.5, 1.4, L)
    if (look.stripes) stripesBody(g, [11, 14, 17], Math.floor(by - 3), Math.floor(by - 1))
    if (look.patches) { g.oval(12, by - 1.5, 3.2, 2.2, T); g.oval(18.5, by - 2, 2.2, 1.6, X) }
    if (look.points) g.oval(8.5, by - 0.5, 1.6, 1.6, X)
    legAt(10, 0, B); legAt(20, 0.5, B)
    head(g, 24.5 + (p.run ? 1 : 0), 11 + cr * 1.1 - bob * 0.3 + (p.run ? 1.5 : 0), { eyes: p.eyes, earDrop: p.run ? 1 : 0 }, look)
  } else if (p.k === "sit") {
    // rabo enrolado no chão, a ponta balança
    g.curve(9, ground - 1, 2, ground + 0.5, 3.5 + p.tail * 1.2, ground - 6 - p.tail, 2, tailC, tailTip)
    g.oval(13.5, 18, 6, 5.2, B) // quadril
    g.oval(18, 15.5, 4.2, 6.2, B) // peito
    g.oval(18.6, 17, 2.4, 4.2, L)
    if (look.stripes) stripesBody(g, [10, 12], 14, 17)
    if (look.patches) g.oval(12, 16.5, 3.4, 2.6, T)
    // patas da frente
    leg(g, 16.5, 17, 16.5, ground, S, S)
    if (p.paw) leg(g, 19.5, 16, 21 + p.paw, 13 - p.paw * 1.5, B, pawC)
    else leg(g, 20, 17, 20, ground, B, pawC)
    // pata de trás aparecendo
    g.rect(9, ground - 1, 4, 2, B)
    g.set(12, ground, pawC); g.set(11, ground, pawC)
    head(g, 19.5, 8.5 + (p.paw ? 0.5 : 0), { eyes: p.eyes, tilt: p.paw ? 0 : 0 }, look)
  } else if (p.k === "sleep") {
    const br = p.breath
    g.oval(14.5, ground - 2.6 - br * 0.3, 9.2, 3.8 + br * 0.45, B)
    if (look.stripes) stripesBody(g, [10, 13, 16], ground - 7, ground - 4)
    if (look.patches) { g.oval(11, ground - 4, 3.6, 2.2, T); g.oval(17, ground - 5, 2.2, 1.4, X) }
    // rabo dando a volta por baixo
    g.curve(6, ground - 2, 4, ground + 1, 13 + p.tail * 0.6, ground, 2, tailC, tailTip)
    for (let x = 7; x < 13; x++) if (g.get(x, ground - 1) === tailC) g.set(x, ground - 2, S)
    head(g, 22.5, ground - 3.4 - br * 0.25, { eyes: "closed", earDrop: 1 }, look)
    g.rect(18, ground - 1, 3, 2, B) // patinha encolhida
    g.set(20, ground, pawC)
  } else if (p.k === "jump") {
    const a = -0.32
    g.curve(8, 13, 3, 13, 0.5, 9 + p.tail, 2, tailC, tailTip)
    leg(g, 11, 15, 6, 19, S, S)
    leg(g, 21, 12, 26, 11, S, S)
    g.oval(15.5, 12.5, 8.8, 3.4, B, a)
    g.oval(16, 14.2, 5, 1.2, L, a)
    if (look.stripes) stripesBody(g, [11, 14, 17], 7, 12)
    if (look.patches) g.oval(13, 12, 3, 2, T, a)
    leg(g, 9, 15, 4, 18, B, pawC)
    leg(g, 22, 11, 27, 9, B, pawC)
    head(g, 25.5, 7.5, { eyes: "open", earDrop: 1 }, look)
  } else if (p.k === "fall") {
    g.curve(8, 13, 3, 11, 2 + p.tail, 5, 2, tailC, tailTip)
    leg(g, 11, 15, 9, 21, S, S)
    leg(g, 21, 15, 23, 21, S, S)
    g.oval(15.5, 13.5, 8.4, 3.8, B, 0.12)
    g.oval(16.5, 15.5, 5, 1.2, L, 0.12)
    if (look.stripes) stripesBody(g, [11, 14, 17], 9, 12)
    if (look.patches) g.oval(13, 12.5, 3, 2, T)
    leg(g, 9, 15, 7, 21, B, pawC)
    leg(g, 19, 16, 20, 22, B, pawC)
    head(g, 24.5, 10.5, { eyes: "open" }, look)
  } else if (p.k === "stretch") {
    // espreguiçando: patas da frente esticadas, bumbum para cima
    const a = p.amt
    g.curve(8, 12 - a, 3, 9 - a, 4 + p.tail, 3 - a, 2, tailC, tailTip)
    leg(g, 11, 15 - a, 11, ground, S, S)
    g.oval(15.5, 15 - a * 0.3, 8.4, 3.6, B, 0.2 + a * 0.08)
    if (look.stripes) stripesBody(g, [11, 14, 17], 11, 14)
    if (look.patches) g.oval(13, 14, 3, 2, T)
    leg(g, 9, 15 - a, 9, ground, B, pawC)
    leg(g, 21, 18, 27 + a, ground, S, S)
    leg(g, 22, 18, 29 + a, ground, B, pawC)
    head(g, 24 + a * 0.5, 15 + a * 0.4, { eyes: "squint" }, look)
  } else if (p.k === "drag") {
    // segurado pelo cangote: corpo pendurado, perninhas soltas
    const s = p.swing
    g.curve(16, 17, 16 + s * 2, 21, 19 + s * 3, 22, 2, tailC, tailTip)
    leg(g, 13.5, 16, 13 - s, 21, S, S)
    leg(g, 19, 16, 19 - s, 21, S, S)
    g.oval(16, 13, 4.9, 6, B, s * 0.08)
    g.oval(16.5, 14, 2.4, 4, L, s * 0.08)
    if (look.patches) g.oval(15, 12, 2.4, 2, T)
    leg(g, 14.5, 12, 13.5 - s, 18, B, pawC)
    leg(g, 18, 12, 18.5 - s, 18, B, pawC)
    head(g, 16, 6.5, { eyes: "blink", earDrop: 1 }, look)
  }
  g.outline()
  return g.d
}

/* ---------------------------------------------------- quadros em cache ---------------------------------------------------- */

/** os bichinhos que dá para escolher; `sound` são os balõezinhos que ele solta de vez em quando */
export const SPECIES: Record<Species, { label: string; coats: Record<string, Coat>; name: string; sound?: string[]; soundColor?: string; jumpy?: number }> = {
  cat: { label: "Gatinho", coats: COATS, name: "Gatinho" },
  goat: { label: "Cabrinha", coats: GOAT_COATS, name: "Cabrinha", sound: ["Méé!", "Mééé"], soundColor: "#fff4d6", jumpy: 1.7 },
  dog: { label: "Cachorrinho", coats: DOG_COATS, name: "Cachorrinho", sound: ["Au!", "Au au!", "Auu"], soundColor: "#ffe6c2", jumpy: 1.2 },
  frog: { label: "Sapinho", coats: FROG_COATS, name: "Sapinho", sound: ["Croac", "Ribbit"], soundColor: "#d9f7b0", jumpy: 2.2 },
  dragon: { label: "Dragãozinho", coats: DRAGON_COATS, name: "Dragãozinho", sound: ["Rawr!", "Grr"], soundColor: "#ffb15a", jumpy: 1.5 },
}
export const isSpecies = (v: unknown): v is Species => typeof v === "string" && v in SPECIES
export const coatOf = (species: Species, coat: string) => {
  const all = SPECIES[species]?.coats ?? COATS
  return all[coat] ?? Object.values(all)[0]
}

/** desenha a pose do bicho na grade (sem canvas: dá para testar no Node) */
export function drawSpecies(p: Pose, coat: Coat, species: Species): Uint8Array {
  if (p.k === "fly" && species !== "dragon") p = { k: "jump", tail: p.tail }
  return species === "goat" ? drawGoat(p, coat) : species === "dog" ? drawDog(p, coat) : species === "frog" ? drawFrog(p, coat) : species === "dragon" ? drawDragon(p, coat) : draw(p, coat)
}

/** retângulo ocupado pelo desenho (em pixels da grade): vira a área de clique e a altura do nome */
const boxCache = new Map<string, { l: number; t: number; w: number; h: number }>()
export function frameBox(p: Pose, coat: string, species: Species) {
  const key = species + JSON.stringify(p)
  let b = boxCache.get(key)
  if (b) return b
  if (boxCache.size > 900) boxCache.clear()
  const d = drawSpecies(p, coatOf(species, coat), species)
  let l = GW, t = GH, r = 0, bt = 0
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (d[y * GW + x]) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); bt = Math.max(bt, y) }
  b = r >= l ? { l, t, w: r - l + 1, h: bt - t + 1 } : { l: 0, t: 0, w: GW, h: GH }
  boxCache.set(key, b)
  return b
}

const cache = new Map<string, HTMLCanvasElement>()
export function frame(p: Pose, coat: string, species: Species = "cat"): HTMLCanvasElement {
  const key = species + coat + JSON.stringify(p)
  let c = cache.get(key)
  if (c) return c
  if (cache.size > 900) cache.clear()
  const def = coatOf(species, coat)
  const d = drawSpecies(p, def, species)
  c = document.createElement("canvas")
  c.width = GW; c.height = GH
  const ctx = c.getContext("2d")!
  const img = ctx.createImageData(GW, GH)
  for (let i = 0; i < d.length; i++) {
    if (!d[i]) continue
    const hex = def.pal[d[i]] ?? (d[i] === LID ? def.pal[O] : "#ff00ff")
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16)
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16)
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  cache.set(key, c)
  return c
}
