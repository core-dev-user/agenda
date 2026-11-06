/**
 * Personalização automática a partir do papel de parede.
 *
 * 1. Lê a foto: paleta de cores (k-means), brilho, saturação e onde ela é "calma" ou "cheia de detalhe".
 * 2. IA local: recorta o assunto (RMBG-1.4, o mesmo do relógio com profundidade) e reconhece o estilo da imagem
 *    (CLIP, zero-shot: anime, cyberpunk, natureza, espaço…). Tudo roda no PC; só baixa os modelos na primeira vez.
 * 3. Monta um plano: tema, cores, fontes, cursor, efeitos, relógio da tela e widgets posicionados nas áreas livres,
 *    cada um com a aparência própria (fundo, borda, cor) pensada para o pedaço da foto que fica atrás dele.
 */
import type { CursorEffect, CursorStyle, LockClock, Settings, Widget, WidgetType } from "./types"
import type { WidgetLook } from "@/widgets/widgetLook"
import { uid } from "./utils"

type RGB = [number, number, number]
export interface Swatch { hex: string; rgb: RGB; weight: number; h: number; s: number; l: number }
export interface Analysis {
  palette: Swatch[]
  lum: number
  sat: number
  /** grade da tela (1 célula = CELL px): brilho, detalhe e assunto (0–1) */
  grid: { cols: number; rows: number; lum: Float32Array; busy: Float32Array; subj: Float32Array }
  view: { w: number; h: number }
  subject: { found: boolean; top: number; bottom: number; left: number; right: number; area: number }
  /** recorte do assunto (PNG em data URL), para o relógio com profundidade */
  cutout?: string
  moods: { id: MoodId; score: number }[]
  usedClip: boolean
  /** cores vivas da foto, da mais marcante para a menos (pelo histograma de matiz, sem tons de pele) */
  accents: Swatch[]
  /** foto de verdade, ilustração, 3D ou pixel art */
  medium: "photo" | "illustration" | "render" | "pixel" | null
}
export const CELL = 8

/* ------------------------------ cores ------------------------------ */
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function hslToHex(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255])
}
const relLum = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

function kmeans(px: RGB[], k: number, iters = 12): { c: RGB; n: number }[] {
  // começa com cores bem espalhadas (k-means++ simplificado)
  const cs: RGB[] = [px[Math.floor(px.length / 2)]]
  while (cs.length < k) {
    let best = px[0], bd = -1
    for (let i = 0; i < px.length; i += 7) {
      const p = px[i]
      let d = Infinity
      for (const c of cs) d = Math.min(d, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)
      if (d > bd) { bd = d; best = p }
    }
    cs.push([...best] as RGB)
  }
  let counts = new Array(k).fill(0)
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0])
    counts = new Array(k).fill(0)
    for (const p of px) {
      let bi = 0, bd = Infinity
      for (let j = 0; j < k; j++) {
        const c = cs[j]
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if (d < bd) { bd = d; bi = j }
      }
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; counts[bi]++
    }
    for (let j = 0; j < k; j++) if (counts[j]) cs[j] = [sum[j][0] / counts[j], sum[j][1] / counts[j], sum[j][2] / counts[j]]
  }
  return cs.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > 0)
}

/* ------------------------------ estilos ------------------------------ */
export type MoodId =
  | "anime" | "cute" | "cyberpunk" | "nature" | "sakura" | "space" | "ocean" | "snow" | "retro" | "minimal"
  | "dark" | "city" | "car" | "game" | "autumn" | "sunset" | "mountain" | "fire" | "person"
