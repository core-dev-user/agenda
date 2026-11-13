/**
 * Motor de efeitos do widget do Valorant. Sem React e sem DOM: recebe um contexto 2D e desenha.
 *
 * - Cada agente tem uma "receita" (lista de camadas) inspirada nas habilidades dele; as camadas são formas
 *   abstratas (partículas, anéis, raios, lâminas genéricas). O agente em si é sempre a arte oficial da Riot,
 *   desenhada pelo widget, nunca por aqui.
 * - Duas faces: "back" (atrás do agente) e "front" (na frente dele, abaixo do nome).
 * - O tempo vem em segundos (dt): a velocidade não depende da taxa de quadros (60, 144 ou 180 Hz).
 * - Nada de timers aqui: quem chama decide quando passar o tempo e quando parar.
 */

export type FxMode = "sig" | "ult" | "amb"
export type Side = "back" | "front"
export type LayerKind =
  | "blades" | "wind" | "embers" | "flames" | "orbs" | "rings" | "bolts" | "smoke" | "shards" | "barrier"
  | "scan" | "radar" | "circuit" | "orbital" | "beams" | "icons" | "rifts" | "waves" | "wires" | "prism"
  | "streaks" | "spikes" | "rockets" | "eyes" | "stars" | "cosmic" | "sheen" | "reticle" | "bubbles"
  | "crack" | "blasts" | "wisps" | "leaves" | "heal" | "flash"

export interface LayerSpec {
  k: LayerKind
  /** cor principal e secundária (hex) */
  c?: string
  c2?: string
  /** quantidade base (antes de intensidade e "quantidade de partículas") */
  n?: number
  /** multiplicador de velocidade da camada */
  s?: number
  /** opacidade da camada */
  a?: number
  /** variação de comportamento da camada (ex.: anéis no chão, linhas na vertical) */
  v?: string
  /** quantidade fixa: não muda com intensidade nem partículas (as cinco adagas da Jett) */
  fixed?: boolean
  /** some no modo "ambiente" (flashes, explosões, disparos) */
  loud?: boolean
}
export interface Recipe { name: string; note: string; sig: LayerSpec[]; ult?: LayerSpec[]; amb?: LayerSpec[] }
export interface AgentInfo { uuid: string; displayName: string; role?: { displayName: string } | null; backgroundGradientColors?: string[]; abilities?: { slot: string; displayIcon: string | null }[] }

export interface FxOptions {
  /** baixa 0.6, média 1, alta 1.5 */
  intensity: number
  /** quantidade de partículas: 0.3 a 2 */
  particles: number
  /** economia: metade das partículas, sem rastros */
  eco: boolean
}
export interface FxEnv {
  /** bolinha de luz desfocada pronta para desenhar (soft = mais espalhada, para fumaça) */
  sprite(color: string, soft?: boolean): CanvasImageSource | null
  /** imagem oficial carregada (ícone de habilidade) ou null enquanto não chegou */
  image(url: string): CanvasImageSource | null
}
export interface Scene {
  step(dt: number): void
  draw(ctx: CanvasRenderingContext2D, side: Side): void
  resize(w: number, h: number, cx?: number, cy?: number): void
  /** quantos elementos uma camada desenha (para os testes: a Jett tem exatamente cinco adagas) */
  count(kind: LayerKind): number
  kinds(): LayerKind[]
}

/* ------------------------------------------------------------------ utilidades ------------------------------------------------------------------ */
const TAU = Math.PI * 2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const ease = (t: number) => t * t * (3 - 2 * t)
export function hashSeed(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
export function rngFrom(seed: number) {
  let a = seed || 1
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/** clareia uma cor escura do catálogo (as cores de fundo dos agentes) até virar uma cor de efeito */
export function brighten(hex: string, light = 0.66): string {
  const h = hex.replace("#", "").slice(0, 6)
  const n = parseInt(h.length === 6 ? h : "7f7f7f", 16)
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let hue = 0, sat = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    hue /= 6
  }
  sat = Math.max(sat, 0.55)
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat, p = 2 * light - q
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  r = f(hue + 1 / 3); g = f(hue); b = f(hue - 1 / 3)
  return "#" + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")
}

interface World {
  w: number; h: number; cx: number; cy: number
  /** medida de referência: o menor lado */
  m: number
  t: number
  rng: () => number
  env: FxEnv
  opts: FxOptions
  icons: string[]
}
interface Layer { kind: LayerKind; count: () => number; step(dt: number): void; draw(ctx: CanvasRenderingContext2D, side: Side): void }
type Make = (L: LayerSpec, W: World) => Layer

/** quantos itens uma camada desenha com as opções atuais (área do widget também conta) */
function amount(L: LayerSpec, W: World, base: number) {
  if (L.fixed) return L.n ?? base
  const area = clamp((W.w * W.h) / (340 * 330), 0.55, 1.7)
  return Math.max(1, Math.round((L.n ?? base) * W.opts.intensity * W.opts.particles * (W.opts.eco ? 0.5 : 1) * area))
}
function glow(ctx: CanvasRenderingContext2D, W: World, color: string, x: number, y: number, r: number, alpha: number, soft = false) {
  const sp = W.env.sprite(color, soft)
  if (!sp || alpha <= 0.003 || r <= 0.2) return
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.drawImage(sp, x - r, y - r, r * 2, r * 2)
}
const lighter = (ctx: CanvasRenderingContext2D) => { ctx.globalCompositeOperation = "lighter" }
const normal = (ctx: CanvasRenderingContext2D) => { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1 }

/* ------------------------------------------------------------------ camadas ------------------------------------------------------------------ */

/** Lâminas orbitando o agente (Jett: Tormenta de Aço). Quantidade FIXA; um pulso percorre as lâminas de tempos em tempos. */
const blades: Make = (L, W) => {
  const n = L.n ?? 5
  let base = 0, clock = 0
  const c = L.c ?? "#bdefff", c2 = L.c2 ?? "#5fc7ff"
  const shape = (ctx: CanvasRenderingContext2D, len: number, wid: number) => {
    ctx.beginPath()
    ctx.moveTo(len * 0.55, 0)
    ctx.lineTo(len * 0.06, wid * 0.5)
    ctx.lineTo(-len * 0.2, wid * 0.22)
    ctx.lineTo(-len * 0.46, wid * 0.16)
    ctx.lineTo(-len * 0.46, -wid * 0.16)
    ctx.lineTo(-len * 0.2, -wid * 0.22)
    ctx.lineTo(len * 0.06, -wid * 0.5)
    ctx.closePath()
  }
  return {
    kind: "blades", count: () => n,
    step(dt) { base += dt * TAU * 0.17 * (L.s ?? 1); clock += dt },
    draw(ctx, side) {
      const R = W.m * 0.37, tilt = 0.34, cy = W.cy - W.m * 0.03
      const period = 3.6, ph = clock % period
      for (let i = 0; i < n; i++) {
        const a = base + (i * TAU) / n
        const depth = Math.sin(a)
        if ((depth >= 0) !== (side === "front")) continue
        const k = (depth + 1) / 2
        const scale = 0.8 + 0.32 * k
        const alpha = (0.5 + 0.5 * k) * (L.a ?? 1)
        // pulso: passa de lâmina em lâmina, um pouco depois de cada uma
        const pulse = Math.max(0, 1 - Math.abs(ph - 0.4 - i * 0.1) / 0.14)
        const len = W.m * 0.135 * scale, wid = len * 0.24
        const trail = W.opts.eco ? 0 : 3
        for (let j = trail; j >= 0; j--) {
          const aj = a - j * 0.075 * (L.s ?? 1)
          const x = W.cx + Math.cos(aj) * R, y = cy + Math.sin(aj) * R * tilt + Math.sin(W.t * 1.6 + i) * W.m * 0.012
          const ang = Math.atan2(R * tilt * Math.cos(aj), -R * Math.sin(aj))
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(ang)
          if (j > 0) {
            ctx.globalAlpha = alpha * (0.16 / j)
            ctx.fillStyle = c2
            shape(ctx, len, wid)
            ctx.fill()
          } else {
            lighter(ctx)
            const sp = W.env.sprite(c2)
            if (sp) { ctx.globalAlpha = 0.35 * alpha + pulse * 0.6; ctx.drawImage(sp, -len * 0.7, -len * 0.7, len * 1.4, len * 1.4) }
            ctx.globalCompositeOperation = "source-over"
            const g = ctx.createLinearGradient(-len * 0.46, 0, len * 0.55, 0)
            g.addColorStop(0, c2)
            g.addColorStop(0.55, c)
            g.addColorStop(1, "#ffffff")
            ctx.globalAlpha = alpha
            ctx.fillStyle = g
            shape(ctx, len, wid)
            ctx.fill()
            ctx.globalAlpha = alpha * (0.55 + pulse * 0.45)
            ctx.strokeStyle = "#ffffff"
            ctx.lineWidth = Math.max(0.6, len * 0.018)
            ctx.beginPath(); ctx.moveTo(-len * 0.4, 0); ctx.lineTo(len * 0.5, 0); ctx.stroke()
          }
          ctx.restore()
        }
      }
      normal(ctx)
    },
  }
}

/** Correntes de vento em volta do agente (arcos de elipse que correm, com cauda). */
const wind: Make = (L, W) => {
  const n = amount(L, W, 8)
  const c = L.c ?? "#d7f6ff"
  const items = Array.from({ length: n }, () => ({ a: W.rng() * TAU, r: 0.24 + W.rng() * 0.34, len: 0.5 + W.rng() * 0.9, sp: 0.5 + W.rng() * 0.9, dy: (W.rng() - 0.5) * 0.4, tilt: 0.22 + W.rng() * 0.25, wd: 0.6 + W.rng() }))
  return {
    kind: "wind", count: () => items.length,
    step(dt) { for (const it of items) it.a += dt * it.sp * 1.4 * (L.s ?? 1) },
    draw(ctx, side) {
      ctx.strokeStyle = c
      ctx.lineCap = "round"
      for (const it of items) {
        const mid = Math.sin(it.a + it.len / 2)
        if ((mid >= 0.25) !== (side === "front")) continue
        const seg = 4
        for (let k = 0; k < seg; k++) {
          const a1 = it.a + (it.len * k) / seg, a2 = it.a + (it.len * (k + 1)) / seg
          ctx.globalAlpha = (L.a ?? 0.5) * ((k + 1) / seg) * (side === "front" ? 0.45 : 1)
          ctx.lineWidth = W.m * 0.006 * it.wd * ((k + 1) / seg)
          ctx.beginPath()
          ctx.ellipse(W.cx, W.cy + it.dy * W.m * 0.5, W.m * it.r, W.m * it.r * it.tilt, -0.12, a1, a2)
          ctx.stroke()
        }
      }
      normal(ctx)
    },
  }
}

/** Partículas que sobem e tremeluzem (brasas, faíscas, luzes). */
const risers = (kind: LayerKind, defaults: { n: number; vy: [number, number]; size: [number, number]; sway: number; front: number }): Make => (L, W) => {
  const n = amount(L, W, defaults.n)
  const cols = [L.c ?? "#ffb15c", L.c2 ?? L.c ?? "#ff6a2b"]
  const spawn = (p: { x: number; y: number; vy: number; life: number; max: number; size: number; ph: number }, fresh: boolean) => {
    p.x = W.cx + (W.rng() - 0.5) * W.w * 0.95
    p.y = fresh ? W.rng() * W.h : W.h + 6
    p.vy = (defaults.vy[0] + W.rng() * (defaults.vy[1] - defaults.vy[0])) * (W.m / 300)
    p.max = 1.6 + W.rng() * 2.4
    p.life = fresh ? W.rng() * p.max : 0
    p.size = (defaults.size[0] + W.rng() * (defaults.size[1] - defaults.size[0])) * (W.m / 300)
    p.ph = W.rng() * TAU
  }
  const ps = Array.from({ length: n }, () => { const p = { x: 0, y: 0, vy: 0, life: 0, max: 1, size: 1, ph: 0 }; spawn(p, true); return p })
  return {
    kind, count: () => ps.length,
    step(dt) {
      for (const p of ps) {
        p.life += dt
        p.y -= p.vy * dt * (L.s ?? 1)
        p.x += Math.sin(W.t * 1.3 + p.ph) * defaults.sway * dt * (W.m / 300)
        if (p.life > p.max || p.y < -10) spawn(p, false)
      }
    },
    draw(ctx, side) {
      lighter(ctx)
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        const front = i % 10 < defaults.front * 10
        if (front !== (side === "front")) continue
        const f = Math.sin((Math.PI * p.life) / p.max) * (0.65 + 0.35 * Math.sin(W.t * 9 + p.ph))
        glow(ctx, W, cols[i % 2], p.x, p.y, p.size * 3, f * (L.a ?? 0.9))
      }
      normal(ctx)
    },
  }
}
const embers = risers("embers", { n: 26, vy: [30, 75], size: [1.3, 3], sway: 14, front: 0.25 })
const heal = risers("heal", { n: 18, vy: [14, 32], size: [1.6, 3.4], sway: 8, front: 0.2 })

