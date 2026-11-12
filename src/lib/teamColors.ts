/**
 * Cores de um time tiradas do próprio logo (para e-sports, que não têm "cor oficial" em nenhuma API).
 * Desenha o logo pequeno num canvas e vota nas cores, dando peso às saturadas.
 */
export type RGB = [number, number, number]

export const hex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")
export const rgb = (h: string): RGB => {
  const m = h.replace("#", "")
  const n = parseInt(m.length === 3 ? m.split("").map((x) => x + x).join("") : m.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const lum = (c: RGB) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
export const sat = ([r, g, b]: RGB) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0 }
const hue = ([r, g, b]: RGB) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return 0
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

const memo = new Map<string, Promise<string[]>>()

/** até 3 cores marcantes do logo, da mais forte para a menos */
export function logoPalette(src: string): Promise<string[]> {
  if (!src) return Promise.resolve([])
  const key = src.length > 200 ? src.slice(0, 80) + src.length + src.slice(-80) : src
  const old = memo.get(key)
  if (old) return old
  const p = new Promise<string[]>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const S = 48
        const cv = document.createElement("canvas")
        cv.width = S; cv.height = S
        const ctx = cv.getContext("2d", { willReadFrequently: true })!
        const k = Math.min(S / img.naturalWidth, S / img.naturalHeight) || 1
        ctx.drawImage(img, (S - img.naturalWidth * k) / 2, (S - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k)
        const d = ctx.getImageData(0, 0, S, S).data
        const bins = new Map<number, { n: number; w: number; r: number; g: number; b: number }>()
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 160) continue
          const c: RGB = [d[i], d[i + 1], d[i + 2]]
          const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4)
          const s = sat(c)
          const w = 0.25 + s * 2.2 // saturadas valem mais; branco/preto ainda contam (times P&B)
          const b = bins.get(key) ?? { n: 0, w: 0, r: 0, g: 0, b: 0 }
          b.n++; b.w += w; b.r += c[0]; b.g += c[1]; b.b += c[2]
          bins.set(key, b)
        }
        const all = [...bins.values()].map((b) => ({ c: [b.r / b.n, b.g / b.n, b.b / b.n] as RGB, w: b.w })).sort((a, b) => b.w - a.w)
        const out: RGB[] = []
        for (const x of all) {
          if (out.length >= 3) break
          // cores distintas entre si (outro tom, não só mais clara/escura)
          if (out.some((o) => dist(o, x.c) < 70 || (sat(o) > 0.35 && sat(x.c) > 0.35 && Math.abs(hue(o) - hue(x.c)) < 18))) continue
          out.push(x.c)
        }
        resolve(out.map(hex))
      } catch {
        resolve([])
      }
    }
    img.onerror = () => resolve([])
    img.src = src
  })
  memo.set(key, p)
  return p
}

/**
 * Monta o tema do cartão: fundo (base), destaque e se o logo precisa de um "palco" claro atrás.
 * Funciona para time colorido (Palmeiras), preto e branco (Corinthians) e logos claros.
 */
export function teamTheme(colors: string[]) {
  const list = colors.filter(Boolean).map(rgb)
  const strong = list.find((c) => sat(c) > 0.3)
  let base: RGB = strong ?? list[0] ?? [40, 44, 60]
  // fundo claro demais fica feio e apaga o texto branco: escurece bastante
  if (lum(base) > 0.35) base = mix(base, [0, 0, 0], 0.55)
  const others = list.filter((c) => dist(c, base) > 60)
  let accent: RGB = others.find((c) => sat(c) > 0.3) ?? others[0] ?? mix(base, [255, 255, 255], 0.6)
  if (lum(accent) < 0.12) accent = mix(accent, [255, 255, 255], 0.55)
  const mono = !strong // time preto e branco (ou cinza): visual monocromático
  const deep = mix(base, [0, 0, 0], mono ? 0.4 : 0.62)
  const glow = mix(base, [255, 255, 255], 0.18)
  return { base: hex(base), deep: hex(deep), glow: hex(glow), accent: hex(accent), mono, darkBase: lum(base) < 0.06 }
}
