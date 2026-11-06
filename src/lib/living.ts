/**
 * Imagem viva: transforma uma foto em um loop curto (GIF) com movimentos
 * específicos para cada elemento detectado.
 *
 * Tudo é periódico em t ∈ [0,1): o último quadro emenda perfeitamente no primeiro.
 *  - Pessoa: respiração (o tronco sobe/desce) + leve balanço da cabeça
 *  - Folhagem: balanço ao vento com fase variando no espaço (onda passando pelas folhas)
 *  - Folhas voando: partículas com as cores das próprias folhas da foto
 *  - Flores/sakura: pétalas caindo
 *  - Céu: deriva suave + respiração de luz
 *  - Água: ondulação e cintilar
 */

export type ElementId = "depth" | "person" | "foliage" | "leaves" | "petals" | "sky" | "water" | "snow" | "sparkles" | "light"

export interface Analysis {
  w: number
  h: number
  coverage: Record<"person" | "foliage" | "flowers" | "sky" | "water", number>
  person: { cx: number; cy: number; rx: number; ry: number; top: number; bottom: number } | null
  /** máscaras suavizadas 0..1 */
  mFoliage: Float32Array
  mFlowers: Float32Array
  mSky: Float32Array
  mWater: Float32Array
  mPerson: Float32Array
  /** profundidade estimada 0 (longe) .. 1 (perto), bem suavizada */
  depth: Float32Array
  leafColors: [number, number, number][]
  petalColors: [number, number, number][]
  foliagePoints: [number, number][]
  flowerPoints: [number, number][]
}

export interface LivingOptions {
  elements: Partial<Record<ElementId, number>> // intensidade 0..2 (0 = desligado)
  seconds: number
  fps: number
  seed: number
  /** cor fixa das folhas voando / pétalas (hex); vazio = cores da própria foto */
  leafColor?: string
  petalColor?: string
}

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* ------------------------------ util ------------------------------ */

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/** desfoque de caixa separável, n passes ≈ gaussiano */
function blur(src: Float32Array, w: number, h: number, r: number, passes = 3) {
  const a = new Float32Array(src), b = new Float32Array(src.length)
  r = Math.max(1, Math.round(r))
  const div = 2 * r + 1
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0
      const row = y * w
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))]
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / div
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x]
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / div
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]
      }
    }
  }
  return a
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function loadImage(url: string) {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.src = url
  await img.decode()
  return img
}

export function fitSize(iw: number, ih: number, long: number) {
  const k = Math.min(1, long / Math.max(iw, ih))
  return { w: Math.max(2, Math.round((iw * k) / 2) * 2), h: Math.max(2, Math.round((ih * k) / 2) * 2) }
}