/** Chamas na borda de baixo (línguas que oscilam). */
const flames: Make = (L, W) => {
  const c = L.c ?? "#ff7a1a", c2 = L.c2 ?? "#ffd27a"
  const k = 9
  const ph = Array.from({ length: k }, () => W.rng() * TAU)
  return {
    kind: "flames", count: () => k,
    step() {},
    draw(ctx, side) {
      if (side !== "front") return
      const top = W.h * (0.8 - 0.07 * W.opts.intensity)
      const layer = (color: string, hMul: number, alpha: number, shift: number) => {
        const g = ctx.createLinearGradient(0, W.h, 0, top)
        g.addColorStop(0, color)
        g.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = g
        ctx.globalAlpha = alpha * (L.a ?? 1)
        ctx.beginPath()
        ctx.moveTo(0, W.h)
        for (let i = 0; i <= k; i++) {
          const x = (i / k) * W.w
          const fl = 0.55 + 0.45 * Math.sin(W.t * (2.1 + (i % 3) * 0.4) * (L.s ?? 1) + ph[i % k] + shift)
          const hh = (W.h - top) * hMul * fl
          const xm = x - W.w / k / 2
          ctx.quadraticCurveTo(xm, W.h - hh * 0.35, x, W.h - hh)
        }
        ctx.lineTo(W.w, W.h)
        ctx.closePath()
        ctx.fill()
      }
      lighter(ctx)
      layer(c, 1, 0.55, 0)
      layer(c2, 0.55, 0.45, 1.7)
      normal(ctx)
    },
  }
}

/** Orbes flutuando em trajetórias de Lissajous ao redor do agente. */
const orbs: Make = (L, W) => {
  const n = amount(L, W, 7)
  const c = L.c ?? "#c77dff", c2 = L.c2 ?? "#ffffff"
  const items = Array.from({ length: n }, () => ({ rx: 0.18 + W.rng() * 0.3, ry: 0.12 + W.rng() * 0.3, f1: 0.25 + W.rng() * 0.35, f2: 0.2 + W.rng() * 0.4, p: W.rng() * TAU, r: 4 + W.rng() * 6 }))
  let t = 0
  return {
    kind: "orbs", count: () => items.length,
    step(dt) { t += dt * (L.s ?? 1) },
    draw(ctx, side) {
      lighter(ctx)
      for (const o of items) {
        const depth = Math.sin(o.f1 * t * TAU * 0.5 + o.p)
        if ((depth >= 0) !== (side === "front")) continue
        const x = W.cx + Math.cos(o.f1 * t * TAU * 0.5 + o.p) * o.rx * W.m
        const y = W.cy + Math.sin(o.f2 * t * TAU * 0.5 + o.p * 1.3) * o.ry * W.m
        const r = o.r * (W.m / 300) * (0.8 + 0.3 * (depth + 1) / 2) * (1 + 0.15 * Math.sin(t * 3 + o.p))
        glow(ctx, W, c, x, y, r * 3.2, 0.55 * (L.a ?? 1))
        glow(ctx, W, c2, x, y, r * 1.1, 0.8 * (L.a ?? 1))
      }
      normal(ctx)
    },
  }
}

/** Anéis que se expandem (pulso). v="ground": no chão, achatados; v="seg": tracejados (supressão). */
const rings: Make = (L, W) => {
  const every = 2.6 / (L.s ?? 1)
  let clock = W.rng() * every
  const live: number[] = []
  const c = L.c ?? "#ffffff"
  return {
    kind: "rings", count: () => live.length,
    step(dt) {
      clock += dt
      if (clock >= every) { clock -= every; live.push(0) }
      for (let i = live.length - 1; i >= 0; i--) { live[i] += dt * 0.55 * (L.s ?? 1); if (live[i] >= 1) live.splice(i, 1) }
    },
    draw(ctx, side) {
      const ground = L.v === "ground"
      if ((ground ? "front" : "back") !== side) return
      ctx.strokeStyle = c
      if (L.v === "seg") ctx.setLineDash([W.m * 0.05, W.m * 0.025])
      for (const p of live) {
        const r = W.m * (0.08 + 0.55 * Math.pow(p, 0.7))
        ctx.globalAlpha = (1 - p) * (L.a ?? 0.7)
        ctx.lineWidth = Math.max(1, W.m * 0.012 * (1 - p))
        ctx.beginPath()
        if (ground) ctx.ellipse(W.cx, W.h * 0.88, r * 1.2, r * 0.28, 0, 0, TAU)
        else ctx.ellipse(W.cx, W.cy, r, r, 0, 0, TAU)
        ctx.stroke()
      }
      ctx.setLineDash([])
      normal(ctx)
    },
  }
}

/** Raios elétricos: caminhos quebrados que piscam e se refazem. */
const bolts: Make = (L, W) => {
  const c = L.c ?? "#7fe7ff", c2 = L.c2 ?? "#ffffff"
  const max = Math.max(1, Math.round(amount(L, W, 3)))
  const live: { pts: number[]; life: number; x1: number; y1: number; x2: number; y2: number; re: number }[] = []
  let next = 0.2
  const build = (b: (typeof live)[number]) => {
    const pts = [b.x1, b.y1, b.x2, b.y2]
    let rough = W.m * 0.09
    for (let lvl = 0; lvl < 4; lvl++) {
      const out: number[] = [pts[0], pts[1]]
      for (let i = 0; i < pts.length - 2; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2 + (W.rng() - 0.5) * rough, my = (pts[i + 1] + pts[i + 3]) / 2 + (W.rng() - 0.5) * rough
        out.push(mx, my, pts[i + 2], pts[i + 3])
      }
      pts.splice(0, pts.length, ...out)
      rough *= 0.55
    }
    b.pts = pts
  }
  return {
    kind: "bolts", count: () => live.length,
    step(dt) {
      next -= dt * (L.s ?? 1)
      if (next <= 0 && live.length < max) {
        const a = W.rng() * TAU, r1 = W.m * (0.12 + W.rng() * 0.2), a2 = a + (W.rng() - 0.5) * 2.2, r2 = W.m * (0.3 + W.rng() * 0.2)
        const b = { pts: [], life: 0, x1: W.cx + Math.cos(a) * r1, y1: W.cy + Math.sin(a) * r1, x2: W.cx + Math.cos(a2) * r2, y2: W.cy + Math.sin(a2) * r2 * 0.8, re: 0 }
        build(b); live.push(b)
        next = (0.25 + W.rng() * 0.7) / W.opts.intensity
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i]
        b.life += dt; b.re += dt
        if (b.re > 0.05) { b.re = 0; build(b) }
        if (b.life > 0.24) live.splice(i, 1)
      }
    },
    draw(ctx, side) {
      if (side !== "back") return
      lighter(ctx)
      ctx.lineJoin = "round"
      for (const b of live) {
        const f = 1 - b.life / 0.24
        for (const [col, wd, al] of [[c, 3.2, 0.5], [c2, 1.1, 1]] as const) {
          ctx.strokeStyle = col
          ctx.globalAlpha = f * al * (L.a ?? 1)
          ctx.lineWidth = wd * (W.m / 300)
          ctx.beginPath()
          ctx.moveTo(b.pts[0], b.pts[1])
          for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1])
          ctx.stroke()
        }
        glow(ctx, W, c, b.x2, b.y2, W.m * 0.05, f * 0.8)
      }
      normal(ctx)
    },
  }
}

/** Fumaça, névoa ou gás: manchas grandes e suaves derivando devagar. */
const smoke: Make = (L, W) => {
  const n = amount(L, W, 9)
  const c = L.c ?? "#7a4cff"
  const items = Array.from({ length: n }, () => ({ x: W.rng() * W.w, y: W.h * (0.25 + W.rng() * 0.8), r: 0.22 + W.rng() * 0.3, vx: (W.rng() - 0.5) * 10, vy: -(3 + W.rng() * 8), ph: W.rng() * TAU }))
  return {
    kind: "smoke", count: () => items.length,
    step(dt) {
      const k = (W.m / 300) * (L.s ?? 1)
      for (const it of items) {
        it.x += it.vx * dt * k; it.y += it.vy * dt * k
        const R = it.r * W.m
        if (it.y < -R) { it.y = W.h + R * 0.5; it.x = W.rng() * W.w }
        if (it.x < -R) it.x = W.w + R
        if (it.x > W.w + R) it.x = -R
      }
    },
    draw(ctx, side) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const front = i % 4 === 0
        if (front !== (side === "front")) continue
        const breath = 0.75 + 0.25 * Math.sin(W.t * 0.4 + it.ph)
        glow(ctx, W, c, it.x, it.y, it.r * W.m * breath, (L.a ?? 0.32) * (front ? 0.45 : 1), true)
      }
      normal(ctx)
    },
  }
}