export const MOOD_LABEL: Record<MoodId, string> = {
  anime: "anime", cute: "fofo / pastel", cyberpunk: "neon / cyberpunk", nature: "natureza", sakura: "flores de cerejeira", space: "espaço",
  ocean: "mar", snow: "inverno", retro: "retrô / pixel", minimal: "minimalista", dark: "escuro / dramático", city: "cidade", car: "carro",
  game: "jogo", autumn: "outono", sunset: "pôr do sol", mountain: "montanhas", fire: "fogo", person: "retrato",
}
const PROMPTS: [MoodId, string][] = [
  ["anime", "an anime illustration"], ["cute", "a cute pastel kawaii illustration"], ["cyberpunk", "a neon cyberpunk city at night"],
  ["nature", "a green forest or nature landscape"], ["sakura", "pink cherry blossom trees"], ["space", "outer space with stars, planets and galaxies"],
  ["ocean", "the ocean, the sea or a beach"], ["snow", "a snowy winter scene"], ["retro", "retro pixel art or vaporwave"],
  ["minimal", "a minimal abstract clean background"], ["dark", "a dark moody gothic image"], ["city", "a city skyline"], ["car", "a sports car"],
  ["game", "video game art"], ["autumn", "autumn leaves"], ["sunset", "a colorful sunset sky"], ["mountain", "mountains"], ["fire", "fire and flames"],
  ["person", "a portrait photo of a real person"], ["game", "an esports team celebrating on stage with a trophy"], ["game", "a gaming setup with rgb lights"],
]
const COLOR_NAMES: [string, number][] = [
  ["red", 0], ["orange", 28], ["yellow", 52], ["lime green", 90], ["green", 125], ["teal", 172], ["cyan", 190], ["blue", 220], ["purple", 272], ["magenta", 300], ["pink", 330],
]
const MEDIUMS: [NonNullable<Analysis["medium"]>, string][] = [
  ["photo", "a real photograph taken with a camera"], ["illustration", "an anime or cartoon drawing"], ["render", "a 3d render or video game screenshot"], ["pixel", "pixel art"],
]

interface Profile {
  theme: Settings["theme"]
  ui: string; num: string; disp: string
  cursor: CursorStyle; effect: CursorEffect
  clock: string; lock: LockClock["style"]
  hover: WidgetLook["hover"]
  look: "smoke" | "frost" | "neon" | "solid"
  radius: number
  sakura?: boolean
  overlay?: Partial<Settings["overlay"]>
  click?: Settings["clickEffect"]
}
const BASE: Profile = { theme: "glass", ui: "outfit", num: "space", disp: "playfair", cursor: "ring", effect: "sparkle", clock: "minimal", lock: "ios", hover: "lift", look: "smoke", radius: 22 }
const PROFILES: Record<MoodId, Partial<Profile>> = {
  anime: { num: "outfit", clock: "stacked", lock: "bold", effect: "sparkle" },
  cute: { disp: "pacifico", num: "outfit", cursor: "heart", effect: "hearts", clock: "stacked", lock: "bold", look: "frost", click: "hearts" },
  cyberpunk: { ui: "space", num: "orbitron", disp: "orbitron", cursor: "neon", effect: "trail", clock: "neon", lock: "neon", hover: "glow", look: "neon", radius: 10 },
  game: { ui: "space", num: "orbitron", disp: "orbitron", cursor: "crosshair", effect: "comet", clock: "digital", lock: "bold", hover: "glow", radius: 12 },
  car: { ui: "space", num: "orbitron", disp: "space", cursor: "arrow", effect: "comet", clock: "digital", lock: "bold", hover: "glow", radius: 12 },
  nature: { num: "outfit", effect: "leaves", lock: "thin", look: "frost" },
  mountain: { num: "outfit", effect: "none", lock: "thin", look: "frost" },
  autumn: { effect: "leaves", lock: "serif", look: "frost" },
  sakura: { disp: "dancing", cursor: "sakura", effect: "sakura", lock: "serif", look: "frost", sakura: true },
  space: { ui: "space", num: "space", disp: "space", cursor: "dot", effect: "stars", clock: "rings", lock: "thin", hover: "glow" },
  ocean: { cursor: "bubble", effect: "bubbles", lock: "thin", look: "frost" },
  snow: { effect: "snow", lock: "thin", look: "frost" },
  retro: { ui: "silkscreen", num: "vt323", disp: "press", cursor: "pixel", effect: "pixels", clock: "lcd", lock: "retro", look: "solid", radius: 0, overlay: { scanlines: true } },
  minimal: { theme: "minimal", ui: "inter", num: "inter", disp: "inter", cursor: "system", effect: "none", clock: "minimal", lock: "thin", look: "frost", radius: 14 },
  dark: { ui: "inter", disp: "playfair", cursor: "dot", effect: "glow", lock: "serif", hover: "none", overlay: { vignette: true } },
  city: { ui: "inter", disp: "space", effect: "none", clock: "digital", lock: "ios" },
  sunset: { disp: "dancing", effect: "glow", lock: "serif", look: "frost" },
  fire: { num: "orbitron", effect: "fire", lock: "bold", hover: "glow" },
  person: { lock: "ios" },
}

