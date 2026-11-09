/** grade de pixels e formas simples, usadas para desenhar os bichinhos */
export const GW = 32
export const GH = 24

// índices da paleta
export const E = 0, O = 1, B = 2, S = 3, L = 4, P = 5, K = 6, G = 7, T = 8, X = 9, LID = 10, HOOF = 11
export type Pal = Record<number, string>

/* ---------------------------------------------------- grade e formas ---------------------------------------------------- */

export class Grid {
  d = new Uint8Array(GW * GH)
  /** pixels que formam a silhueta (contam para o contorno) */
  set(x: number, y: number, c: number) {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= GW || y >= GH) return
    this.d[y * GW + x] = c
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= GW || y >= GH ? E : this.d[y * GW + x] }
  /** pinta só onde já tem gato (detalhes por dentro) */
  paint(x: number, y: number, c: number) { if (this.get(Math.round(x), Math.round(y)) !== E) this.set(x, y, c) }
  rect(x: number, y: number, w: number, h: number, c: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c) }
  /** elipse (opcionalmente girada, em radianos) */
  oval(cx: number, cy: number, rx: number, ry: number, c: number, ang = 0) {
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const R = Math.ceil(Math.max(rx, ry)) + 1
    for (let y = Math.floor(cy - R); y <= cy + R; y++)
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca
        if ((u / rx) ** 2 + (v / ry) ** 2 <= 1) this.set(x, y, c)
      }
  }
  /** traço grosso (pincel quadrado de `w` pixels) por uma curva de Bézier quadrática */
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, c: number, cTip?: number) {
    const n = 40
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = (1 - t) ** 2, b = 2 * (1 - t) * t, d = t * t
      const x = a * x0 + b * cx + d * x1, y = a * y0 + b * cy + d * y1
      const ww = i > n * 0.8 && w > 1 ? w - 0.5 : w
      const col = cTip != null && t > 0.78 ? cTip : c
      for (let j = 0; j < ww; j++) for (let k = 0; k < ww; k++) this.set(Math.floor(x - ww / 2 + 0.5) + j, Math.floor(y - ww / 2 + 0.5) + k, col)
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: number) { this.curve(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, w, c) }
  /** contorno de 1 pixel em volta de tudo */
  outline() {
    const src = this.d.slice()
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (src[y * GW + x] !== E) continue
        const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < GW && yy < GH && src[yy * GW + xx] !== E && src[yy * GW + xx] !== O
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) this.d[y * GW + x] = O
      }
  }
}