/** Cristais/fragmentos girando em 3D e subindo devagar. v="hex": prismas hexagonais. */
const shards: Make = (L, W) => {
  const n = amount(L, W, 10)
  const c = L.c ?? "#7dffcf", c2 = L.c2 ?? "#ffffff"
  const items = Array.from({ length: n }, () => ({ x: W.rng() * W.w, y: W.rng() * W.h, vy: 6 + W.rng() * 12, spin: W.rng() * TAU, vs: 0.6 + W.rng() * 1.6, rot: (W.rng() - 0.5) * 0.8, size: 4 + W.rng() * 7 }))
  return {
    kind: "shards", count: () => items.length,
    step(dt) {
      for (const it of items) {
        it.y -= it.vy * dt * (W.m / 300) * (L.s ?? 1)
        it.spin += it.vs * dt * (L.s ?? 1)
        if (it.y < -20) { it.y = W.h + 10; it.x = W.rng() * W.w }
      }
    },
    draw(ctx, side) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if ((i % 3 === 0) !== (side === "front")) continue
        const s = it.size * (W.m / 300)
        const sx = Math.max(0.12, Math.abs(Math.cos(it.spin)))
        ctx.save()
        ctx.translate(it.x, it.y)
        ctx.rotate(it.rot)
        ctx.scale(sx, 1)
        ctx.globalAlpha = 0.55 * (L.a ?? 1)
        ctx.fillStyle = c
        ctx.beginPath()
        if (L.v === "hex") for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; ctx[k ? "lineTo" : "moveTo"](Math.cos(a) * s, Math.sin(a) * s) }
        else { ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 1.6); ctx.lineTo(-s * 0.7, 0) }
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 0.85 * (L.a ?? 1) * sx
        ctx.strokeStyle = c2
        ctx.lineWidth = 0.8
        ctx.stroke()
        ctx.restore()
        if (Math.cos(it.spin) > 0.97) { lighter(ctx); glow(ctx, W, c2, it.x, it.y, s * 3, 0.5); ctx.globalCompositeOperation = "source-over" }
      }
      normal(ctx)
    },
  }
}

/** Barreira de blocos que sobe do chão, segura e se desfaz (Sage). */
const barrier: Make = (L, W) => {
  const c = L.c ?? "#7dffcf"
  const k = 5
  let clock = 0
  const cycle = 6.5
  return {
    kind: "barrier", count: () => k,
    step(dt) { clock = (clock + dt * (L.s ?? 1)) % cycle },
    draw(ctx, side) {
      if (side !== "back") return
      const bw = W.w * 0.13, gap = bw * 0.08, total = k * bw + (k - 1) * gap
      for (let i = 0; i < k; i++) {
        const t0 = 0.12 * i
        const up = ease(clamp((clock - t0) / 0.9, 0, 1)), down = clamp((clock - 4.6) / 1.2, 0, 1)
        const hgt = W.h * 0.42 * up
        if (hgt < 1) continue
        const x = W.cx - total / 2 + i * (bw + gap), y = W.h - hgt
        const g = ctx.createLinearGradient(0, y, 0, W.h)
        g.addColorStop(0, c)
        g.addColorStop(1, "rgba(0,0,0,0)")
        ctx.globalAlpha = 0.28 * (1 - down) * (L.a ?? 1)
        ctx.fillStyle = g
        ctx.fillRect(x, y, bw, hgt)
        ctx.globalAlpha = 0.75 * (1 - down) * (L.a ?? 1)
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.stroke()
        ctx.globalAlpha = 0.25 * (1 - down)
        ctx.beginPath(); ctx.moveTo(x + bw * 0.3, y); ctx.lineTo(x + bw * 0.55, y + hgt * 0.5); ctx.stroke()
      }
      normal(ctx)
    },
  }
}

/** Linha de varredura (câmera de vigilância) com cantos de enquadramento piscando. */
const scan: Make = (L, W) => {
  const c = L.c ?? "#9fd8ff"
  let clock = 0
  const cycle = 4.6
  return {
    kind: "scan", count: () => 1,
    step(dt) { clock = (clock + dt * (L.s ?? 1)) % cycle },
    draw(ctx, side) {
      if (side !== "back") return
      const p = clock / 2.8
      if (p <= 1) {
        const y = W.h * ease(p)
        const g = ctx.createLinearGradient(0, y - W.h * 0.18, 0, y)
        g.addColorStop(0, "rgba(0,0,0,0)")
        g.addColorStop(1, c)
        ctx.globalAlpha = 0.16 * (L.a ?? 1)
        ctx.fillStyle = g
        ctx.fillRect(0, y - W.h * 0.18, W.w, W.h * 0.18)
        ctx.globalAlpha = 0.7 * (L.a ?? 1)
        ctx.fillStyle = c
        ctx.fillRect(0, y - 1, W.w, 1.5)
      }
      // cantos de câmera
      const blink = Math.sin(W.t * 2.4) > 0 ? 0.65 : 0.25
      const m = W.m * 0.07, pad = W.m * 0.06
      ctx.strokeStyle = c
      ctx.lineWidth = 1.5
      ctx.globalAlpha = blink * (L.a ?? 1)
      for (const [x, y, sx, sy] of [[pad, pad, 1, 1], [W.w - pad, pad, -1, 1], [pad, W.h - pad, 1, -1], [W.w - pad, W.h - pad, -1, -1]] as const) {
        ctx.beginPath(); ctx.moveTo(x, y + m * sy); ctx.lineTo(x, y); ctx.lineTo(x + m * sx, y); ctx.stroke()
      }
      normal(ctx)
    },
  }
}

/** Radar de reconhecimento girando a partir do agente, com marcações que aparecem quando a varredura passa. */
const radar: Make = (L, W) => {
  const c = L.c ?? "#5fb6ff"
  let a = 0
  const pings = Array.from({ length: 5 }, () => ({ ang: W.rng() * TAU, r: 0.2 + W.rng() * 0.3, life: 1 }))
  return {
    kind: "radar", count: () => pings.length,
    step(dt) {
      const prev = a
      a = (a + dt * 1.6 * (L.s ?? 1)) % TAU
      for (const p of pings) {
        p.life = Math.min(1, p.life + dt * 0.9)
        const crossed = prev <= a ? p.ang > prev && p.ang <= a : p.ang > prev || p.ang <= a
        if (crossed) p.life = 0
      }
    },
    draw(ctx, side) {
      if (side !== "back") return
      const R = W.m * 0.55
      ctx.fillStyle = c
      for (let k = 0; k < 10; k++) {
        ctx.globalAlpha = 0.045 * (1 - k / 10) * (L.a ?? 1)
        ctx.beginPath(); ctx.moveTo(W.cx, W.cy); ctx.arc(W.cx, W.cy, R, a - (k + 1) * 0.07, a - k * 0.07); ctx.closePath(); ctx.fill()
      }
      ctx.strokeStyle = c
      ctx.globalAlpha = 0.18 * (L.a ?? 1)
      ctx.lineWidth = 1
      for (const r of [0.33, 0.55]) { ctx.beginPath(); ctx.arc(W.cx, W.cy, W.m * r, 0, TAU); ctx.stroke() }
      lighter(ctx)
      for (const p of pings) {
        if (p.life >= 1) continue
        const x = W.cx + Math.cos(p.ang) * W.m * p.r, y = W.cy + Math.sin(p.ang) * W.m * p.r
        glow(ctx, W, c, x, y, W.m * 0.04, (1 - p.life) * 0.9)
        ctx.globalAlpha = (1 - p.life) * 0.7
        ctx.beginPath(); ctx.arc(x, y, W.m * 0.03 * (1 + p.life * 1.5), 0, TAU); ctx.stroke()
      }
      normal(ctx)
    },
  }
}

/** Trilhas de circuito com pulsos correndo por elas. v="glitch": blocos de holograma piscando. */
const circuit: Make = (L, W) => {
  const c = L.c ?? "#ffd23f"
  const n = amount(L, W, 7)
  const traces = Array.from({ length: n }, () => {
    const pts: number[] = []
    let x = W.rng() < 0.5 ? 0 : W.w, y = W.rng() * W.h
    pts.push(x, y)
    for (let k = 0; k < 4; k++) {
      if (k % 2 === 0) x = clamp(x + (W.w / 2 - x) * (0.3 + W.rng() * 0.4), 0, W.w)
      else y = clamp(y + (W.rng() - 0.5) * W.h * 0.4, 0, W.h)
      pts.push(x, y)
    }
    let len = 0
    for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
    return { pts, len, pos: W.rng(), sp: 0.12 + W.rng() * 0.2 }
  })
  const at = (tr: (typeof traces)[number], f: number) => {
    let d = f * tr.len
    for (let i = 2; i < tr.pts.length; i += 2) {
      const sl = Math.hypot(tr.pts[i] - tr.pts[i - 2], tr.pts[i + 1] - tr.pts[i - 1])
      if (d <= sl) { const k = sl ? d / sl : 0; return [tr.pts[i - 2] + (tr.pts[i] - tr.pts[i - 2]) * k, tr.pts[i - 1] + (tr.pts[i + 1] - tr.pts[i - 1]) * k] }
      d -= sl
    }
    return [tr.pts[tr.pts.length - 2], tr.pts[tr.pts.length - 1]]
  }
  return {
    kind: "circuit", count: () => traces.length,
    step(dt) { for (const tr of traces) tr.pos = (tr.pos + dt * tr.sp * (L.s ?? 1)) % 1 },
    draw(ctx, side) {
      if (side !== "back") return
      ctx.strokeStyle = c
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.14 * (L.a ?? 1)
      for (const tr of traces) {
        ctx.beginPath(); ctx.moveTo(tr.pts[0], tr.pts[1])
        for (let i = 2; i < tr.pts.length; i += 2) ctx.lineTo(tr.pts[i], tr.pts[i + 1])
        ctx.stroke()
      }
      lighter(ctx)
      for (const tr of traces) {
        for (let k = 0; k < 4; k++) {
          const [x, y] = at(tr, Math.max(0, tr.pos - k * 0.015))
          glow(ctx, W, c, x, y, W.m * 0.025 * (1 - k * 0.2), 0.8 * (1 - k * 0.25) * (L.a ?? 1))
        }
      }
      if (L.v === "glitch") {
        ctx.globalCompositeOperation = "source-over"
        ctx.fillStyle = c
        const slot = Math.floor(W.t * 7)
        const r = rngFrom(slot + 7)
        for (let k = 0; k < 3; k++) { ctx.globalAlpha = 0.1 * (L.a ?? 1); ctx.fillRect(r() * W.w, r() * W.h, W.w * (0.05 + r() * 0.2), 2 + r() * 4) }
      }
      normal(ctx)
    },
  }
}