export function rasterize(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/* ------------------------------ análise ------------------------------ */

export function analyze(src: ImageData): Analysis {
  const { width: w, height: h, data } = src
  const N = w * h
  const fol = new Float32Array(N), flo = new Float32Array(N), sky = new Float32Array(N), wat = new Float32Array(N), skin = new Float32Array(N)
  const lum = new Float32Array(N)
  for (let i = 0; i < N; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255

  // textura local (gradiente) para separar folhagem (texturizada) de céu/paredes (lisos)
  const tex = new Float32Array(N)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      tex[i] = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w])
    }
  const texB = blur(tex, w, h, Math.max(2, w / 160), 2)

  let skinCount = 0, sx = 0, sy = 0
  let minX = w, maxX = 0, minY = h, maxY = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
      const [hu, s, l] = rgbToHsl(r, g, b)
      const t = texB[i]
      const yr = y / h
      // folhagem: verdes/amarelos/laranjas texturizados
      if (((hu >= 55 && hu <= 170 && s > 0.15 && l > 0.08 && l < 0.85) || (hu >= 18 && hu < 55 && s > 0.35 && t > 0.06)) && t > 0.035) fol[i] = 1
      // flores claras/rosadas (sakura, cerejeira)
      if (((hu >= 300 || hu <= 15) && s > 0.12 && l > 0.55) || (hu >= 280 && hu < 300 && s > 0.2 && l > 0.5)) flo[i] = t > 0.02 ? 1 : 0.5
      // céu: azul ou claro, liso, na parte de cima
      if (yr < 0.65 && t < 0.05 && ((hu >= 180 && hu <= 250 && s > 0.12 && l > 0.35) || (l > 0.78 && s < 0.25))) sky[i] = 1 - yr * 0.6
      // água: azul/ciano na metade de baixo, com alguma textura
      if (yr > 0.4 && hu >= 170 && hu <= 240 && s > 0.15 && l > 0.15 && l < 0.85) wat[i] = Math.min(1, (yr - 0.4) * 3)
      // pele (regra YCbCr)
      const Y = 0.299 * r + 0.587 * g + 0.114 * b
      const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
      const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
      if (Y > 60 && Cr > 136 && Cr < 175 && Cb > 80 && Cb < 128 && r > g && r > b && fol[i] === 0) {
        skin[i] = 1
        skinCount++
        sx += x
        sy += y
      }
    }

  // pele: usa o aglomerado principal (pixels próximos do centróide) para estimar a pessoa
  let person: Analysis["person"] = null
  const mPerson = new Float32Array(N)
  if (skinCount > N * 0.004) {
    const skB = blur(skin, w, h, w / 80, 2)
    let best = 0, bx = 0, by = 0
    for (let i = 0; i < N; i++) if (skB[i] > best) { best = skB[i]; bx = i % w; by = (i / w) | 0 }
    const R = Math.max(w, h) * 0.22
    let cnt = 0
    for (let y = Math.max(0, by - R); y < Math.min(h, by + R); y++)
      for (let x = Math.max(0, bx - R); x < Math.min(w, bx + R); x++) {
        if (skB[(y | 0) * w + (x | 0)] > best * 0.25) {
          cnt++
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
      }
    if (cnt > N * 0.003) {
      const fw = Math.max(maxX - minX, w * 0.06), fh = Math.max(maxY - minY, h * 0.06)
      // a pele mais alta costuma ser o rosto; o corpo continua para baixo
      const cx = (minX + maxX) / 2
      const top = Math.max(0, minY - fh * 0.35)
      const bottom = Math.min(h, maxY + fh * 2.4)
      const rx = Math.min(w * 0.45, fw * 1.4)
      const ry = (bottom - top) / 2
      const cy = (top + bottom) / 2
      person = { cx, cy, rx, ry, top, bottom }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
          mPerson[y * w + x] = d < 1 ? 1 : 0
        }
    }
  }
  // pessoa não deve balançar como folha
  if (person) for (let i = 0; i < N; i++) if (mPerson[i]) { fol[i] *= 0.15; flo[i] *= 0.3; sky[i] = 0 }

  // profundidade (heurística): embaixo = perto, céu = longe, pessoa à frente, textura fina = mais perto
  const dRaw = new Float32Array(N)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let d = 0.12 + 0.75 * Math.pow(y / h, 1.15)
      if (sky[i]) d = 0
      d += Math.min(0.12, texB[i] * 0.8)
      if (mPerson[i]) d = Math.max(d, 0.85)
      dRaw[i] = d
    }
  const depth = blur(dRaw, w, h, Math.max(w, h) / 45, 3)

  const r = Math.max(w, h) / 90
  const out: Analysis = {
    depth,
    w, h,
    mFoliage: blur(fol, w, h, r),
    mFlowers: blur(flo, w, h, r),
    mSky: blur(sky, w, h, r * 2),
    mWater: blur(wat, w, h, r),
    mPerson: person ? blur(mPerson, w, h, r * 2.5) : mPerson,
    person,
    coverage: { person: 0, foliage: 0, flowers: 0, sky: 0, water: 0 },
    leafColors: [], petalColors: [], foliagePoints: [], flowerPoints: [],
  }
  const cov = (m: Float32Array) => { let s = 0; for (let i = 0; i < N; i++) s += m[i] > 0.5 ? 1 : 0; return s / N }
  out.coverage = { person: person ? cov(out.mPerson) : 0, foliage: cov(out.mFoliage), flowers: cov(out.mFlowers), sky: cov(out.mSky), water: cov(out.mWater) }

  // amostras de cor e posição para as partículas
  const rnd = mulberry(7)
  for (let k = 0; k < 4000 && (out.leafColors.length < 40 || out.petalColors.length < 40); k++) {
    const i = Math.floor(rnd() * N)
    const c: [number, number, number] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
    if (fol[i] && out.leafColors.length < 40) { out.leafColors.push(c); out.foliagePoints.push([i % w, (i / w) | 0]) }
    if (flo[i] && out.petalColors.length < 40) { out.petalColors.push(c); out.flowerPoints.push([i % w, (i / w) | 0]) }
  }
  return out
}

