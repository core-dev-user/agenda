import "@fontsource-variable/inter"
import "@fontsource-variable/outfit"
import "@fontsource-variable/space-grotesk"
import "@fontsource-variable/jetbrains-mono"
import "@fontsource-variable/orbitron"
import "@fontsource-variable/playfair-display"
import "@fontsource-variable/dancing-script"
import "@fontsource/vt323"
import "@fontsource/press-start-2p"
import "@fontsource/pacifico"
import "@fontsource/share-tech-mono"
import "@fontsource/major-mono-display"
import "@fontsource/silkscreen"

export interface FontDef {
  id: string
  label: string
  family: string
  vibe: "moderna" | "retrô" | "elegante" | "técnica" | "divertida"
}

export const FONTS: FontDef[] = [
  { id: "inter", label: "Inter", family: "'Inter Variable', sans-serif", vibe: "moderna" },
  { id: "outfit", label: "Outfit", family: "'Outfit Variable', sans-serif", vibe: "moderna" },
  { id: "space", label: "Space Grotesk", family: "'Space Grotesk Variable', sans-serif", vibe: "moderna" },
  { id: "segoe", label: "Segoe UI (Windows)", family: "'Segoe UI Variable', 'Segoe UI', sans-serif", vibe: "moderna" },
  { id: "playfair", label: "Playfair Display", family: "'Playfair Display Variable', serif", vibe: "elegante" },
  { id: "dancing", label: "Dancing Script", family: "'Dancing Script Variable', cursive", vibe: "elegante" },
  { id: "pacifico", label: "Pacifico", family: "'Pacifico', cursive", vibe: "divertida" },
  { id: "jetbrains", label: "JetBrains Mono", family: "'JetBrains Mono Variable', monospace", vibe: "técnica" },
  { id: "sharetech", label: "Share Tech Mono", family: "'Share Tech Mono', monospace", vibe: "técnica" },
  { id: "orbitron", label: "Orbitron", family: "'Orbitron Variable', sans-serif", vibe: "técnica" },
  { id: "major", label: "Major Mono Display", family: "'Major Mono Display', monospace", vibe: "técnica" },
  { id: "vt323", label: "VT323 (terminal)", family: "'VT323', monospace", vibe: "retrô" },
  { id: "press", label: "Press Start 2P (8-bit)", family: "'Press Start 2P', monospace", vibe: "retrô" },
  { id: "silkscreen", label: "Silkscreen (pixel)", family: "'Silkscreen', monospace", vibe: "retrô" },
]

export const fontFamily = (id: string) => FONTS.find((f) => f.id === id)?.family ?? FONTS[0].family