/** Mira orbital no chão, que se fecha; depois um feixe desce do alto e impacta (Brimstone). */
const orbital: Make = (L, W) => {
  const c = L.c ?? "#ff8a3d", c2 = L.c2 ?? "#ffe0b0"
  let clock = 0, tx = W.w * 0.5
  const cycle = 5.2
  return {
    kind: "orbital", count: () => 1,
    step(dt) { const prev = clock; clock = (clock + dt * (L.s ?? 1)) % cycle; if (clock < prev) tx = W.w * (0.3 + W.rng() * 0.4) },
    draw(ctx, side) {
      // o alvo fica acima do nome (na altura dos pés do agente), para não sumir atrás do texto
      const ty = W.h * 0.68
      if (side === "front" && clock < 3.1) {
        const p = clamp(clock / 2.4, 0, 1)
        const r = W.m * (0.34 - 0.16 * ease(p))
        ctx.strokeStyle = c
        ctx.lineWidth = 1.5
        ctx.globalAlpha = (0.5 + 0.45 * p) * (L.a ?? 1)
        ctx.lineWidth = Math.max(1.5, W.m * 0.007)
        ctx.setLineDash([W.m * 0.03, W.m * 0.02])
        ctx.lineDashOffset = -clock * 30
        ctx.beginPath(); ctx.ellipse(tx, ty, r, r * 0.3, 0, 0, TAU); ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath(); ctx.ellipse(tx, ty, r * 0.55, r * 0.55 * 0.3, 0, 0, TAU); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(tx - r * 1.1, ty); ctx.lineTo(tx - r * 0.7, ty); ctx.moveTo(tx + r * 0.7, ty); ctx.lineTo(tx + r * 1.1, ty); ctx.stroke()
      }
      if (L.loud === false || W.opts.intensity < 0.5) { normal(ctx); return }
      if (side === "back" && clock >= 2.4 && clock < 3.6) {
        const p = (clock - 2.4) / 1.2
        const wd = W.m * 0.09 * Math.sin(Math.PI * p)
        lighter(ctx)
        const g = ctx.createLinearGradient(0, 0, 0, ty)
        g.addColorStop(0, "rgba(0,0,0,0)")
        g.addColorStop(1, c2)
        ctx.fillStyle = g
        ctx.globalAlpha = 0.95 * (L.a ?? 1)
        ctx.fillRect(tx - wd / 2, 0, wd, ty)
        ctx.fillRect(tx - wd / 6, 0, wd / 3, ty)
        glow(ctx, W, c, tx, ty, W.m * 0.36 * Math.sin(Math.PI * p), 0.95)
      }
      normal(ctx)
    },
  }
}

/** Disparos horizontais que carregam e cruzam o widget (Fúria do Caçador). */
const beams: Make = (L, W) => {
  const c = L.c ?? "#7cc3ff", c2 = L.c2 ?? "#ffffff"
  let clock = 0
  const cycle = 4.6
  const ys = [0.34, 0.5, 0.42].map((v) => v + (W.rng() - 0.5) * 0.08)
  return {
    kind: "beams", count: () => 3,
    step(dt) { clock = (clock + dt * (L.s ?? 1)) % cycle },
    draw(ctx, side) {
      if (side !== "back") return
      lighter(ctx)
      for (let i = 0; i < 3; i++) {
        const t0 = 0.3 + i * 1.05, local = clock - t0
        if (local < 0 || local > 1.2) continue
        const y = W.h * ys[i], slope = (i - 1) * 0.06 * W.h
        const charge = clamp(local / 0.45, 0, 1), fire = clamp((local - 0.45) / 0.75, 0, 1)
        ctx.strokeStyle = local < 0.45 ? c : c2
        ctx.lineWidth = local < 0.45 ? 1 : W.m * 0.03 * (1 - fire)
        ctx.globalAlpha = (local < 0.45 ? 0.55 * charge : 1 - fire) * (L.a ?? 1)
        ctx.beginPath(); ctx.moveTo(0, y - slope); ctx.lineTo(W.w, y + slope); ctx.stroke()
        if (local >= 0.45) glow(ctx, W, c, W.w * (0.2 + fire * 0.6), y + slope * (fire * 1.2 - 0.6), W.m * 0.12, 0.7 * (1 - fire))
      }
      normal(ctx)
    },
  }
}

/** Ícones oficiais das habilidades flutuando (usado para criaturas e para agentes novos). */
const icons: Make = (L, W) => {
  const urls = W.icons.length ? W.icons : []
  const n = Math.min(urls.length, Math.max(1, L.n ?? urls.length))
  const c = L.c ?? "#ffffff"
  const items = Array.from({ length: n }, (_, i) => ({ url: urls[i % urls.length], a: (i * TAU) / n + W.rng(), r: 0.33 + W.rng() * 0.08, bob: W.rng() * TAU }))
  return {
    kind: "icons", count: () => items.length,
    step(dt) { for (const it of items) it.a += dt * 0.32 * (L.s ?? 1) },
    draw(ctx, side) {
      for (const it of items) {
        const depth = Math.sin(it.a)
        if ((depth >= 0) !== (side === "front")) continue
        const img = W.env.image(it.url)
        const x = W.cx + Math.cos(it.a) * W.m * it.r, y = W.cy + depth * W.m * it.r * 0.3 + Math.sin(W.t * 1.4 + it.bob) * W.m * 0.03
        const s = W.m * 0.12 * (0.8 + 0.25 * (depth + 1) / 2)
        lighter(ctx)
        glow(ctx, W, c, x, y, s * 1.2, 0.45 * (L.a ?? 1))
        ctx.globalCompositeOperation = "source-over"
        if (img) { ctx.globalAlpha = (0.55 + 0.4 * (depth + 1) / 2) * (L.a ?? 1); ctx.drawImage(img, x - s / 2, y - s / 2, s, s) }
      }
      normal(ctx)
    },
  }
}

/** Rasgos dimensionais que se abrem e fecham, puxando partículas (Yoru). */
const rifts: Make = (L, W) => {
  const c = L.c ?? "#4f7bff"
  const n = Math.max(1, Math.min(4, amount(L, W, 3)))
  const items = Array.from({ length: n }, (_, i) => ({ x: 0, y: 0, t: -i * 1.4, len: 3 + W.rng() * 1.5 }))
  const place = (it: (typeof items)[number]) => { it.x = W.w * (0.15 + W.rng() * 0.7); it.y = W.h * (0.2 + W.rng() * 0.45) }
  items.forEach(place)
  return {
    kind: "rifts", count: () => items.length,
    step(dt) { for (const it of items) { it.t += dt * (L.s ?? 1); if (it.t > it.len) { it.t = -W.rng() * 1.2; place(it) } } },
    draw(ctx, side) {
      if (side !== "back") return
      for (const it of items) {
        if (it.t < 0) continue
        const open = it.t < 0.8 ? ease(it.t / 0.8) : it.t > it.len - 0.5 ? ease((it.len - it.t) / 0.5) : 1
        const hh = W.m * 0.2, ww = W.m * 0.05 * open
        ctx.globalAlpha = 0.85 * open * (L.a ?? 1)
        ctx.fillStyle = "#050816"
        ctx.beginPath()
        ctx.moveTo(it.x, it.y - hh); ctx.quadraticCurveTo(it.x + ww, it.y, it.x, it.y + hh); ctx.quadraticCurveTo(it.x - ww, it.y, it.x, it.y - hh)
        ctx.fill()
        ctx.strokeStyle = c
        ctx.lineWidth = 1.6
        ctx.stroke()
        lighter(ctx)
        glow(ctx, W, c, it.x, it.y, hh * 0.9, 0.35 * open)
        for (let k = 0; k < 5; k++) {
          const f = ((W.t * 0.8 + k / 5) % 1)
          const a = k * 1.3 + it.x
          glow(ctx, W, c, it.x + Math.cos(a) * W.m * 0.15 * (1 - f), it.y + Math.sin(a) * W.m * 0.12 * (1 - f), W.m * 0.012, open * f * 0.8)
        }
        ctx.globalCompositeOperation = "source-over"
      }
      normal(ctx)
    },
  }
}

/** Ondas de água na base e uma parede líquida que atravessa o widget (Harbor). */
const waves: Make = (L, W) => {
  const c = L.c ?? "#3fd0c9", c2 = L.c2 ?? "#bff7ff"
  let t = 0
  return {
    kind: "waves", count: () => 3,
    step(dt) { t += dt * (L.s ?? 1) },
    draw(ctx, side) {
      if (side === "front") {
        for (let k = 0; k < 3; k++) {
          const base = W.h * (0.9 - k * 0.035), amp = W.m * (0.025 + k * 0.01)
          ctx.fillStyle = k === 2 ? c2 : c
          ctx.globalAlpha = (0.22 - k * 0.04) * (L.a ?? 1)
          ctx.beginPath(); ctx.moveTo(0, W.h)
          for (let x = 0; x <= W.w; x += Math.max(6, W.w / 40)) ctx.lineTo(x, base + Math.sin(x / (W.m * 0.12) + t * (1.4 + k * 0.5)) * amp)
          ctx.lineTo(W.w, W.h); ctx.closePath(); ctx.fill()
        }
      } else {
        const cycle = 7, p = (t % cycle) / cycle
        if (p < 0.5) {
          const x = -W.w * 0.2 + p * 2 * W.w * 1.4
          const g = ctx.createLinearGradient(x - W.w * 0.12, 0, x, 0)
          g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, c)
          ctx.fillStyle = g
          ctx.globalAlpha = 0.28 * (L.a ?? 1)
          ctx.beginPath(); ctx.moveTo(x - W.w * 0.12, W.h)
          for (let y = W.h; y >= 0; y -= Math.max(6, W.h / 30)) ctx.lineTo(x + Math.sin(y / (W.m * 0.09) + t * 3) * W.m * 0.02, y)
          ctx.lineTo(x - W.w * 0.12, 0); ctx.closePath(); ctx.fill()
        }
      }
      normal(ctx)
    },
  }
}

/** Malha de fios ao redor do agente, girando em 3D, com um pulso correndo (Deadlock). */
const wires: Make = (L, W) => {
  const c = L.c ?? "#9bb6ff"
  const lat = 4, lon = 8
  let rot = 0
  return {
    kind: "wires", count: () => lat * lon,
    step(dt) { rot += dt * 0.35 * (L.s ?? 1) },
    draw(ctx, side) {
      const R = W.m * 0.4
      const P = (i: number, j: number) => {
        const th = ((i + 0.5) / lat) * Math.PI - Math.PI / 2, ph = (j / lon) * TAU + rot
        const x = Math.cos(th) * Math.cos(ph), y = Math.sin(th), z = Math.cos(th) * Math.sin(ph)
        return [W.cx + x * R, W.cy + y * R * 0.95, z] as const
      }
      ctx.strokeStyle = c
      ctx.lineWidth = 1
      for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
        const a = P(i, j), b = P(i, (j + 1) % lon), d = i + 1 < lat ? P(i + 1, j) : null
        for (const e of d ? [b, d] : [b]) {
          const z = (a[2] + e[2]) / 2
          if ((z >= 0) !== (side === "front")) continue
          const pulse = Math.max(0, Math.cos(j * 0.8 - W.t * 2.2))
          ctx.globalAlpha = (0.12 + 0.25 * (z + 1) / 2 + pulse * 0.25) * (L.a ?? 1) * (side === "front" ? 0.6 : 1)
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke()
        }
      }
      normal(ctx)
    },
  }
}