/** Sugere quais efeitos ligar, com base no que foi detectado. */
export function suggest(a: Analysis): Partial<Record<ElementId, number>> {
  const c = a.coverage
  return {
    depth: 0.8,
    person: c.person > 0.01 ? 1 : 0,
    foliage: c.foliage > 0.03 ? 1 : 0,
    leaves: c.foliage > 0.06 ? 1 : 0,
    petals: c.flowers > 0.02 ? 1 : 0,
    sky: c.sky > 0.08 ? 1 : 0,
    water: c.water > 0.05 ? 1 : 0,
    snow: 0,
    sparkles: 0,
    light: 0,
  }
}

/* ------------------------------ renderização ------------------------------ */

const TAU = Math.PI * 2

interface Particle { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; phase: number; color: [number, number, number]; kind: "leaf" | "petal" | "snow" | "spark" }

function makeParticles(a: Analysis, o: LivingOptions): Particle[] {
  const rnd = mulberry(o.seed)
  const P: Particle[] = []
  const S = Math.max(a.w, a.h)
  const add = (kind: Particle["kind"], n: number, pts: [number, number][], cols: [number, number, number][], fallback: [number, number, number]) => {
    for (let k = 0; k < n; k++) {
      const p = pts.length ? pts[Math.floor(rnd() * pts.length)] : [rnd() * a.w, rnd() * a.h * 0.6]
      const fixed = kind === "leaf" ? o.leafColor : kind === "petal" ? o.petalColor : undefined
      let c: [number, number, number]
      if (fixed) {
        // cor escolhida, com uma variação natural de tom entre as folhas
        const [r0, g0, b0] = hexRgb(fixed)
        const k = 0.82 + rnd() * 0.36
        c = [Math.min(255, r0 * k), Math.min(255, g0 * k), Math.min(255, b0 * k)]
      } else {
        const c0 = cols.length ? cols[Math.floor(rnd() * cols.length)] : fallback
        // folhas soltas ficam um pouco mais claras/amareladas que a copa, para se destacarem
        const lift = kind === "leaf" ? 1.15 + rnd() * 0.35 : 1
        c = kind === "leaf"
          ? [Math.min(255, c0[0] * lift + 25 * rnd()), Math.min(255, c0[1] * lift), Math.min(255, c0[2] * lift * 0.8)]
          : c0
      }
      P.push({
        x: p[0] + (rnd() - 0.5) * S * 0.05,
        y: p[1] + (rnd() - 0.5) * S * 0.05,
        vx: (kind === "snow" ? (rnd() - 0.5) * 0.02 : kind === "leaf" ? 0.06 + rnd() * 0.1 : 0.03 + rnd() * 0.06) * S,
        vy: (kind === "spark" ? 0 : kind === "leaf" ? 0.02 + rnd() * 0.07 : 0.03 + rnd() * 0.05) * S,
        rot: rnd() * TAU,
        vr: (rnd() - 0.5) * 6,
        size: (kind === "spark" ? 0.006 : kind === "snow" ? 0.004 : kind === "leaf" ? 0.017 : 0.012) * S * (0.6 + rnd() * 0.8),
        phase: rnd(),
        color: c,
        kind,
      })
    }
  }
  const e = o.elements
  if (e.leaves) add("leaf", Math.round(16 * e.leaves), a.foliagePoints, a.leafColors, [110, 150, 60])
  if (e.petals) add("petal", Math.round(14 * e.petals), a.flowerPoints, a.petalColors, [255, 190, 210])
  if (e.snow) {
    const pts: [number, number][] = Array.from({ length: 50 }, () => [rnd() * a.w, rnd() * a.h])
    add("snow", Math.round(45 * e.snow), pts, [], [255, 255, 255])
  }
  if (e.sparkles) {
    const pts: [number, number][] = Array.from({ length: 40 }, () => [rnd() * a.w, rnd() * a.h])
    add("spark", Math.round(18 * e.sparkles), pts, [], [255, 250, 220])
  }
  return P
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  // cada partícula vive um ciclo inteiro com fade nas pontas -> loop perfeito
  const u = (t + p.phase) % 1
  const alpha = Math.sin(Math.PI * u) ** 1.2
  if (alpha < 0.02) return
  const x = p.x + p.vx * u + Math.sin(u * TAU * 1.5 + p.phase * 9) * p.size * 0.8
  const y = p.y + p.vy * u
  const [r, g, b] = p.color
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  if (p.kind === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.arc(0, 0, p.size, 0, TAU)
    ctx.fill()
  } else if (p.kind === "spark") {
    const s = p.size * (0.4 + 0.6 * Math.sin(Math.PI * u))
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.shadowColor = "rgba(255,240,200,0.9)"
    ctx.shadowBlur = s * 3
    ctx.beginPath()
    for (let j = 0; j < 8; j++) {
      const ang = (j / 8) * TAU
      const rr = j % 2 === 0 ? s : s * 0.22
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
    }
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.rotate(p.rot + p.vr * u)
    // giro 3D: achata em um eixo
    ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos((u * 2 + p.phase) * Math.PI)))
    const s = p.size
    const shade = 0.8 + 0.25 * Math.cos(u * TAU * 2)
    ctx.fillStyle = `rgb(${Math.min(255, r * shade)},${Math.min(255, g * shade)},${Math.min(255, b * shade)})`
    ctx.beginPath()
    if (p.kind === "leaf") {
      ctx.shadowColor = "rgba(0,0,0,0.35)"
      ctx.shadowBlur = s * 0.6
      ctx.shadowOffsetY = s * 0.15
      ctx.moveTo(-s, 0)
      ctx.quadraticCurveTo(0, -s * 0.55, s, 0)
      ctx.quadraticCurveTo(0, s * 0.55, -s, 0)
      ctx.fill()
      ctx.strokeStyle = `rgba(${r * 0.6},${g * 0.6},${b * 0.6},0.6)`
      ctx.lineWidth = Math.max(0.5, s * 0.08)
      ctx.beginPath()
      ctx.moveTo(-s, 0)
      ctx.lineTo(s * 0.9, 0)
      ctx.stroke()
    } else {
      ctx.moveTo(0, s * 0.8)
      ctx.bezierCurveTo(-s * 0.7, s * 0.4, -s * 0.8, -s * 0.4, -s * 0.35, -s * 0.85)
      ctx.lineTo(0, -s * 0.6)
      ctx.lineTo(s * 0.35, -s * 0.85)
      ctx.bezierCurveTo(s * 0.8, -s * 0.4, s * 0.7, s * 0.4, 0, s * 0.8)
      ctx.fill()
    }
  }
  ctx.restore()
}

