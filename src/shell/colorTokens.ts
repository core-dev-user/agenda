/** Paleta pura do Carbono — compartilhada pela UI principal e pelas janelas nativas. */
export type CarbonoAccent = "rose" | "ice" | "widgy" | "theme"

export const ACCENTS: Record<CarbonoAccent, { label: string; color: string; soft: string }> = {
  rose: { label: "Rosado", color: "#F1B9C6", soft: "#F6D3B3" },
  ice: { label: "Gelo", color: "#CFE3FF", soft: "#E9F1FF" },
  widgy: { label: "Azul Widgy", color: "#5AB0FF", soft: "#9ED4FF" },
  theme: { label: "Do tema", color: "var(--accent)", soft: "var(--accent)" },
}

/** cores prontas para os painéis e a barra */
export const SURFACES: { label: string; color: string }[] = [
  { label: "Carvão", color: "#121212" },
  { label: "Grafite", color: "#1C1D21" },
  { label: "Azul noite", color: "#0E1626" },
  { label: "Ameixa", color: "#1B1220" },
  { label: "Musgo", color: "#111A15" },
  { label: "Vinho", color: "#1F0E13" },
  { label: "Areia", color: "#E9E3DA" },
  { label: "Gelo", color: "#E8EDF3" },
]
const hex = (c: string) => /^#?[0-9a-f]{6}$/i.test(c) ? c.replace("#", "") : "121212"
/** luminância relativa (0 = preto, 1 = branco) */
export function luminance(c: string) {
  const h = hex(c)
  const ch = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
/**
 * Variáveis de cor a partir de uma cor de fundo: cartões um pouco mais claros (ou escuros, num fundo claro)
 * e texto que continua legível em qualquer cor.
 */
export function surfaceVars(bg: string): Record<string, string> {
  const c = "#" + hex(bg)
  const light = luminance(c) > 0.4
  const mix = (pct: number) => `color-mix(in srgb, ${c} ${100 - pct}%, ${light ? "#000" : "#fff"})`
  return {
    bg: c, s1: mix(light ? 5 : 4), s2: mix(light ? 9 : 8), s3: mix(light ? 14 : 13),
    fg: light ? "#1A1718" : "#ECE7E8", muted: light ? "#5E585A" : "#9C9597", dim: light ? "#8E8789" : "#6B6668",
    line: light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.06)", onAccent: light ? "#FFFFFF" : "#141414",
  }
}