/** Placas hexagonais translúcidas com bordas prismáticas (escudo); v="streak": rastros de luz refratada. */
const prism: Make = (L, W) => {
  const c = L.c ?? "#a98bff", c2 = L.c2 ?? "#6ff3ff"
  const n = amount(L, W, L.v === "streak" ? 6 : 5)
  const items = Array.from({ length: n }, (_, i) => ({ a: (i * TAU) / n, r: 0.32 + W.rng() * 0.1, s: 0.045 + W.rng() * 0.035, y: W.rng(), sp: 0.6 + W.rng() * 0.9 }))
  return {
    kind: "prism", count: () => items.length,
    step(dt) { for (const it of items) { it.a += dt * 0.25 * (L.s ?? 1); it.y = (it.y + dt * it.sp * 0.5 * (L.s ?? 1)) % 1.4 } },
    draw(ctx, side) {
      if (L.v === "streak") {
        if (side !== "back") return
        lighter(ctx)
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const x = W.w * (it.y - 0.2), y = W.h * (0.15 + (i / items.length) * 0.7)
          for (const [col, off] of [[c, -2], [c2, 2], ["#ffffff", 0]] as const) {
            ctx.strokeStyle = col
            ctx.globalAlpha = 0.35 * (L.a ?? 1)
            ctx.lineWidth = 1.4
            ctx.beginPath(); ctx.moveTo(x - W.w * 0.28, y + W.h * 0.12 + off); ctx.lineTo(x, y + off); ctx.stroke()
          }
        }
        normal(ctx)
        return
      }
      for (const it of items) {
        const depth = Math.sin(it.a)
        if ((depth >= 0) !== (side === "front")) continue
        const x = W.cx + Math.cos(it.a) * W.m * it.r, y = W.cy + depth * W.m * it.r * 0.25
        const s = W.m * it.s
        const hex = (dx: number) => { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6 + Math.PI / 6; ctx[k ? "lineTo" : "moveTo"](x + dx + Math.cos(a) * s, y + Math.sin(a) * s) } ctx.closePath() }
        ctx.globalAlpha = 0.1 * (L.a ?? 1); ctx.fillStyle = c; hex(0); ctx.fill()
        ctx.lineWidth = 1.2
        for (const [col, dx] of [[c, -1.2], [c2, 1.2], ["#ffffff", 0]] as const) { ctx.strokeStyle = col; ctx.globalAlpha = (col === "#ffffff" ? 0.5 : 0.7) * (L.a ?? 1); hex(dx); ctx.stroke() }
      }
      normal(ctx)
    },
  }
}

/** Linhas de velocidade. v="up": sobem; senão cruzam na horizontal. */
const streaks: Make = (L, W) => {
  const n = amount(L, W, 9)
  const c = L.c ?? "#7fe7ff"
  const up = L.v === "up"
  const items = Array.from({ length: n }, () => ({ p: W.rng(), lane: W.rng(), len: 0.12 + W.rng() * 0.25, sp: 0.6 + W.rng() * 0.9 }))
  return {
    kind: "streaks", count: () => items.length,
    step(dt) { for (const it of items) { it.p += dt * it.sp * (L.s ?? 1); if (it.p > 1.3) { it.p = -0.3; it.lane = W.rng() } } },
    draw(ctx, side) {
      ctx.lineCap = "round"
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if ((i % 4 === 0) !== (side === "front")) continue
        const len = (up ? W.h : W.w) * it.len
        const x1 = up ? W.w * it.lane : (up ? 0 : W.w * it.p), y1 = up ? W.h * (1 - it.p) : W.h * (0.15 + it.lane * 0.7)
        const x2 = up ? x1 : x1 - len, y2 = up ? y1 + len : y1
        const g = ctx.createLinearGradient(x2, y2, x1, y1)
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, c)
        ctx.strokeStyle = g
        ctx.globalAlpha = (L.a ?? 0.55) * (side === "front" ? 0.5 : 1)
        ctx.lineWidth = W.m * 0.006
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.stroke()
      }
      normal(ctx)
    },
  }
}

/** Espinhos metálicos que brotam do chão em sequência e recolhem (Vyse). */
const spikes: Make = (L, W) => {
  const c = L.c ?? "#d8d2ff", c2 = L.c2 ?? "#4b3a7a"
  const k = 9
  let clock = 0
  const cycle = 5.5
  const hs = Array.from({ length: k }, () => 0.6 + W.rng() * 0.4)
  return {
    kind: "spikes", count: () => k,
    step(dt) { clock = (clock + dt * (L.s ?? 1)) % cycle },
    draw(ctx, side) {
      if (side !== "front") return
      for (let i = 0; i < k; i++) {
        const t0 = Math.abs(i - (k - 1) / 2) * 0.12
        const up = ease(clamp((clock - t0) / 0.5, 0, 1)) * (1 - ease(clamp((clock - 3.8) / 0.8, 0, 1)))
        if (up <= 0.01) continue
        const bw = W.w / k, x = i * bw + bw / 2, hgt = W.h * 0.24 * hs[i] * up
        const g = ctx.createLinearGradient(x - bw * 0.25, 0, x + bw * 0.25, 0)
        g.addColorStop(0, c2); g.addColorStop(0.5, c); g.addColorStop(1, c2)
        ctx.globalAlpha = 0.85 * (L.a ?? 1)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.moveTo(x - bw * 0.22, W.h); ctx.lineTo(x, W.h - hgt); ctx.lineTo(x + bw * 0.22, W.h); ctx.closePath(); ctx.fill()
        if (up > 0.95 && Math.sin(W.t * 3 + i) > 0.92) { lighter(ctx); glow(ctx, W, "#ffffff", x, W.h - hgt, W.m * 0.03, 0.8); ctx.globalCompositeOperation = "source-over" }
      }
      normal(ctx)
    },
  }
}

/** Salva de foguetes em arco, com rastro e impacto (Tejo; Raze usa um só). */
const rockets: Make = (L, W) => {
  const c = L.c ?? "#ffb070", c2 = L.c2 ?? "#ffffff"
  const n = L.n ?? 5
  let clock = 0
  const cycle = 4.8
  const tgt = Array.from({ length: n }, () => W.rng())
  const pos = (i: number, f: number) => {
    const sx = L.v === "single" ? -W.w * 0.1 : W.w * (0.05 + i * 0.03), sy = L.v === "single" ? W.h * 0.35 : -W.h * 0.1
    const ex = L.v === "single" ? W.w * 1.1 : W.w * (0.2 + tgt[i] * 0.6), ey = L.v === "single" ? W.h * 0.42 : W.h * 0.85
    const qx = (sx + ex) / 2 + (L.v === "single" ? 0 : W.w * 0.2), qy = Math.min(sy, ey) - W.h * 0.25
    const u = 1 - f
    return [u * u * sx + 2 * u * f * qx + f * f * ex, u * u * sy + 2 * u * f * qy + f * f * ey]
  }
  return {
    kind: "rockets", count: () => n,
    step(dt) { const prev = clock; clock = (clock + dt * (L.s ?? 1)) % cycle; if (clock < prev) for (let i = 0; i < n; i++) tgt[i] = W.rng() },
    draw(ctx, side) {
      if (side !== "back") return
      lighter(ctx)
      for (let i = 0; i < n; i++) {
        const local = clock - i * 0.2
        const f = local / 1.1
        if (f < 0 || f > 1.5) continue
        if (f <= 1) {
          const steps = W.opts.eco ? 4 : 10
          ctx.globalCompositeOperation = "source-over"
          for (let k = steps; k >= 1; k--) {
            const [x, y] = pos(i, Math.max(0, f - k * 0.028))
            glow(ctx, W, "#5a4a42", x, y, W.m * (0.012 + k * 0.004), (1 - k / steps) * 0.5 * (L.a ?? 1), true)
          }
          lighter(ctx)
          const [x, y] = pos(i, f)
          glow(ctx, W, c, x, y, W.m * 0.05, 0.9 * (L.a ?? 1))
          glow(ctx, W, c2, x, y, W.m * 0.018, 1)
        } else if (L.loud !== false) {
          const p = (f - 1) / 0.5
          const [x, y] = pos(i, 1)
          glow(ctx, W, c, x, y, W.m * 0.12 * (0.5 + p), (1 - p) * 0.8)
          ctx.strokeStyle = c; ctx.globalAlpha = (1 - p) * 0.6; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.ellipse(x, y, W.m * 0.12 * p, W.m * 0.04 * p, 0, 0, TAU); ctx.stroke()
        }
      }
      normal(ctx)
    },
  }
}

/** Olhos espectrais que surgem na névoa, piscam e somem (Fade). Formas simples, não um personagem. */
const eyes: Make = (L, W) => {
  const c = L.c ?? "#7fa2ff"
  const n = Math.max(1, Math.min(5, amount(L, W, 3)))
  const items = Array.from({ length: n }, (_, i) => ({ x: 0, y: 0, t: -i * 1.1, len: 3.2 + W.rng() * 1.4, s: 0.5 + W.rng() * 0.4 }))
  const place = (it: (typeof items)[number]) => { const left = W.rng() < 0.5; it.x = W.w * (left ? 0.08 + W.rng() * 0.22 : 0.7 + W.rng() * 0.22); it.y = W.h * (0.15 + W.rng() * 0.45) }
  items.forEach(place)
  return {
    kind: "eyes", count: () => items.length,
    step(dt) { for (const it of items) { it.t += dt * (L.s ?? 1); if (it.t > it.len) { it.t = -W.rng() * 1.5; place(it) } } },
    draw(ctx, side) {
      if (side !== "back") return
      for (const it of items) {
        if (it.t < 0) continue
        const vis = it.t < 0.6 ? it.t / 0.6 : it.t > it.len - 0.6 ? (it.len - it.t) / 0.6 : 1
        const blinkAt = it.len * 0.55, b = Math.abs(it.t - blinkAt) < 0.12 ? Math.abs(it.t - blinkAt) / 0.12 : 1
        const ww = W.m * 0.07 * it.s, hh = ww * 0.38 * Math.max(0.06, b)
        ctx.globalAlpha = 0.8 * vis * (L.a ?? 1)
        ctx.fillStyle = "#04060f"
        ctx.beginPath(); ctx.moveTo(it.x - ww, it.y); ctx.quadraticCurveTo(it.x, it.y - hh * 2, it.x + ww, it.y); ctx.quadraticCurveTo(it.x, it.y + hh * 2, it.x - ww, it.y); ctx.fill()
        ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.stroke()
        lighter(ctx)
        const look = (W.cx - it.x) / W.w * ww * 0.6
        glow(ctx, W, c, it.x + look, it.y, hh * 1.6, vis * 0.9)
        ctx.globalCompositeOperation = "source-over"
      }
      normal(ctx)
    },
  }
}