/* ------------------------------ análise ------------------------------ */
const loadImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image()
  i.crossOrigin = "anonymous"
  i.onload = () => res(i)
  i.onerror = () => rej(new Error("Não consegui abrir a imagem"))
  i.src = url
})
/** desenha como o papel de parede aparece (cobrindo a tela, centralizado) */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const r = Math.max(w / img.width, h / img.height)
  const dw = img.width * r, dh = img.height * r
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export type Progress = (pct: number, msg: string) => void

export async function analyze(url: string, view: { w: number; h: number }, opts: { subject: boolean; clip: boolean }, onProgress: Progress): Promise<Analysis> {
  onProgress(2, "Lendo as cores da foto…")
  const img = await loadImg(url)
  const cols = Math.ceil(view.w / CELL), rows = Math.ceil(view.h / CELL)
  const cv = document.createElement("canvas")
  cv.width = cols; cv.height = rows
  const ctx = cv.getContext("2d", { willReadFrequently: true })!
  drawCover(ctx, img, cols, rows)
  const data = ctx.getImageData(0, 0, cols, rows).data
  const n = cols * rows
  const lum = new Float32Array(n), busy = new Float32Array(n), subj = new Float32Array(n)
  const px: RGB[] = []
  let lsum = 0, ssum = 0
  for (let i = 0; i < n; i++) {
    const c: RGB = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
    lum[i] = relLum(c)
    lsum += lum[i]
    ssum += rgbToHsl(c)[1]
    if (i % 3 === 0) px.push(c)
  }
  // detalhe = bordas (Sobel) + variação de brilho em volta, suavizado
  const raw = new Float32Array(n)
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
    const L = (dx: number, dy: number) => lum[(y + dy) * cols + x + dx]
    const gx = -L(-1, -1) - 2 * L(-1, 0) - L(-1, 1) + L(1, -1) + 2 * L(1, 0) + L(1, 1)
    const gy = -L(-1, -1) - 2 * L(0, -1) - L(1, -1) + L(-1, 1) + 2 * L(0, 1) + L(1, 1)
    raw[y * cols + x] = Math.min(1, Math.hypot(gx, gy) * 1.6)
  }
  const R = 3
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let s = 0, c = 0
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
      s += raw[yy * cols + xx]; c++
    }
    busy[y * cols + x] = s / c
  }

  onProgress(8, "Montando a paleta…")
  // destaque: matizes saturados (numa versão maior da foto, para não perder detalhes finos como listras de camisa)
  const big = document.createElement("canvas")
  big.width = 480; big.height = Math.round((480 * view.h) / view.w)
  const bctx = big.getContext("2d", { willReadFrequently: true })!
  drawCover(bctx, img, big.width, big.height)
  const bd = bctx.getImageData(0, 0, big.width, big.height).data
  const BINS = 24
  const hb = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }))
  for (let i = 0; i < bd.length; i += 8) {
    const c: RGB = [bd[i], bd[i + 1], bd[i + 2]]
    const [h, sa, l] = rgbToHsl(c)
    if (sa < 0.38 || l < 0.18 || l > 0.85) continue
    // tons de pele quase não contam
    const skin = h <= 45 && sa < 0.85
    const wgt = sa * sa * sa * (1 - Math.abs(l - 0.5)) * (skin ? 0.08 : 1)
    const bin = hb[Math.floor(h / (360 / BINS)) % BINS]
    bin.w += wgt; bin.r += c[0] * wgt; bin.g += c[1] * wgt; bin.b += c[2] * wgt
  }
  const hsum = hb.reduce((x, b) => x + b.w, 0) || 1
  let accents: (Swatch & { score: number })[] = hb
    .map((b, i) => ({ b, i, score: b.w + (hb[(i + BINS - 1) % BINS].w + hb[(i + 1) % BINS].w) * 0.5 }))
    .filter((x) => x.b.w / hsum > 0.006)
    .sort((x, y) => y.score - x.score)
    .filter((x, k, arr) => !arr.slice(0, k).some((p) => Math.min(Math.abs(p.i - x.i), BINS - Math.abs(p.i - x.i)) <= 1))
    .slice(0, 6)
    .map(({ b, score }) => { const c: RGB = [b.r / b.w, b.g / b.w, b.b / b.w]; const [h, sa, l] = rgbToHsl(c); return { hex: toHex(c), rgb: c, weight: b.w / hsum, h, s: sa, l, score: score / hsum } })

  const km = kmeans(px, 7)
  const total = km.reduce((a, b) => a + b.n, 0)
  const palette: Swatch[] = km
    .map(({ c, n }) => { const [h, s, l] = rgbToHsl(c); return { hex: toHex(c), rgb: c, weight: n / total, h, s, l } })
    .sort((a, b) => b.weight - a.weight)

  // assunto da foto (pessoa, personagem, objeto)
  let cutout: string | undefined
  const subject = { found: false, top: 1, bottom: 0, left: 1, right: 0, area: 0 }
  if (opts.subject) {
    try {
      const { segmentSubject } = await import("./depth")
      cutout = await segmentSubject(url, (p, m) => onProgress(10 + p * 0.45, m === "Pronto" ? "Assunto encontrado" : m))
      const fimg = await loadImg(cutout)
      const c2 = document.createElement("canvas")
      c2.width = cols; c2.height = rows
      const x2 = c2.getContext("2d", { willReadFrequently: true })!
      drawCover(x2, fimg, cols, rows)
      const a = x2.getImageData(0, 0, cols, rows).data
      let cnt = 0
      for (let i = 0; i < n; i++) {
        const v = a[i * 4 + 3] / 255
        subj[i] = v
        if (v > 0.5) {
          cnt++
          const x = (i % cols) / cols, y = Math.floor(i / cols) / rows
          subject.top = Math.min(subject.top, y); subject.bottom = Math.max(subject.bottom, y)
          subject.left = Math.min(subject.left, x); subject.right = Math.max(subject.right, x)
        }
      }
      subject.area = cnt / n
      subject.found = subject.area > 0.02 && subject.area < 0.85
      if (!subject.found) cutout = undefined
    } catch (e) {
      console.warn("recorte falhou", e)
    }
  }

  // estilo da imagem (CLIP)
  let moods: Analysis["moods"] = []
  let usedClip = false
  let medium: Analysis["medium"] = null
  if (opts.clip) {
    try {
      onProgress(58, "Reconhecendo o estilo da imagem…")
      const { pipeline, env } = await import("@huggingface/transformers")
      env.allowLocalModels = false
      const wasm = (env.backends as any).onnx.wasm
      wasm.wasmPaths = new URL("ort/", location.href).href
      wasm.numThreads = 1
      const files = new Map<string, number>()
      const clf = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
        dtype: "q8",
        progress_callback: (p: any) => {
          if (p.status === "progress" && p.file) {
            files.set(p.file, p.progress ?? 0)
            const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
            onProgress(58 + avg * 0.3, "Baixando o modelo de estilo (só na primeira vez)…")
          }
        },
      } as any)
      onProgress(90, "Reconhecendo o estilo da imagem…")
      const out = (await clf(url, PROMPTS.map((p) => p[1]), { hypothesis_template: "{}" } as any)) as { label: string; score: number }[]
      const med = (await clf(url, MEDIUMS.map((m) => m[1]), { hypothesis_template: "{}" } as any)) as { label: string; score: number }[]
      medium = MEDIUMS.find((m) => m[1] === med[0]?.label)?.[0] ?? null
      moods = out.map((o) => {
        const id = PROMPTS.find((p) => p[1] === o.label)![0]
        let score = o.score
        // foto de verdade não é "anime"/"fofo"/"pixel"; desenho não é "retrato"
        if (medium === "photo" && (id === "anime" || id === "cute" || id === "retro")) score *= 0.15
        if (medium !== "photo" && id === "person") score *= 0.3
        if (medium === "pixel" && id === "retro") score *= 2
        return { id, score }
      })
      // a cor que "marca" a foto, na opinião do modelo: reordena as cores vivas
      onProgress(94, "Escolhendo a cor de destaque…")
      const col = (await clf(url, COLOR_NAMES.map((c) => `a photo with ${c[0]} as its signature accent color`), { hypothesis_template: "{}" } as any)) as { label: string; score: number }[]
      const prob = (h: number) => {
        let best = 0, bd = 1e9
        for (const o of col) {
          const ch = COLOR_NAMES.find((c) => o.label.includes(` ${c[0]} as`))![1]
          const d = Math.min(Math.abs(ch - h), 360 - Math.abs(ch - h))
          if (d < bd) { bd = d; best = o.score }
        }
        return best
      }
      accents = accents.map((a) => ({ ...a, score: Math.sqrt(a.score) * (0.25 + 2.5 * prob(a.h)) })).sort((x, y) => y.score - x.score)
      const merged = new Map<MoodId, number>()
      for (const m of moods) merged.set(m.id, (merged.get(m.id) ?? 0) + m.score)
      moods = [...merged.entries()].map(([id, score]) => ({ id, score }))
      const tot = moods.reduce((x, m) => x + m.score, 0) || 1
      moods = moods.map((m) => ({ ...m, score: m.score / tot })).sort((a, b) => b.score - a.score)
      usedClip = true
    } catch (e) {
      console.warn("CLIP falhou", e)
    }
  }
  if (!moods.length) moods = guessMoods(palette, lsum / n, ssum / n)
  onProgress(97, "Montando o layout…")
  const result: Analysis = { palette, lum: lsum / n, sat: ssum / n, grid: { cols, rows, lum, busy, subj }, view, subject, cutout, moods, usedClip, accents, medium }
  return result
}

