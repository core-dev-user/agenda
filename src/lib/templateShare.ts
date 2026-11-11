/**
 * Compartilhamento offline de templates.
 *
 * O código WDG1 contém somente JSON validado e comprimido, sem executáveis,
 * dados financeiros, tokens, fotos locais ou conteúdo de notas. Não requer
 * contas/servidor: outras instalações podem importar o mesmo código.
 */
import type { LookTemplate, Settings, Widget, WidgetType } from "./types"

export const SHARE_PREFIX = "WDG1-"
const MAX_CODE_LENGTH = 16000
const MAX_JSON_BYTES = 90_000
const LINK_CODE_LENGTH = 7500

/** Links abertos pelo sistema operacional aguardam a aba Templates ser exibida. */
let pendingShareLink: string | null = null
export function queueShareLink(link: string) {
  pendingShareLink = link
  if (typeof window !== "undefined") window.dispatchEvent(new Event("widgy:template-link"))
}
export const peekShareLink = () => pendingShareLink
export function consumeShareLink(): string | null {
  const link = pendingShareLink
  pendingShareLink = null
  return link
}

export interface SharedTemplate {
  version: 1
  name: string
  settings: Partial<Settings>
  widgets?: Widget[]
}

const SETTING_KEYS: (keyof Settings)[] = [
  "theme", "dark", "accent", "uiFont", "numFont", "displayFont", "fontScale",
  "radius", "blur", "surfaceOpacity", "tilt", "depth", "animations",
  "cursorStyle", "cursorEffect", "cursorColor", "cursorSize", "cursorDensity",
  "clickEffect", "taskbar", "wallpaper", "lockClock", "sakura", "overlay",
  "widgetsLocked", "iconStyle", "iconPackStyle", "iconShape", "iconColors", "shell",
]
const OBJECT_KEYS: Record<string, readonly string[]> = {
  taskbar: ["position", "style", "size", "autoHide", "showLabels", "magnify", "hide", "pcOpen", "smartHide"],
  wallpaper: ["type", "gradient", "color", "blur", "dim", "parallax"],
  lockClock: ["on", "style", "font", "color", "size", "weight", "x", "y", "align", "showDate", "seconds", "opacity", "glow", "h12"],
  sakura: ["ambient", "density", "splash", "splashSeconds"],
  overlay: ["scanlines", "grain", "vignette"],
  iconColors: ["today", "habits", "studies", "services", "finance", "lists", "music", "games", "rooms", "discord", "whatsapp", "ifood", "gallery", "settings"],
  shell: ["pack", "accent", "frame", "hoverTop", "side"],
}
const CONFIG_KEYS = new Set([
  "style", "color", "font", "weight", "glow", "blink", "seconds", "h12",
  "showDate", "size", "opacity", "scale", "background", "border", "radius",
  "alignment", "align", "shape", "accent", "shadow", "layout", "icon",
  "showLabel", "theme", "effect", "gradient", "tint", "mode", "compact",
  "showSeconds", "timeFormat", "visualizer", "showArtist", "round", "format",
])
const WIDGET_TYPES = new Set<WidgetType>([
  "clock", "stopwatch", "weather", "news", "photo", "calendar", "note",
  "shortcut", "music", "cs2", "valorant", "football", "lyrics", "tasks",
  "discord", "ifood", "whatsapp", "finance", "agenda", "musicstats",
  "gaming", "musicclip", "valagent", "sysmon", "pcmusic", "countdown",
])
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

function safeScalar(v: unknown): string | number | boolean | undefined {
  if (typeof v === "boolean") return v
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= 100_000 ? v : undefined
  // Não exportar links, caminhos de arquivos, dados codificados ou texto pessoal.
  if (typeof v === "string" && v.length <= 100 && !/[/\\<>\u0000-\u001f]|:\/\/|@/.test(v)) return v
  return undefined
}

function safeList(v: unknown): (string | number | boolean)[] | undefined {
  if (!Array.isArray(v) || v.length > 32) return undefined
  const values = v.map(safeScalar)
  return values.every((x) => x !== undefined) ? values as (string | number | boolean)[] : undefined
}

function pickRecord(v: unknown, allowed: readonly string[]): Record<string, unknown> | undefined {
  if (!record(v)) return undefined
  const result: Record<string, unknown> = {}
  for (const key of allowed) {
    if (!own(v, key)) continue
    const scalar = safeScalar(v[key])
    if (scalar !== undefined) result[key] = scalar
    else {
      const array = safeList(v[key])
      if (array !== undefined) result[key] = array
    }
  }
  return result
}

export function safeAppearance(raw: unknown): Partial<Settings> {
  if (!record(raw)) throw new Error("Configurações do template inválidas.")
  const result: Record<string, unknown> = {}
  for (const key of SETTING_KEYS) {
    if (!own(raw, key)) continue
    const value = raw[key]
    if (OBJECT_KEYS[key]) {
      const obj = pickRecord(value, OBJECT_KEYS[key])
      if (obj !== undefined) result[key] = obj
    } else {
      const scalar = safeScalar(value)
      if (scalar !== undefined) result[key] = scalar
    }
  }
  // Arquivos importados no PC original não existem no PC de quem recebe.
  const wp = result.wallpaper
  if (record(wp)) {
    if (wp.type !== "gradient" && wp.type !== "color" && wp.type !== "engine") wp.type = "gradient"
    delete wp.video
    delete wp.image
    delete wp.fg
    delete wp.fgFor
  }
  const clock = result.lockClock
  if (record(clock)) clock.depth = false
  // shell.prev é um backup pessoal local e nunca deve ser exportado.
  return result as Partial<Settings>
}

