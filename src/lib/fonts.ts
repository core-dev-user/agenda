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

export type FontCategory = "sans" | "serif" | "display" | "handwriting" | "mono" | "retro" | "decorative"

export interface FontDef {
  id: string
  label: string
  family: string
  vibe: "moderna" | "retrô" | "elegante" | "técnica" | "divertida"
  category?: FontCategory
  /** Fontes externas usam Google Fonts CSS2; as originais não precisam de rede. */
  google?: string
}

export const FONT_CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: "sans", label: "Modernas" },
  { id: "serif", label: "Serifadas" },
  { id: "display", label: "Impactantes" },
  { id: "handwriting", label: "Manuscritas" },
  { id: "mono", label: "Monoespaçadas" },
  { id: "retro", label: "Retrô e pixel" },
  { id: "decorative", label: "Artísticas" },
]

/** IDs preservados: escolhas e templates já salvos continuam funcionando. */
export const OFFLINE_FONTS: FontDef[] = [
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

const ONLINE_GROUPS: Record<FontCategory, string[]> = {
  sans: ["Roboto","Open Sans","Lato","Montserrat","Poppins","Raleway","Nunito","Nunito Sans","Rubik","Ubuntu","Mulish","Manrope","DM Sans","Plus Jakarta Sans","Urbanist","Work Sans","Karla","Cabin","Quicksand","Questrial","Josefin Sans","Jost","Barlow","Barlow Condensed","IBM Plex Sans","Source Sans 3","Noto Sans","PT Sans","Fira Sans","Asap","Hind","Mukta","Oxygen","Assistant","Lexend","Albert Sans","Archivo","Sora","Public Sans","Red Hat Display","Be Vietnam Pro","Exo 2","Titillium Web","Figtree","Commissioner","Chivo","Kanit","Teko","Rajdhani","Varela Round","Comfortaa","Epilogue","Catamaran","Yantramanav","Dosis","Noto Sans Display","Instrument Sans","Onest","Hanken Grotesk","Familjen Grotesk","Geologica","Maven Pro","Libre Franklin","Prompt","Heebo","Sarabun","Readex Pro","Sen","Outfit"],
  serif: ["Merriweather","Lora","Libre Baskerville","Cormorant Garamond","EB Garamond","Crimson Text","Prata","Abril Fatface","DM Serif Display","DM Serif Text","Bodoni Moda","Cinzel","Cinzel Decorative","Alegreya","Bitter","Vollkorn","Spectral","PT Serif","Noto Serif","Fraunces","Instrument Serif","Gloock","Marcellus","Cardo","Old Standard TT","Newsreader","Philosopher","Tinos","Alice","Arvo","Rokkitt","Rufina","Domine","Vidaloka","Yeseva One","Cormorant","Cormorant Infant","Judson","Zilla Slab","Roboto Slab","Josefin Slab","Bree Serif","Young Serif","Cormorant SC","Alegreya SC","Alegreya Sans SC","Sorts Mill Goudy","Caudex"],
  display: ["Bebas Neue","Anton","Oswald","Archivo Black","Black Ops One","Bungee","Bungee Shade","Bungee Inline","Fugaz One","Righteous","Russo One","Racing Sans One","Staatliches","Alfa Slab One","Rowdies","Patua One","Lilita One","Titan One","Bowlby One SC","Paytone One","Changa One","Fjalla One","Koulen","Unbounded","Syncopate","Michroma","Audiowide","Poiret One","Monoton","Faster One","Special Elite","Rampart One","Limelight","Fredericka the Great","Poller One","Sarina","Londrina Outline","Rammetto One","Caprasimo","Modak","Ultra","Acme","Concert One","Baloo 2","Balsamiq Sans","Boogaloo","Chewy","Carter One","Days One","Passion One"],
  handwriting: ["Caveat","Kalam","Patrick Hand","Indie Flower","Permanent Marker","Shadows Into Light","Architects Daughter","Amatic SC","Satisfy","Great Vibes","Sacramento","Tangerine","Allura","Cookie","Courgette","Lobster","Lobster Two","Kaushan Script","Merienda","Yellowtail","Handlee","Gloria Hallelujah","Neucha","Reenie Beanie","Bad Script","Nothing You Could Do","Rock Salt","Covered By Your Grace","Just Another Hand","Homemade Apple","Mrs Saint Delafield","Alex Brush","Parisienne","Petit Formal Script","Itim","Mali","Comic Neue","Schoolbell","Short Stack","Delius","Delius Swash Caps","Delius Unicase"],
  mono: ["Roboto Mono","IBM Plex Mono","Fira Code","Source Code Pro","Inconsolata","Ubuntu Mono","PT Mono","Space Mono","Anonymous Pro","Cousine","DM Mono","Overpass Mono","Azeret Mono","Martian Mono","Geist Mono","Oxygen Mono","Victor Mono","Nanum Gothic Coding","Cutive Mono","Sono","Fragment Mono","Syne Mono","Red Hat Mono","Courier Prime","Chivo Mono","Kode Mono","Major Mono Display"],
  retro: ["Pixelify Sans","Tiny5","Micro 5","DotGothic16","Jersey 10","Jersey 15","Jersey 20","Jersey 25","Sixtyfour","Sixtyfour Convergence","Rubik Pixels","Rubik Glitch","Rubik Mono One","Turret Road","Wallpoet","Quantico","Saira Stencil One","Oxanium","Chakra Petch","ZCOOL QingKe HuangYou","Nova Mono","Silkscreen","Press Start 2P","VT323","Share Tech Mono"],
  decorative: ["Creepster","Eater","Nosifer","Metal Mania","Pirata One","Grenze Gotisch","UnifrakturCook","UnifrakturMaguntia","Trade Winds","Zen Dots","Fascinate Inline","Hanalei Fill","Henny Penny","Rye","Sancreek","Frijole","Shojumaru","Lacquer","New Rocker","Rubik Wet Paint","Butcherman","Jolly Lodger","Mountains of Christmas","Emilys Candy","Mystery Quest","Fontdiner Swanky","Bungee Spice","Rubik Dirt","Rubik Bubbles","Rubik Moonrocks","Rubik Puddles","Rubik Spray Paint"],
}
const FALLBACK: Record<FontCategory, string> = {
  sans: "sans-serif", serif: "serif", display: "sans-serif",
  handwriting: "cursive", mono: "monospace", retro: "monospace", decorative: "fantasy",
}
const VIBE: Record<FontCategory, FontDef["vibe"]> = {
  sans: "moderna", serif: "elegante", display: "moderna",
  handwriting: "divertida", mono: "técnica", retro: "retrô", decorative: "divertida",
}
const slug = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const existingNames = new Set(OFFLINE_FONTS.map((f) => f.label.replace(/ \(.+\)$/, "").toLowerCase()))
const seen = new Set<string>()
const ONLINE_FONTS: FontDef[] = (Object.entries(ONLINE_GROUPS) as [FontCategory, string[]][]).flatMap(([category, names]) =>
  names.filter((name) => {
    const key = name.toLowerCase()
    if (existingNames.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  }).map((name) => ({
    id: "gf-" + slug(name),
    label: name,
    family: "'" + name.replace(/'/g, "\\'") + "', " + FALLBACK[category],
    vibe: VIBE[category], category, google: name,
  }))
)

export const FONTS: FontDef[] = [...OFFLINE_FONTS, ...ONLINE_FONTS]
const BY_ID = new Map(FONTS.map((f) => [f.id, f]))
export const getFont = (id: string) => BY_ID.get(id)
export const fontFamily = (id: string) => getFont(id)?.family ?? OFFLINE_FONTS[0].family
export const fontCategory = (font: FontDef): FontCategory =>
  font.category ?? ({ moderna: "sans", retrô: "retro", elegante: "serif", técnica: "mono", divertida: "display" } as const)[font.vibe]

/** Carrega fontes externas só quando necessárias; o Chromium mantém cache.
 * Em falha, deixa a fonte fallback e permite tentar novamente depois.
 */
const pending = new Map<string, Promise<boolean>>()
export function ensureFont(id: string): Promise<boolean> {
  const font = getFont(id)
  if (!font || !font.google) return Promise.resolve(true)
  if (typeof document === "undefined") return Promise.resolve(false)
  const previous = pending.get(id)
  if (previous) return previous
  const request = new Promise<boolean>((resolve) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(font.google!) + "&display=swap"
    let finished = false
    const done = (ok: boolean) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (!ok) { link.remove(); pending.delete(id) }
      resolve(ok)
    }
    const timer = window.setTimeout(() => done(false), 12000)
    link.onload = () => {
      document.fonts.load('16px "' + font.google + '"').then((faces) => done(faces.length > 0)).catch(() => done(false))
    }
    link.onerror = () => done(false)
    document.head.appendChild(link)
  })
  pending.set(id, request)
  return request
}

export function ensureFontFamily(family: string): void {
  const font = FONTS.find((item) => item.family === family)
  if (font?.google) void ensureFont(font.id)
}