/** sem o modelo de estilo: um palpite pelas cores */
function guessMoods(pal: Swatch[], lum: number, sat: number): Analysis["moods"] {
  const w = (f: (s: Swatch) => boolean) => pal.filter(f).reduce((a, s) => a + s.weight, 0)
  const pink = w((s) => (s.h > 300 || s.h < 15) && s.s > 0.25 && s.l > 0.45)
  const green = w((s) => s.h > 70 && s.h < 170 && s.s > 0.2)
  const blue = w((s) => s.h > 190 && s.h < 260 && s.s > 0.2)
  const neon = w((s) => s.s > 0.6 && s.l > 0.4 && s.l < 0.75 && ((s.h > 280 && s.h < 340) || (s.h > 170 && s.h < 200)))
  const orange = w((s) => s.h > 15 && s.h < 50 && s.s > 0.35)
  const m: Analysis["moods"] = [
    { id: "cyberpunk", score: neon * 2 + (lum < 0.35 ? 0.2 : 0) },
    { id: "sakura", score: pink * 1.6 },
    { id: "nature", score: green * 1.4 },
    { id: "space", score: blue * (lum < 0.3 ? 1.6 : 0.4) },
    { id: "ocean", score: blue * (lum >= 0.3 ? 1.2 : 0.3) },
    { id: "sunset", score: orange * 1.3 },
    { id: "minimal", score: sat < 0.15 ? 0.6 + (0.15 - sat) : 0 },
    { id: "dark", score: lum < 0.2 ? 0.5 : 0 },
  ]
  return m.sort((a, b) => b.score - a.score)
}