/**
 * Gera todos os quadros (RGBA) do loop.
 * Se `onFrame` for passado, os quadros não ficam guardados na memória (usado na exportação em alta).
 */
export async function renderFrames(
  src: ImageData, a: Analysis, o: LivingOptions,
  onProgress?: (p: number) => void,
  onFrame?: (f: ImageData, index: number, total: number) => void,
): Promise<ImageData[]> {
  const { w, h } = a
  const n = Math.max(2, Math.round(o.seconds * o.fps))
  const e = o.elements
  const S = Math.max(w, h)
  const sd = src.data
  const rnd = mulberry(o.seed * 7919 + 13)

  /* ---------- vento: várias ondas viajando em direções e escalas diferentes ----------
     Cada onda tem frequência temporal inteira (1, 2, 3…): o loop emenda perfeitamente,
     mas a soma delas não se repete dentro do loop, então não parece um "pulo" único. */
  const windDir = (rnd() - 0.5) * 0.6
  const mk = (len: number, m: number, amp: number, ang: number) => ({
    m, amp, kx: (Math.cos(ang) * TAU) / (len * S), ky: (Math.sin(ang) * TAU) / (len * S), ph: rnd() * TAU, tt: 0,
  })
  const WAVES = [mk(0.42, 1, 1.0, windDir), mk(0.23, 2, 0.55, windDir + 0.5), mk(0.14, 3, 0.32, windDir - 0.7), mk(0.31, 1, 0.45, windDir + 2.4)]
  // tremular das folhas: ondas curtas e rápidas
  const FLUT = [mk(0.018, 4, 0.6, 0.3 + rnd()), mk(0.026, 3, 0.4, 2.1 + rnd())]
  const gustK = TAU / (S * 0.9)

  const fol = (e.foliage ?? 0) * S * 0.0042
  const skyL = (e.sky ?? 0) * S * 0.045 // quanto as nuvens andam em um loop
  const watL = (e.water ?? 0) * S * 0.03 // quanto a água corre em um loop
  const watR = (e.water ?? 0) * S * 0.0025 // ondulação
  const per = e.person ?? 0
  const pp = a.person
  const lightA = (e.light ?? 0) * 0.05
  const dep = e.depth ?? 0
  const camA = dep * S * 0.011 // órbita da câmera
  const zoom = 1 + dep * 0.028 // margem para a câmera não mostrar a borda
  const cx = w / 2, cy = h / 2

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const particles = makeParticles(a, o)
  const frames: ImageData[] = []
  const out = ctx.createImageData(w, h)
  const od = out.data
  let cr = 0, cg = 0, cb = 0

  // amostragem bilinear (resultado em cr/cg/cb)
  const sample = (sx: number, sy: number) => {
    if (sx < 0) sx = 0; else if (sx > w - 1.001) sx = w - 1.001
    if (sy < 0) sy = 0; else if (sy > h - 1.001) sy = h - 1.001
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0
    const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4
    const a0 = (1 - fx) * (1 - fy), a1 = fx * (1 - fy), a2 = (1 - fx) * fy, a3 = fx * fy
    cr = sd[i00] * a0 + sd[i10] * a1 + sd[i01] * a2 + sd[i11] * a3
    cg = sd[i00 + 1] * a0 + sd[i10 + 1] * a1 + sd[i01 + 1] * a2 + sd[i11 + 1] * a3
    cb = sd[i00 + 2] * a0 + sd[i10 + 2] * a1 + sd[i01 + 2] * a2 + sd[i11 + 2] * a3
  }

  for (let f = 0; f < n; f++) {
    const t = f / n
    const T = TAU * t
    const st = Math.sin(T)
    // pessoa: respiração lenta (escala ancorada embaixo) + balanço leve da cabeça
    const breathe = per * 0.0045 * st
    const sway = per * S * 0.002 * Math.sin(T + 1.2)
    // câmera: órbita elíptica suave (efeito "foto 3D")
    const camX = camA * Math.cos(T), camY = camA * 0.55 * Math.sin(T)
    // fluxo (água/nuvens): duas camadas defasadas meio ciclo, trocando de peso -> movimento contínuo sem salto
    const uA = t, uB = (t + 0.5) % 1
    const wA = 1 - Math.abs(2 * uA - 1), wB = 1 - wA
    const oA = uA - 0.5, oB = uB - 0.5
    for (const wv of WAVES) wv.tt = TAU * wv.m * t
    for (const wv of FLUT) wv.tt = TAU * wv.m * t
    const [w0, w1, w2, w3] = WAVES
    const [f0, f1] = FLUT

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        let dx = 0, dy = 0, bright = 0
        const mp = a.mPerson[i]
        const keep = pp ? Math.max(0, 1 - mp * 1.6) : 1

        // folhagem: soma de ondas + rajada que atravessa a cena + tremular fino
        const mf = a.mFoliage[i] * keep, mfl = a.mFlowers[i] * keep
        if (fol && (mf > 0.01 || mfl > 0.01)) {
          const m = Math.max(mf, mfl * 0.8)
          const wx =
            w0.amp * Math.sin(x * w0.kx + y * w0.ky + w0.ph - w0.tt) +
            w1.amp * Math.sin(x * w1.kx + y * w1.ky + w1.ph - w1.tt) +
            w2.amp * Math.sin(x * w2.kx + y * w2.ky + w2.ph - w2.tt) +
            w3.amp * Math.sin(x * w3.kx + y * w3.ky + w3.ph - w3.tt)
          const gust = 0.6 + 0.4 * Math.sin(x * gustK * 0.8 + y * gustK * 0.2 - T)
          const flut = f0.amp * Math.sin(x * f0.kx + y * f0.ky + f0.ph - f0.tt) + f1.amp * Math.sin(x * f1.kx + y * f1.ky + f1.ph - f1.tt)
          dx += fol * m * gust * (wx * 0.75 + flut * 0.35)
          dy += fol * m * gust * (wx * 0.12 + flut * 0.3)
          bright += 0.045 * (e.foliage ?? 0) * m * flut * gust
        }

        // pessoa
        if (per && pp && mp > 0.01) {
          const rel = Math.max(0, Math.min(1, (pp.bottom - y) / (pp.bottom - pp.top)))
          dy += (y - pp.bottom) * breathe * mp
          dx += (x - pp.cx) * breathe * 0.5 * mp
          dx += sway * rel * rel * mp
        }

        // câmera 3D: o que está perto anda mais que o que está longe
        let px = x, py = y
        if (dep) {
          const d = a.depth[i] - 0.45
          px = cx + (x - cx) / zoom + camX * d
          py = cy + (y - cy) / zoom + camY * d
        }

        if (lightA) bright += lightA * st * (0.5 + 0.5 * (1 - y / h))

        const ms = skyL ? a.mSky[i] * keep : 0
        const mw = watL ? a.mWater[i] * keep : 0
        let sx = px - dx, sy = py - dy
        let r: number, g: number, b: number
        if (ms > 0.02 || mw > 0.02) {
          // vetor de fluxo: nuvens para o lado; água para o lado com leve curvatura
          const fx = skyL * ms + watL * mw
          let fy = 0
          if (mw > 0.02) {
            const wave = TAU * (2 * t - y / (S * 0.03)) + x / (S * 0.05)
            sx += watR * mw * Math.sin(wave)
            sy += watR * 0.35 * mw * Math.cos(wave * 0.7)
            fy = watL * mw * 0.08 * Math.sin(x / (S * 0.12))
            bright += 0.07 * (e.water ?? 0) * mw * Math.max(0, Math.sin(wave + x / (S * 0.018))) ** 8
          }
          if (ms > 0.02) bright += 0.025 * (e.sky ?? 0) * ms * Math.cos(T)
          sample(sx - fx * oA, sy - fy * oA)
          r = cr * wA; g = cg * wA; b = cb * wA
          sample(sx - fx * oB, sy - fy * oB)
          r += cr * wB; g += cg * wB; b += cb * wB
        } else {
          sample(sx, sy)
          r = cr; g = cg; b = cb
        }
        const k = 1 + bright
        const o4 = i * 4
        od[o4] = r * k
        od[o4 + 1] = g * k
        od[o4 + 2] = b * k
        od[o4 + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
    for (const p of particles) drawParticle(ctx, p, t)
    const frame = ctx.getImageData(0, 0, w, h)
    if (onFrame) onFrame(frame, f, n)
    else frames.push(frame)
    onProgress?.((f + 1) / n)
    if (f % 2 === 1) await new Promise((r) => setTimeout(r, 0)) // não travar a interface
  }
  return frames
}

export function packFrames(frames: ImageData[]) {
  const one = frames[0].data.length
  const all = new Uint8Array(one * frames.length)
  frames.forEach((f, i) => all.set(f.data, i * one))
  return all
}
