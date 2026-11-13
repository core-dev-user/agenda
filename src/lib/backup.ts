/**
 * Backup manual (Configurações › Sistema): o que entra no arquivo e como um arquivo é conferido antes de
 * substituir os dados. Funções puras, sem depender do app, para poderem ser testadas.
 *
 * Importar um arquivo qualquer não pode quebrar o Widgy: só as chaves conhecidas entram, cada uma com o
 * formato certo, e as configurações são completadas com os padrões (um backup antigo não tem os ajustes novos).
 */
export const BACKUP_ARRAYS = ["widgets", "media", "habits", "subjects", "services", "lists", "tasks", "templates", "valTemplates", "photoGalleries"] as const
export const BACKUP_OBJECTS = ["habitLog", "listening", "gaming"] as const
/** partes das configurações que são objetos e ganham os campos padrão que faltarem (as mesmas do salvamento automático) */
const NESTED = ["taskbar", "wallpaper", "sakura", "overlay"]
const MAX_CHARS = 80 * 1024 * 1024
/** chaves que mexeriam no próprio objeto em vez de guardar um valor */
const UNSAFE = ["__proto__", "constructor", "prototype"]

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const kind = (v: unknown) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v)
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v)

export function buildBackup(state: Obj, now = new Date()): Obj {
  const out: Obj = { app: "widgy", backup: 1, savedAt: now.toISOString(), settings: state.settings }
  for (const k of [...BACKUP_ARRAYS, ...BACKUP_OBJECTS]) if (state[k] !== undefined) out[k] = state[k]
  return out
}

export interface BackupOptions {
  /** configurações padrão do app */
  defaults: Obj
  /** tipos de widget que este app conhece */
  widgetTypes: readonly string[]
  /** ajustes que só aceitam valores de uma lista (ex.: theme) */
  oneOf?: Record<string, readonly string[]>
}
export type BackupResult =
  | { ok: true; data: Obj; warnings: string[]; summary: string }
  | { ok: false; error: string }

function cleanSettings(raw: Obj, o: BackupOptions, warnings: string[]): Obj {
  const out: Obj = { ...o.defaults }
  let dropped = 0
  for (const [k, v] of Object.entries(raw)) {
    if (UNSAFE.includes(k)) continue
    const def = Object.hasOwn(o.defaults, k) ? o.defaults[k] : undefined
    if (def === undefined || def === null) { if (v !== null && v !== undefined) out[k] = v; continue } // ajuste opcional
    if (kind(v) !== kind(def)) { dropped++; continue }
    if (o.oneOf?.[k] && !o.oneOf[k].includes(v as string)) { dropped++; continue }
    if (NESTED.includes(k) && isObj(def) && isObj(v)) {
      const merged: Obj = { ...def }
      for (const [nk, nv] of Object.entries(v)) {
        if (UNSAFE.includes(nk)) continue
        const nd = Object.hasOwn(def, nk) ? def[nk] : undefined
        if (nd !== undefined && nd !== null && kind(nv) !== kind(nd)) { dropped++; continue }
        merged[nk] = nv
      }
      out[k] = merged
    } else out[k] = v
  }
  if (dropped) warnings.push(`${dropped} ${dropped === 1 ? "ajuste com valor inválido voltou" : "ajustes com valor inválido voltaram"} ao padrão`)
  return out
}

export function parseBackup(text: string, o: BackupOptions): BackupResult {
  if (text.length > MAX_CHARS) return { ok: false, error: "O arquivo é grande demais para ser um backup do Widgy." }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: "O arquivo não é um JSON válido." } }
  if (!isObj(raw)) return { ok: false, error: "O arquivo não é um backup do Widgy." }
  const known = ["settings", ...BACKUP_ARRAYS, ...BACKUP_OBJECTS].filter((k) => raw[k] !== undefined)
  if (!known.length) return { ok: false, error: "O arquivo não é um backup do Widgy (não tem configurações nem dados)." }

  const data: Obj = {}
  const warnings: string[] = []
  if (raw.settings !== undefined) {
    if (isObj(raw.settings)) data.settings = cleanSettings(raw.settings, o, warnings)
    else warnings.push("as configurações do arquivo estão em formato inválido e foram ignoradas")
  }
  for (const k of BACKUP_ARRAYS) {
    const v = raw[k]
    if (v === undefined) continue
    if (!Array.isArray(v)) { warnings.push(`"${k}" está em formato inválido e foi ignorado`); continue }
    let items = v.filter(isObj)
    if (k === "widgets") items = items.filter((w) => typeof w.id === "string" && typeof w.type === "string" && o.widgetTypes.includes(w.type) && num(w.x) && num(w.y) && num(w.w) && num(w.h) && (w.config === undefined || isObj(w.config))).map((w) => ({ ...w, config: w.config ?? {} }))
    // nada aproveitável numa lista que tinha itens: melhor manter o que já existe do que apagar tudo
    if (v.length && !items.length) { warnings.push(`nenhum item de "${k}" pôde ser aproveitado: o que você tem hoje foi mantido`); continue }
    if (items.length !== v.length) warnings.push(`${v.length - items.length} ${k === "widgets" ? "widget(s) desconhecido(s) ou incompleto(s)" : `item(ns) inválido(s) em "${k}"`} ficaram de fora`)
    data[k] = items
  }
  for (const k of BACKUP_OBJECTS) {
    const v = raw[k]
    if (v === undefined) continue
    if (isObj(v)) data[k] = v
    else warnings.push(`"${k}" está em formato inválido e foi ignorado`)
  }
  if (!Object.keys(data).length) return { ok: false, error: "Nada no arquivo pôde ser aproveitado." }

  const n = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0)
  const parts = [data.settings ? "configurações" : "", n("widgets") ? `${n("widgets")} widgets` : "", n("habits") ? `${n("habits")} hábitos` : "", n("tasks") ? `${n("tasks")} tarefas` : "", n("lists") ? `${n("lists")} listas` : "", n("subjects") ? `${n("subjects")} matérias` : "", n("services") ? `${n("services")} serviços` : ""].filter(Boolean)
  return { ok: true, data, warnings, summary: parts.join(", ") || "dados" }
}