/** Estrelas cintilando, com linhas finas de constelação (Astra). */
const stars: Make = (L, W) => {
  const c = L.c ?? "#d9b8ff"
  const n = amount(L, W, 16)
  const items = Array.from({ length: n }, () => ({ x: W.rng(), y: W.rng() * 0.8, s: 2 + W.rng() * 3, ph: W.rng() * TAU, f: 0.8 + W.rng() * 1.6 }))
  return {
    kind: "stars", count: () => items.length,
    step() {},
    draw(ctx, side) {
      if (side !== "back") return
      ctx.strokeStyle = c
      ctx.lineWidth = 0.8
      ctx.globalAlpha = 0.14 * (L.a ?? 1)
      ctx.beginPath()
      for (let i = 0; i + 1 < Math.min(6, items.length); i++) { ctx.moveTo(items[i].x * W.w, items[i].y * W.h); ctx.lineTo(items[i + 1].x * W.w, items[i + 1].y * W.h) }
      ctx.stroke()
      lighter(ctx)
      for (const st of items) {
        const tw = 0.4 + 0.6 * Math.max(0, Math.sin(W.t * st.f * (L.s ?? 1) + st.ph))
        const x = st.x * W.w, y = st.y * W.h, s = st.s * (W.m / 300) * (0.6 + tw * 0.6)
        glow(ctx, W, c, x, y, s * 3, tw * 0.7 * (L.a ?? 1))
        ctx.fillStyle = "#ffffff"; ctx.globalAlpha = tw * (L.a ?? 1)
        ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.35, y); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.35, y); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(x - s * 2, y); ctx.lineTo(x, y + s * 0.35); ctx.lineTo(x + s * 2, y); ctx.lineTo(x, y - s * 0.35); ctx.closePath(); ctx.fill()
      }
      normal(ctx)
    },
  }
}

/** Linha cósmica vertical que divide o fundo e brilha (Divisa Cósmica). */
const cosmic: Make = (L, W) => {
  const c = L.c ?? "#c58bff"
  let t = 0, x = 0.62
  const cycle = 6.5
  return {
    kind: "cosmic", count: () => 1,
    step(dt) { const prev = t % cycle; t += dt * (L.s ?? 1); if (t % cycle < prev) x = 0.25 + W.rng() * 0.5 },
    draw(ctx, side) {
      if (side !== "back") return
      const p = (t % cycle) / cycle
      const grow = ease(clamp(p / 0.15, 0, 1)), fade = 1 - ease(clamp((p - 0.6) / 0.3, 0, 1))
      if (fade <= 0) return
      const X = W.w * x, half = (W.h / 2) * grow
      lighter(ctx)
      for (const [wd, al] of [[W.m * 0.09, 0.18], [W.m * 0.02, 0.6], [1.5, 1]] as const) {
        const g = ctx.createLinearGradient(0, W.h / 2 - half, 0, W.h / 2 + half)
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, c); g.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = g
        ctx.globalAlpha = al * fade * (L.a ?? 1)
        ctx.fillRect(X - wd / 2, W.h / 2 - half, wd, half * 2)
      }
      normal(ctx)
    },
  }
}

/** Reflexo de luz em diagonal atravessando o widget (brilho dourado). */
const sheen: Make = (L, W) => {
  const c = L.c ?? "#ffd77a"
  let t = 0
  const cycle = 4.4
  return {
    kind: "sheen", count: () => 1,
    step(dt) { t = (t + dt * (L.s ?? 1)) % cycle },
    draw(ctx, side) {
      if (side !== "front") return
      const p = t / 1.4
      if (p > 1) return
      const x = -W.w * 0.4 + p * W.w * 1.8
      const g = ctx.createLinearGradient(x - W.w * 0.15, 0, x + W.w * 0.15, 0)
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, c); g.addColorStop(1, "rgba(0,0,0,0)")
      lighter(ctx)
      ctx.save()
      ctx.translate(x, W.h / 2); ctx.transform(1, 0, -0.45, 1, 0, 0); ctx.translate(-x, -W.h / 2)
      ctx.fillStyle = g
      ctx.globalAlpha = 0.16 * (L.a ?? 1)
      ctx.fillRect(x - W.w * 0.15, 0, W.w * 0.3, W.h)
      ctx.restore()
      normal(ctx)
    },
  }
}

/** Retícula de luneta que surge, mira e dispara um traço (Tour de Force). */
const reticle: Make = (L, W) => {
  const c = L.c ?? "#ffd77a"
  let t = 0, x = 0.3, y = 0.35
  const cycle = 5
  return {
    kind: "reticle", count: () => 1,
    step(dt) { const prev = t; t = (t + dt * (L.s ?? 1)) % cycle; if (t < prev) { x = 0.2 + W.rng() * 0.6; y = 0.2 + W.rng() * 0.4 } },
    draw(ctx, side) {
      if (side !== "back" || t > 2.6) return
      const show = t < 0.4 ? t / 0.4 : t > 2.2 ? (2.6 - t) / 0.4 : 1
      const X = W.w * x, Y = W.h * y, r = W.m * (0.13 - 0.03 * ease(clamp(t / 1.6, 0, 1)))
      ctx.strokeStyle = c; ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.6 * show * (L.a ?? 1)
      ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(X - r * 1.3, Y); ctx.lineTo(X - r * 0.35, Y); ctx.moveTo(X + r * 0.35, Y); ctx.lineTo(X + r * 1.3, Y)
      ctx.moveTo(X, Y - r * 1.3); ctx.lineTo(X, Y - r * 0.35); ctx.moveTo(X, Y + r * 0.35); ctx.lineTo(X, Y + r * 1.3); ctx.stroke()
      if (t > 1.6 && t < 1.9 && L.loud !== false) {
        const f = (t - 1.6) / 0.3
        lighter(ctx)
        ctx.globalAlpha = (1 - f) * (L.a ?? 1); ctx.lineWidth = 2.2
        ctx.beginPath(); ctx.moveTo(W.w, Y + W.h * 0.1); ctx.lineTo(X, Y); ctx.stroke()
        glow(ctx, W, c, X, Y, W.m * 0.1, 1 - f)
      }
      normal(ctx)
    },
  }
}

/** Bolhas de gás subindo e balançando. */
const bubbles: Make = (L, W) => {
  const n = amount(L, W, 12)
  const c = L.c ?? "#7dff8f"
  const items = Array.from({ length: n }, () => ({ x: W.rng(), y: W.rng(), r: 2 + W.rng() * 4, sp: 0.06 + W.rng() * 0.1, ph: W.rng() * TAU }))
  return {
    kind: "bubbles", count: () => items.length,
    step(dt) { for (const b of items) { b.y -= dt * b.sp * (L.s ?? 1); if (b.y < -0.05) { b.y = 1.05; b.x = W.rng() } } },
    draw(ctx, side) {
      ctx.strokeStyle = c
      ctx.lineWidth = 1
      for (let i = 0; i < items.length; i++) {
        if ((i % 3 === 0) !== (side === "front")) continue
        const b = items[i]
        ctx.globalAlpha = 0.45 * (L.a ?? 1) * Math.min(1, b.y * 3)
        ctx.beginPath(); ctx.arc(b.x * W.w + Math.sin(W.t * 2 + b.ph) * 4, b.y * W.h, b.r * (W.m / 300), 0, TAU); ctx.stroke()
      }
      normal(ctx)
    },
  }
}

/** Falha no chão que se propaga, brilha e solta poeira (onda sísmica). */
const crack: Make = (L, W) => {
  const c = L.c ?? "#ff8a2a"
  let t = 0
  const cycle = 4.6
  let pts: number[] = []
  const build = () => {
    pts = []
    const y0 = W.h * 0.86
    for (let i = 0; i <= 14; i++) pts.push((i / 14) * W.w, y0 + (W.rng() - 0.5) * W.h * 0.05)
  }
  build()
  return {
    kind: "crack", count: () => pts.length / 2,
    step(dt) { const prev = t; t = (t + dt * (L.s ?? 1)) % cycle; if (t < prev) build() },
    draw(ctx, side) {
      if (side !== "front") return
      const grow = clamp(t / 1.1, 0, 1), fade = 1 - clamp((t - 2.6) / 1.2, 0, 1)
      if (fade <= 0) return
      const upto = Math.max(2, Math.floor((pts.length / 2) * grow)) * 2
      lighter(ctx)
      for (const [wd, al] of [[W.m * 0.02, 0.35], [1.6, 1]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.globalAlpha = al * fade * (L.a ?? 1)
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i < upto; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.stroke()
      }
      if (L.loud !== false) {
        for (let k = 0; k < 6; k++) {
          const f = ((t * 1.3 + k / 6) % 1)
          glow(ctx, W, c, pts[(k * 4) % pts.length] ?? 0, (pts[((k * 4) % pts.length) + 1] ?? 0) - f * W.h * 0.12, W.m * 0.015, (1 - f) * fade * 0.8)
        }
      }
      normal(ctx)
    },
  }
}

/** Explosões em pontos aleatórios: clarão, anel e fumaça (Raze). */
const blasts: Make = (L, W) => {
  const c = L.c ?? "#ff9a3c", c2 = L.c2 ?? "#ffe08a"
  const live: { x: number; y: number; t: number }[] = []
  let next = 0.6
  return {
    kind: "blasts", count: () => live.length,
    step(dt) {
      next -= dt * (L.s ?? 1)
      if (next <= 0) { live.push({ x: W.w * (0.15 + W.rng() * 0.7), y: W.h * (0.2 + W.rng() * 0.55), t: 0 }); next = (1 + W.rng() * 1.4) / W.opts.intensity }
      for (let i = live.length - 1; i >= 0; i--) { live[i].t += dt; if (live[i].t > 1.4) live.splice(i, 1) }
    },
    draw(ctx, side) {
      if (side !== "back") return
      for (const b of live) {
        const p = b.t / 1.4
        glow(ctx, W, "#3a2a22", b.x, b.y - p * W.m * 0.08, W.m * (0.08 + p * 0.18), (1 - p) * 0.45, true)
        lighter(ctx)
        if (b.t < 0.35) glow(ctx, W, c2, b.x, b.y, W.m * 0.16 * (b.t / 0.35 + 0.3), (1 - b.t / 0.35) * (L.a ?? 1))
        ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.globalAlpha = (1 - p) * 0.6 * (L.a ?? 1)
        ctx.beginPath(); ctx.arc(b.x, b.y, W.m * 0.2 * Math.sqrt(p), 0, TAU); ctx.stroke()
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + b.x
          glow(ctx, W, c, b.x + Math.cos(a) * W.m * 0.2 * p, b.y + Math.sin(a) * W.m * 0.2 * p + p * p * W.m * 0.1, W.m * 0.012, (1 - p) * 0.9)
        }
        ctx.globalCompositeOperation = "source-over"
      }
      normal(ctx)
    },
  }
}