function safeGeo(raw: unknown) {
  if (!record(raw)) return null
  const nums = [raw.x, raw.y, raw.w, raw.h]
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 16_384)) return null
  if ((raw.w as number) < 1 || (raw.h as number) < 1) return null
  return { x: raw.x as number, y: raw.y as number, w: raw.w as number, h: raw.h as number }
}

function safeWidgets(raw: unknown): Widget[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length > 80) throw new Error("Quantidade de widgets inválida.")
  const result: Widget[] = []
  for (const item of raw) {
    if (!record(item) || typeof item.type !== "string" || !WIDGET_TYPES.has(item.type as WidgetType)) continue
    const geo = safeGeo(item)
    if (!geo) continue
    const cfg: Record<string, string | number | boolean> = {}
    if (record(item.config)) {
      for (const k of CONFIG_KEYS) {
        if (!own(item.config, k)) continue
        const v = safeScalar(item.config[k])
        if (v !== undefined) cfg[k] = v
      }
    }
    const portrait = safeGeo(item.portrait)
    result.push({
      ...geo, id: "template-" + result.length, type: item.type as WidgetType,
      config: cfg, ...(portrait ? { portrait } : {}),
    })
  }
  return result
}

function sanitized(raw: unknown): SharedTemplate {
  if (!record(raw) || raw.version !== 1 || !record(raw.settings) || typeof raw.name !== "string") {
    throw new Error("Formato de template incompatível.")
  }
  const name = raw.name.trim().replace(/[\u0000-\u001f]/g, " ").slice(0, 72)
  if (!name) throw new Error("O template não possui nome.")
  const settings = safeAppearance(raw.settings)
  if (!Object.keys(settings).length) throw new Error("O template não contém aparência válida.")
  const widgets = safeWidgets(raw.widgets)
  return { version: 1, name, settings, ...(widgets ? { widgets } : {}) }
}

function toBase64Url(bytes: Uint8Array): string {
  let raw = ""
  for (let i = 0; i < bytes.length; i += 8192) {
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(raw: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("Código do template inválido.")
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function blobFromBytes(bytes: Uint8Array): Blob {
  // TS 5.9 distingue ArrayBufferLike de ArrayBuffer (SharedArrayBuffer).
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer])
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = blobFromBytes(bytes).stream().pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function ungzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = blobFromBytes(bytes).stream().pipeThrough(new DecompressionStream("gzip"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_JSON_BYTES) throw new Error("Template excede o limite de segurança.")
      chunks.push(next.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  const data = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
  return data
}

export async function encodeTemplate(input: Pick<LookTemplate, "name" | "settings" | "widgets">): Promise<string> {
  const safe = sanitized({ version: 1, name: input.name, settings: input.settings, widgets: input.widgets })
  const data = new TextEncoder().encode(JSON.stringify(safe))
  if (data.byteLength > MAX_JSON_BYTES) throw new Error("Template muito grande para compartilhar.")
  const code = SHARE_PREFIX + toBase64Url(await gzip(data))
  if (code.length > MAX_CODE_LENGTH) throw new Error("Código muito longo. Tente compartilhar sem widgets.")
  return code
}

export function extractShareCode(text: string): string {
  let candidate = text.trim()
  if (candidate.toLowerCase().startsWith("widgy://")) {
    let url: URL
    try { url = new URL(candidate) } catch { throw new Error("Link Widgy inválido.") }
    if (url.hostname !== "template" || url.search || url.hash) throw new Error("Link de template inválido.")
    candidate = decodeURIComponent(url.pathname.slice(1))
  }
  candidate = candidate.replace(/\s/g, "")
  if (!candidate.startsWith(SHARE_PREFIX) || candidate.length > MAX_CODE_LENGTH || candidate.length < 30) {
    throw new Error("Código de template inválido.")
  }
  return candidate
}

export async function decodeTemplate(text: string): Promise<SharedTemplate> {
  const code = extractShareCode(text)
  try {
    const bytes = fromBase64Url(code.slice(SHARE_PREFIX.length))
    const unpacked = await ungzip(bytes)
    return sanitized(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(unpacked)))
  } catch (e) {
    if (e instanceof Error && /limite de segurança|incompatível|não contém|não possui|Quantidade/.test(e.message)) throw e
    throw new Error("Não foi possível ler este código. Confira se foi copiado completo.")
  }
}

export function shareLink(code: string): string | null {
  const valid = extractShareCode(code)
  // Windows limita argumentos na abertura por protocolo; códigos maiores podem ser colados manualmente.
  return valid.length <= LINK_CODE_LENGTH ? "widgy://template/" + valid : null
}

export function importedTemplate(source: SharedTemplate, makeId: () => string): LookTemplate {
  const safe = sanitized(source)
  const now = Date.now()
  return {
    id: makeId(), name: safe.name, createdAt: now, updatedAt: now, source: "shared",
    settings: safe.settings,
    ...(safe.widgets ? { widgets: safe.widgets.map((w) => ({ ...w, id: makeId() })) } : {}),
  }
}