/* ------------------------------ plano ------------------------------ */
export interface PlanOptions {
  mode: "keep" | "fresh"
  current: Widget[]
  /** widgets do conjunto novo */
  pick: WidgetType[]
  seed: number
  lockClock: boolean
  /** área da barra de tarefas para não pôr widget embaixo */
  taskbar: { position: Settings["taskbar"]["position"]; size: number }
}
export interface Plan {
  settings: Partial<Settings>
  wallpaper: Partial<Settings["wallpaper"]>
  lock?: LockClock
  widgets: Widget[]
  mood: MoodId
  moods: MoodId[]
  accent: string
  notes: string[]
  lockRect?: { x: number; y: number; w: number; h: number }
}

const SIZES: Partial<Record<WidgetType, [number, number]>> = {
  clock: [380, 170], weather: [280, 150], music: [380, 200], tasks: [330, 360], calendar: [290, 290], sysmon: [340, 240],
  musicstats: [340, 340], agenda: [330, 300], note: [260, 200], finance: [330, 280], gaming: [340, 200], photo: [280, 280], news: [340, 320],
}
export const FRESH_DEFAULT: WidgetType[] = ["clock", "weather", "music", "tasks", "sysmon"]

/** pseudo-aleatório com semente (para "gerar outra opção") */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