/** Fios de fumaça/energia que sobem enrolando. */
const wisps: Make = (L, W) => {
  const n = amount(L, W, 6)
  const c = L.c ?? "#d58cff"
  const items = Array.from({ length: n }, () => ({ x: W.rng(), p: W.rng(), sp: 0.08 + W.rng() * 0.12, amp: 0.02 + W.rng() * 0.04, ph: W.rng() * TAU }))
  return {
    kind: "wisps", count: () => items.length,
    step(dt) { for (const it of items) { it.p += dt * it.sp * (L.s ?? 1); if (it.p > 1.3) { it.p = -0.1; it.x = W.rng() } } },
    draw(ctx, side) {
      if (side !== "back") return
      ctx.strokeStyle = c
      ctx.lineCap = "round"
      for (const it of items) {
        const seg = 10
        for (let k = 0; k < seg; k++) {
          const f1 = it.p - k * 0.025, f2 = it.p - (k + 1) * 0.025
          const X = (f: number) => W.w * it.x + Math.sin(f * 12 + it.ph + W.t) * W.w * it.amp
          ctx.globalAlpha = (1 - k / seg) * 0.45 * (L.a ?? 1) * clamp(it.p * 3, 0, 1)
          ctx.lineWidth = W.m * 0.012 * (1 - k / seg)
          ctx.beginPath(); ctx.moveTo(X(f1), W.h * (1 - f1)); ctx.lineTo(X(f2), W.h * (1 - f2)); ctx.stroke()
        }
      }
      normal(ctx)
    },
  }
}

/** Folhas de luz caindo em diagonal e girando. */
const leaves: Make = (L, W) => {
  const n = amount(L, W, 10)
  const c = L.c ?? "#9bff7a", c2 = L.c2 ?? "#ffe28a"
  const items = Array.from({ length: n }, () => ({ x: W.rng(), y: W.rng(), r: W.rng() * TAU, vr: (W.rng() - 0.5) * 3, sp: 0.05 + W.rng() * 0.07, s: 3 + W.rng() * 4 }))
  return {
    kind: "leaves", count: () => items.length,
    step(dt) { for (const l of items) { l.y += dt * l.sp * (L.s ?? 1); l.x += dt * l.sp * 0.6 * (L.s ?? 1); l.r += dt * l.vr; if (l.y > 1.05 || l.x > 1.05) { l.y = -0.05; l.x = W.rng() * 0.8 } } },
    draw(ctx, side) {
      for (let i = 0; i < items.length; i++) {
        if ((i % 3 === 0) !== (side === "front")) continue
        const l = items[i], s = l.s * (W.m / 300)
        ctx.save(); ctx.translate(l.x * W.w, l.y * W.h); ctx.rotate(l.r); ctx.scale(1, Math.abs(Math.cos(l.r * 1.3)) * 0.8 + 0.2)
        ctx.fillStyle = i % 2 ? c : c2; ctx.globalAlpha = 0.7 * (L.a ?? 1)
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * 0.6, 0, 0, TAU); ctx.fill()
        ctx.restore()
      }
      normal(ctx)
    },
  }
}

/** Clarão de "ultimate" no centro, com anel (usado no modo Ultimate quando não há nada mais específico). */
const flash: Make = (L, W) => {
  const c = L.c ?? "#ffffff"
  let t = 0
  const cycle = 4.2
  return {
    kind: "flash", count: () => 1,
    step(dt) { t = (t + dt * (L.s ?? 1)) % cycle },
    draw(ctx, side) {
      if (side !== "back" || t > 1.2) return
      const p = t / 1.2
      lighter(ctx)
      glow(ctx, W, c, W.cx, W.cy, W.m * (0.2 + 0.4 * p), (1 - p) * 0.55 * (L.a ?? 1))
      ctx.strokeStyle = c; ctx.lineWidth = 2 * (1 - p); ctx.globalAlpha = (1 - p) * 0.8
      ctx.beginPath(); ctx.arc(W.cx, W.cy, W.m * 0.6 * ease(p), 0, TAU); ctx.stroke()
      normal(ctx)
    },
  }
}

const MAKERS: Record<LayerKind, Make> = {
  blades, wind, embers, flames, orbs, rings, bolts, smoke, shards, barrier, scan, radar, circuit, orbital, beams, icons, rifts, waves, wires, prism,
  streaks, spikes, rockets, eyes, stars, cosmic, sheen, reticle, bubbles, crack, blasts, wisps, leaves, heal, flash,
}

/* ------------------------------------------------------------------ receitas por agente ------------------------------------------------------------------ */
/**
 * Por UUID (o que o jogo e a API usam). As notas descrevem a habilidade que inspirou cada camada; os nomes vêm
 * do catálogo oficial. Agentes sem receita própria recebem a de reserva (função + paleta + ícone oficial).
 */
export const AGENT_FX: Record<string, Recipe> = {
  "add6443a-41bd-e414-f6ad-e58d267f4e95": {
    name: "Jett", note: "Tormenta de Aço: cinco adagas orbitando com um pulso que corre pelas lâminas; correntes de vento atrás.",
    sig: [{ k: "wind", c: "#dff8ff", n: 8 }, { k: "blades", n: 5, fixed: true, c: "#e6fbff", c2: "#5fd0ff" }, { k: "streaks", v: "up", c: "#bff0ff", n: 4, a: 0.35, loud: true }],
    amb: [{ k: "wind", c: "#dff8ff", n: 6, a: 0.35 }, { k: "blades", n: 5, fixed: true, s: 0.5, a: 0.7, c: "#e6fbff", c2: "#5fd0ff" }],
  },
  "eb93336a-449b-9c1b-0a54-a891f7921d69": {
    name: "Phoenix", note: "Chamas na base, brasas subindo e, no modo Ultimate, o clarão de Renascimento.",
    sig: [{ k: "flames", c: "#ff6a1a", c2: "#ffcf6a" }, { k: "embers", c: "#ffb347", c2: "#ff6a1a", n: 26 }],
    ult: [{ k: "flames", c: "#ff6a1a", c2: "#ffcf6a" }, { k: "embers", c: "#ffb347", c2: "#ff6a1a", n: 36 }, { k: "flash", c: "#ffb347", loud: true }, { k: "rings", c: "#ffcf6a", a: 0.5 }],
  },
  "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc": {
    name: "Reyna", note: "Orbes de alma roxos flutuando e os pulsos de Imperatriz.",
    sig: [{ k: "smoke", c: "#5b1f78", n: 6, a: 0.28 }, { k: "orbs", c: "#c46bff", c2: "#ffd6ff", n: 6 }, { k: "rings", c: "#d07bff", a: 0.55, loud: true }],
  },
  "bb2a4828-46eb-8cd1-e765-15848195d751": {
    name: "Neon", note: "Raios azuis, descargas e linhas de velocidade (Sobrecarga).",
    sig: [{ k: "streaks", c: "#59d6ff", n: 10 }, { k: "bolts", c: "#3fb8ff", c2: "#e9fbff", n: 3, loud: true }, { k: "embers", c: "#7fe7ff", c2: "#ffffff", n: 12, s: 1.6 }],
  },
  "f94c3b30-42be-e959-889c-5aa313dba261": {
    name: "Raze", note: "Explosões e fumaça; um foguete (Estraga-prazeres) cruza de tempos em tempos.",
    sig: [{ k: "blasts", c: "#ff8a3d", c2: "#ffe08a", loud: true }, { k: "embers", c: "#ffb347", c2: "#ff7a2b", n: 14 }, { k: "rockets", v: "single", n: 1, fixed: true, c: "#ffb070", loud: true }],
  },
  "569fdd95-4d10-43ab-ca70-79becc718b46": {
    name: "Sage", note: "Cristais verdes, partículas de cura e a Barreira de cristal se formando.",
    sig: [{ k: "barrier", c: "#7dffd9" }, { k: "shards", c: "#8fffe0", c2: "#ffffff", n: 9 }, { k: "heal", c: "#9fffe6", c2: "#5fffbf", n: 16 }],
  },
  "8e253930-4c05-31dd-1b6c-968525494517": {
    name: "Omen", note: "Névoa violeta, fios de sombra subindo e ondas do Salto das Sombras.",
    sig: [{ k: "smoke", c: "#5a3fb0", n: 10, a: 0.55 }, { k: "wisps", c: "#9a7bff", n: 7 }, { k: "rings", c: "#8a6cff", a: 0.45, s: 0.6 }],
  },
  "320b2a48-4d9b-a075-30f1-1f93a9b638fa": {
    name: "Sova", note: "Radar azul de reconhecimento; no modo Ultimate, os três disparos da Fúria do Caçador.",
    sig: [{ k: "radar", c: "#5fb6ff" }, { k: "embers", c: "#9fd4ff", c2: "#5fb6ff", n: 8, s: 0.6 }],
    ult: [{ k: "beams", c: "#69c3ff", c2: "#ffffff", loud: true }, { k: "radar", c: "#5fb6ff", a: 0.6 }],
  },
  "707eab51-4836-f488-046a-cda6bf494859": {
    name: "Viper", note: "Gás tóxico verde, bolhas e ondas químicas.",
    sig: [{ k: "smoke", c: "#2fae4f", n: 11, a: 0.5 }, { k: "bubbles", c: "#8dff9f", n: 14 }, { k: "wisps", c: "#6dff8a", n: 5, a: 0.8 }],
  },
  "117ed9e3-49f3-6512-3ccf-0cada7e3823b": {
    name: "Cypher", note: "Linha de varredura e cantos de câmera de vigilância; fios de armadilha em circuito.",
    sig: [{ k: "scan", c: "#bfe6ff" }, { k: "circuit", c: "#8fc9ff", n: 5, a: 0.8 }],
  },
  "1e58de9c-4950-5125-93e9-a0aee9f98746": {
    name: "Killjoy", note: "Circuitos amarelos, holograma e o pulso no chão do Confinamento.",
    sig: [{ k: "circuit", c: "#ffd23f", n: 7, v: "glitch" }, { k: "rings", v: "ground", c: "#ffd23f", a: 0.7, s: 0.6 }],
  },
  "9f0d8ba9-4140-b941-57d3-a7ad57c6b417": {
    name: "Brimstone", note: "Mira do Ataque Orbital no chão, feixe e impacto; fumaça leve.",
    sig: [{ k: "smoke", c: "#4a3b33", n: 6, a: 0.3 }, { k: "orbital", c: "#ff8a3d", c2: "#ffe0b0", loud: true }],
  },
  "5f8d3a7f-467b-97f3-062c-13acf203c006": {
    name: "Breach", note: "Falha sísmica no chão e ondas laranja (Onda Trovejante).",
    sig: [{ k: "crack", c: "#ff8a2a" }, { k: "rings", v: "ground", c: "#ff9f4a", a: 0.6 }, { k: "embers", c: "#ffb36a", c2: "#ff7a2a", n: 10 }],
  },
  "6f2a04ca-43e0-be17-7f36-b3908627744d": {
    name: "Skye", note: "Luz verde, folhas e os ícones oficiais das habilidades de criaturas flutuando.",
    sig: [{ k: "leaves", c: "#9bff7a", c2: "#ffe28a", n: 9 }, { k: "heal", c: "#b8ff8a", c2: "#ffe28a", n: 12 }, { k: "icons", c: "#9bff7a", n: 3 }],
  },
  "7f94d92c-4234-0a36-9646-3a87eb8b5c89": {
    name: "Yoru", note: "Rasgos dimensionais azul-escuros puxando partículas (Espionagem Dimensional).",
    sig: [{ k: "smoke", c: "#16205a", n: 7, a: 0.4 }, { k: "rifts", c: "#4f7bff", n: 3 }],
  },
  "601dbbe7-43ce-be57-2a40-4abd24953621": {
    name: "KAY/O", note: "Pulsos de supressão em anéis segmentados, holograma e circuito.",
    sig: [{ k: "rings", v: "seg", c: "#7fb2ff", a: 0.7 }, { k: "circuit", c: "#6f9bff", n: 5, v: "glitch", a: 0.8 }, { k: "bolts", c: "#7fb2ff", c2: "#ffffff", n: 1, loud: true }],
  },
  "22697a3d-45bf-8dd7-4fec-84a9e28c69d7": {
    name: "Chamber", note: "Reflexos dourados, cristais e a luneta do Tour de Force.",
    sig: [{ k: "sheen", c: "#ffd77a" }, { k: "shards", c: "#ffd77a", c2: "#fff4cf", n: 7 }, { k: "reticle", c: "#ffd77a", loud: true }],
  },
  "dade69b4-4f5a-8528-247b-219e5a1facd6": {
    name: "Fade", note: "Névoa escura, fios de sombra e olhos espectrais (Véu da Noite).",
    sig: [{ k: "smoke", c: "#1b1d3a", n: 9, a: 0.45 }, { k: "eyes", c: "#8fa8ff", n: 3 }, { k: "wisps", c: "#6f7fd8", n: 4, a: 0.6 }],
  },
  "95b78ed7-4637-86d9-7e41-71ba8c293152": {
    name: "Harbor", note: "Ondas na base e uma parede de água atravessando o widget.",
    sig: [{ k: "waves", c: "#2fc8c0", c2: "#bff7ff" }, { k: "bubbles", c: "#a8f3ff", n: 8 }],
  },
  "e370fa57-4757-3604-3648-499e1f642d3f": {
    name: "Gekko", note: "As criaturas aparecem como os ícones oficiais das habilidades, flutuando, com partículas.",
    sig: [{ k: "icons", c: "#c9ff5c", n: 4 }, { k: "heal", c: "#d6ff6a", c2: "#ff9be8", n: 12 }],
  },
  "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235": {
    name: "Deadlock", note: "Malha de nanofios em volta do agente (Aniquilação) e campos de contenção.",
    sig: [{ k: "wires", c: "#a9c4ff" }, { k: "rings", c: "#a9c4ff", a: 0.35, s: 0.5 }],
  },
  "0e38b510-41a8-5780-5e8f-568b2a4f2d6c": {
    name: "Iso", note: "Escudos prismáticos hexagonais orbitando e fragmentos de energia.",
    sig: [{ k: "prism", c: "#a98bff", c2: "#6ff3ff", n: 5 }, { k: "shards", v: "hex", c: "#b9a2ff", c2: "#ffffff", n: 6 }],
  },
  "1dbf2edd-4729-0984-3115-daa5eed44993": {
    name: "Clove", note: "Partículas roxas e rosadas, fios etéreos subindo.",
    sig: [{ k: "orbs", c: "#d07bff", c2: "#ffd6f5", n: 6 }, { k: "wisps", c: "#ff8ae0", n: 5 }, { k: "heal", c: "#e3a6ff", c2: "#ff9be8", n: 12 }],
  },
  "efba5359-4016-a1e5-7626-b1ae76895940": {
    name: "Vyse", note: "Espinhos metálicos brotando do chão (Jardim de Aço) e fragmentos.",
    sig: [{ k: "spikes", c: "#e2dcff", c2: "#3b2c66" }, { k: "shards", c: "#b9a8ff", c2: "#ffffff", n: 6, a: 0.7 }],
  },
  "b444168c-4e35-8076-db47-ef9bf368f384": {
    name: "Tejo", note: "Salva de foguetes em arco com rastros e impactos (Armagedom).",
    sig: [{ k: "rockets", n: 5, fixed: true, c: "#ffb070", c2: "#ffffff" }, { k: "embers", c: "#ffcf8a", c2: "#ff8a3d", n: 8 }],
  },
  "df1cb487-4902-002e-5c17-d28e83e78588": {
    name: "Waylay", note: "Rastros de luz refratada e prismas (Caminhos Convergentes).",
    sig: [{ k: "prism", v: "streak", c: "#ff7ad9", c2: "#7ae3ff", n: 6 }, { k: "streaks", c: "#ffd1f2", n: 6, a: 0.4 }, { k: "shards", c: "#ffb3ec", c2: "#ffffff", n: 5 }],
  },
  "41fb69c1-4189-7b37-f117-bcaf1e96f1bf": {
    name: "Astra", note: "Estrelas e constelação; a linha da Divisa Cósmica atravessa o fundo.",
    sig: [{ k: "stars", c: "#d7b5ff", n: 16 }, { k: "cosmic", c: "#c58bff", loud: true }, { k: "smoke", c: "#3a1a6e", n: 5, a: 0.3 }],
  },
}