export function buildPlan(a: Analysis, o: PlanOptions): Plan {
  const rand = rng(o.seed * 7919 + 17)
  const notes: string[] = []
  const V = a.view
  // estilo principal (com uma pitada de variação entre as primeiras opções)
  const top = a.moods.slice(0, 3)
  let mood = top[0]?.id ?? "minimal"
  if (o.seed > 0 && top.length > 1) {
    const i = o.seed % Math.min(3, top.length)
    if (top[i] && top[i].score > (top[0].score * 0.35)) mood = top[i].id
  }
  const prof: Profile = { ...BASE, ...PROFILES[mood] }
  // um segundo estilo forte pode trazer o efeito dele (ex.: anime + sakura)
  const second = top.find((m) => m.id !== mood && m.score > (top[0]?.score ?? 1) * 0.6)
  if (second && ["sakura", "snow", "autumn", "space", "ocean"].includes(second.id) && prof.effect !== "none") {
    prof.effect = (PROFILES[second.id].effect as CursorEffect) ?? prof.effect
    if (second.id === "sakura") prof.sakura = true
  }

  // cores: destaque = a cor mais viva e presente da foto, ajustada para ler bem no escuro
  const vivid = a.accents.length ? a.accents : [...a.palette].filter((s) => s.s > 0.22 && s.l > 0.12 && s.l < 0.92).sort((x, y) => y.s * Math.sqrt(y.weight) - x.s * Math.sqrt(x.weight))
  const pickV = vivid[o.seed > 0 && vivid.length > 1 && o.seed % 2 === 1 ? 1 : 0]
  const accent = pickV ? hslToHex(pickV.h, Math.min(0.95, Math.max(0.55, pickV.s)), 0.68) : "#e8e0f0"
  const accentRaw = pickV ? hslToHex(pickV.h, Math.min(1, Math.max(0.6, pickV.s)), 0.58) : "#ffffff"
  const tint = pickV ? hslToHex(pickV.h, 0.55, 0.93) : "#ffffff"
  const darkest = [...a.palette].sort((x, y) => x.l - y.l)[0]
  const deep = darkest ? hslToHex(darkest.h, Math.min(0.5, darkest.s), Math.min(0.12, darkest.l * 0.8 + 0.03)) : "#0c0a10"
  notes.push(`Estilo reconhecido: ${MOOD_LABEL[mood]}${second ? ` + ${MOOD_LABEL[second.id]}` : ""}${a.usedClip ? "" : " (pelas cores)"}`)
  notes.push("Cor de destaque, cursor e bordas tirados da paleta da foto")

  // grade integral para custo de qualquer retângulo em O(1)
  const { cols, rows } = a.grid
  const integ = (arr: Float32Array) => {
    const I = new Float64Array((cols + 1) * (rows + 1))
    for (let y = 0; y < rows; y++) {
      let row = 0
      for (let x = 0; x < cols; x++) { row += arr[y * cols + x]; I[(y + 1) * (cols + 1) + x + 1] = I[y * (cols + 1) + x + 1] + row }
    }
    return I
  }
  // importância do assunto: a parte de cima de cada pessoa/objeto (rosto, cabeça) pesa bem mais que o resto do corpo
  const imp = new Float32Array(cols * rows)
  const headRows = Math.round(rows * 0.24)
  for (let x = 0; x < cols; x++) {
    let start = -1
    for (let y = 0; y < rows; y++) {
      const v = a.grid.subj[y * cols + x]
      if (v > 0.5) { if (start < 0) start = y } else if (v < 0.2) start = -1
      imp[y * cols + x] = v * (start >= 0 && y - start < headRows ? 3 : 1)
    }
  }
  const IB = integ(a.grid.busy), IS = integ(imp), IL = integ(a.grid.lum)
  const rectMean = (I: Float64Array, x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(0, Math.floor(x / CELL)), y0 = Math.max(0, Math.floor(y / CELL))
    const x1 = Math.min(cols, Math.ceil((x + w) / CELL)), y1 = Math.min(rows, Math.ceil((y + h) / CELL))
    const W = cols + 1
    const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]
    return s / Math.max(1, (x1 - x0) * (y1 - y0))
  }

  // área útil (fora da barra de tarefas)
  const M = 28
  const tb = o.taskbar.size + 34
  const area = { x0: M + (o.taskbar.position === "left" ? tb : 0), y0: M + (o.taskbar.position === "top" ? tb : 0), x1: V.w - M - (o.taskbar.position === "right" ? tb : 0), y1: V.h - M - (o.taskbar.position === "bottom" ? tb : 0) }
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const GAP = 18

  // relógio grande da tela: em cima do assunto (com profundidade, o assunto passa na frente)
  let lock: LockClock | undefined
  let lockRect: Plan["lockRect"]
  if (o.lockClock && a.subject.found && a.subject.top > 0.18) {
    const size = a.subject.top > 0.42 ? 1.15 : a.subject.top > 0.3 ? 1 : 0.85
    const hPct = 17 * size + 4
    const y = Math.max(4, Math.min(a.subject.top * 100 - hPct * 0.45, 30))
    const cx = ((a.subject.left + a.subject.right) / 2) * 100
    lock = {
      on: true, style: prof.lock, color: tint, size, weight: prof.lock === "thin" ? 200 : 700, y: Math.round(y), x: Math.round(Math.max(25, Math.min(75, cx))), align: "center",
      showDate: true, seconds: false, depth: true, opacity: 0.94, glow: prof.lock === "neon", font: undefined,
    }
    const ch = (hPct / 100) * V.h, cw = Math.min(V.w * 0.6, ch * 2.4)
    lockRect = { x: (lock.x / 100) * V.w - cw / 2, y: (lock.y / 100) * V.h, w: cw, h: ch }
    placed.push(lockRect)
    notes.push("Relógio grande atrás do assunto da foto (profundidade)")
  } else if (o.lockClock) {
    lock = { on: false } as LockClock
  }

  const overlaps = (r: { x: number; y: number; w: number; h: number }) =>
    placed.some((p) => r.x < p.x + p.w + GAP && r.x + r.w + GAP > p.x && r.y < p.y + p.h + GAP && r.y + r.h + GAP > p.y)
  const place = (w: number, h: number, prefer: "top" | "any") => {
    let best: { x: number; y: number; c: number } | null = null
    const xs: number[] = []
    for (let x = area.x0; x + w <= area.x1; x += 24) xs.push(x)
    xs.push(area.x1 - w)
    for (const p of placed) { xs.push(p.x); xs.push(p.x + p.w - w) }
    for (const x of xs) {
      if (x < area.x0 || x + w > area.x1) continue
      for (let y = area.y0; y + h <= area.y1; y += 24) {
        const r = { x, y, w, h }
        if (overlaps(r)) continue
        const sub = rectMean(IS, x, y, w, h)
        const bz = rectMean(IB, x, y, w, h)
        const cxn = (x + w / 2) / V.w
        const edge = Math.min(cxn, 1 - cxn) // 0 = na borda
        let c = sub * 14 + bz * 1.5 + edge * 0.6 + (rand() - 0.5) * 0.12
        if (prefer === "top") c += ((y - area.y0) / V.h) * 0.5
        // alinhado a outro widget, logo abaixo/acima dele: forma colunas organizadas
        if (placed.some((p) => p !== lockRect && (p.x === x || p.x + p.w === x + w) && (Math.abs(p.y + p.h + GAP - y) < 30 || Math.abs(y + h + GAP - p.y) < 30))) c -= 0.25
        if (!best || c < best.c) best = { x, y, c }
      }
    }
    if (!best) return null
    const r = { x: Math.round(best.x), y: Math.round(best.y), w, h }
    placed.push(r)
    return r
  }

  // aparência do widget conforme o pedaço da foto atrás dele
  const lookFor = (t: WidgetType, r: { x: number; y: number; w: number; h: number }): { look: WidgetLook; textLight: boolean } => {
    const L = rectMean(IL, r.x, r.y, r.w, r.h)
    const B = rectMean(IB, r.x, r.y, r.w, r.h)
    const S = rectMean(IS, r.x, r.y, r.w, r.h)
    const calm = B < 0.14 && S < 0.15
    const light = L > 0.62
    const floatOk = (t === "clock" || t === "weather") && calm && (L < 0.45 || L > 0.72)
    if (floatOk) return { look: { surface: "none", hover: "none", chrome: "minimal", text: light ? "#1a1420" : "#ffffff", accent, font: prof.ui }, textLight: !light }
    const radius = prof.radius
    const font = prof.ui
    switch (prof.look) {
      case "neon":
        return { look: { surface: "glass", bgColor: deep, bgAlpha: 0.55, blur: 18, border: "custom", borderColor: accentRaw + "aa", shadow: "glow", accent, hover: "glow", radius, font, text: "#ffffff" }, textLight: true }
      case "solid":
        return { look: { surface: "solid", bgColor: deep, bgAlpha: 0.94, border: "custom", borderColor: accentRaw, borderWidth: 2, shadow: "strong", accent, hover: prof.hover, radius, font, text: tint }, textLight: true }
      case "frost":
        return light
          ? { look: { surface: "glass", bgColor: "#ffffff", bgAlpha: 0.42, blur: 30, border: "custom", borderColor: "#ffffff88", shadow: "soft", accent: accentRaw, hover: prof.hover, radius, font, text: "#1a1420" }, textLight: false }
          : { look: { surface: "glass", bgColor: "#ffffff", bgAlpha: 0.12, blur: 30, border: "custom", borderColor: "#ffffff40", shadow: "soft", accent, hover: prof.hover, radius, font, text: "#ffffff" }, textLight: true }
      default:
        return { look: { surface: "glass", bgColor: deep, bgAlpha: light ? 0.55 : 0.36, blur: 26, border: "custom", borderColor: accentRaw + "40", shadow: "soft", accent, hover: prof.hover, radius, font, text: "#ffffff" }, textLight: true }
    }
  }

  const configFor = (t: WidgetType, base: Record<string, any>): Record<string, any> => {
    if (t === "clock") return { ...base, style: prof.clock, color: tint, font: prof.num, glow: prof.clock === "neon" || mood === "cyberpunk", seconds: false, showDate: true, size: 1 }
    if (t === "sysmon") return { ...base, style: base.style ?? (mood === "cyberpunk" || mood === "game" ? "graph" : "rings"), colorMode: base.colorMode ?? "accent" }
    if (t === "music") return { ...base, style: base.style ?? (mood === "retro" ? "compact" : "card") }
    return base
  }

  // quais widgets
  type Item = { id: string; type: WidgetType; config: Record<string, any>; w: number; h: number; portrait?: Widget["portrait"] }
  let items: Item[]
  if (o.mode === "keep" && o.current.length) {
    items = o.current.map((w) => ({ id: w.id, type: w.type, config: w.config, w: w.w, h: w.h, portrait: w.portrait }))
  } else {
    const pick = o.pick.filter((t) => !(t === "clock" && lock?.on))
    items = pick.map((t) => ({ id: uid(), type: t, config: {}, w: SIZES[t]?.[0] ?? 320, h: SIZES[t]?.[1] ?? 240 }))
    if (lock?.on && o.pick.includes("clock")) notes.push("O relógio virou o relógio grande da tela")
  }
  // maiores primeiro; relógio e clima preferem o alto da tela
  const order = [...items].sort((x, y) => (y.type === "clock" ? 1e9 : 0) - (x.type === "clock" ? 1e9 : 0) || y.w * y.h - x.w * x.h)
  const out: Widget[] = []
  for (const it of order) {
    let r = place(it.w, it.h, it.type === "clock" || it.type === "weather" ? "top" : "any")
    if (!r) r = place(Math.round(it.w * 0.8), Math.round(it.h * 0.8), "any")
    if (!r) { notes.push(`Sem espaço livre para: ${it.type}`); continue }
    const { look } = lookFor(it.type, r)
    const cfg = configFor(it.type, { ...it.config })
    delete cfg.bare
    cfg.look = look
    out.push({ id: it.id, type: it.type, x: r.x, y: r.y, w: r.w, h: r.h, config: cfg, portrait: undefined })
  }
  notes.push(`${out.length} widget${out.length === 1 ? "" : "s"} nas partes mais calmas da foto, longe do assunto`)

  const brightImg = a.lum > 0.62
  const settings: Partial<Settings> = {
    theme: prof.theme,
    dark: a.lum < 0.78 || prof.theme !== "minimal",
    accent,
    uiFont: prof.ui, numFont: prof.num, displayFont: prof.disp,
    radius: prof.radius,
    blur: prof.look === "solid" ? 0 : 26,
    surfaceOpacity: prof.look === "solid" ? 0.9 : 0.14,
    cursorStyle: prof.cursor,
    cursorEffect: prof.effect,
    cursorColor: tint,
    clickEffect: prof.click ?? "auto",
    sakura: { ambient: !!prof.sakura, density: prof.sakura ? 0.8 : 0.5, splash: true, splashSeconds: 3 },
    overlay: { scanlines: false, grain: false, vignette: false, ...(prof.overlay ?? {}) },
  } as Partial<Settings>
  const wallpaper = { dim: brightImg ? 0.16 : a.lum > 0.45 ? 0.06 : 0, blur: 0, parallax: true }
  return { settings, wallpaper, lock, widgets: out, mood, moods: a.moods.slice(0, 3).map((m) => m.id), accent, notes, lockRect }
}