const ROLE_FX: Record<string, (c: string, c2: string) => LayerSpec[]> = {
  Duelista: (c, c2) => [{ k: "streaks", c, n: 8 }, { k: "embers", c, c2, n: 14 }],
  Duelist: (c, c2) => [{ k: "streaks", c, n: 8 }, { k: "embers", c, c2, n: 14 }],
  Iniciador: (c) => [{ k: "rings", c, a: 0.55 }, { k: "radar", c, a: 0.7 }],
  Initiator: (c) => [{ k: "rings", c, a: 0.55 }, { k: "radar", c, a: 0.7 }],
  Controlador: (c, c2) => [{ k: "smoke", c, n: 8, a: 0.3 }, { k: "orbs", c, c2, n: 5 }],
  Controller: (c, c2) => [{ k: "smoke", c, n: 8, a: 0.3 }, { k: "orbs", c, c2, n: 5 }],
  Sentinela: (c, c2) => [{ k: "circuit", c, n: 5 }, { k: "shards", c, c2, n: 6, v: "hex" }],
  Sentinel: (c, c2) => [{ k: "circuit", c, n: 5 }, { k: "shards", c, c2, n: 6, v: "hex" }],
}

/** Receita de reserva: paleta oficial do agente + função + ícone oficial da ultimate flutuando. */
export function fallbackRecipe(a: AgentInfo): Recipe {
  const cols = a.backgroundGradientColors ?? []
  const c = brighten("#" + (cols[0] ?? "7f7fff").slice(0, 6), 0.68)
  const c2 = brighten("#" + (cols[2] ?? cols[0] ?? "ffffff").slice(0, 6), 0.8)
  const role = a.role?.displayName ?? ""
  const base = (ROLE_FX[role] ?? ROLE_FX.Controlador)(c, c2)
  return { name: a.displayName, note: `Efeito de reserva (${role || "sem função"}): paleta oficial do agente e o ícone oficial da ultimate.`, sig: [...base, { k: "icons", c, n: 1 }] }
}

export function recipeFor(a: AgentInfo): Recipe { return AGENT_FX[a.uuid.toLowerCase()] ?? fallbackRecipe(a) }
export const hasSpecificFx = (a: AgentInfo) => !!AGENT_FX[a.uuid.toLowerCase()]

/** camadas efetivas para um modo */
export function layersFor(a: AgentInfo, mode: FxMode): LayerSpec[] {
  const r = recipeFor(a)
  if (mode === "ult") {
    if (r.ult) return r.ult
    const c = r.sig.find((l) => l.c)?.c ?? "#ffffff"
    return [...r.sig.map((l) => (l.fixed ? l : { ...l, n: l.n != null ? Math.round(l.n * 1.35) : l.n, s: (l.s ?? 1) * 1.15 })), { k: "flash", c, loud: true }]
  }
  if (mode === "amb") {
    if (r.amb) return r.amb
    return r.sig.filter((l) => !l.loud).map((l) => ({ ...l, s: (l.s ?? 1) * 0.6, a: (l.a ?? 1) * 0.65 }))
  }
  return r.sig
}

/** ícones oficiais que a camada "icons" usa: a ultimate primeiro, depois as habilidades */
export function iconUrls(a: AgentInfo): string[] {
  const ab = a.abilities ?? []
  const order = ["Ultimate", "Ability1", "Ability2", "Grenade"]
  return order.map((s) => ab.find((x) => x.slot === s)?.displayIcon).filter((u): u is string => !!u)
}

/* ------------------------------------------------------------------ cena ------------------------------------------------------------------ */
export function createScene(agent: AgentInfo, mode: FxMode, size: { w: number; h: number; cx?: number; cy?: number }, opts: FxOptions, env: FxEnv): Scene {
  const W: World = {
    w: size.w, h: size.h, cx: size.cx ?? size.w / 2, cy: size.cy ?? size.h * 0.46, m: Math.min(size.w, size.h), t: 0,
    rng: rngFrom(hashSeed(agent.uuid + mode)), env, opts, icons: iconUrls(agent),
  }
  const specs = layersFor(agent, mode).filter((l) => l.k !== "icons" || W.icons.length)
  let layers = specs.map((l) => MAKERS[l.k](l, W))
  return {
    step(dt) {
      const d = Math.max(0, Math.min(0.1, dt))
      W.t += d
      for (const l of layers) l.step(d)
    },
    draw(ctx, side) {
      for (const l of layers) { l.draw(ctx, side); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over" }
    },
    resize(w, h, cx, cy) {
      const changed = Math.abs(w - W.w) > 1 || Math.abs(h - W.h) > 1
      W.w = w; W.h = h; W.m = Math.min(w, h); W.cx = cx ?? w / 2; W.cy = cy ?? h * 0.46
      // posições guardadas em pixels são refeitas para o tamanho novo
      if (changed) { W.rng = rngFrom(hashSeed(agent.uuid + mode)); layers = specs.map((l) => MAKERS[l.k](l, W)) }
    },
    count(kind) { return layers.filter((l) => l.kind === kind).reduce((n, l) => n + l.count(), 0) },
    kinds() { return layers.map((l) => l.kind) },
  }
}
