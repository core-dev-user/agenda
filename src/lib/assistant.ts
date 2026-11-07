/**
 * Assistente do Agenda: a pessoa pede em português e ele faz.
 * 1) pedidos comuns são entendidos na hora por regras (sem IA, instantâneo);
 * 2) o resto vai para a IA local, que só escolhe ações de uma lista fechada — quem executa é o app.
 */
import LlmWorker from "./llm.worker.ts?worker&inline"
import { useStore } from "./store"
import { arrangeWidgets, type ArrangeStyle } from "./arrange"
import { SECTIONS } from "@/components/sections-meta"
import type { SectionId, ThemeId, Widget, WidgetType } from "./types"

/* ---------------- ações que o assistente sabe fazer ---------------- */
export type Action =
  | { acao: "arrumar"; estilo?: ArrangeStyle }
  | { acao: "adicionar"; widget: WidgetType }
  | { acao: "remover"; widget: WidgetType }
  | { acao: "abrir"; aba: SectionId }
  | { acao: "tema"; tema?: ThemeId; escuro?: boolean; cor?: string }
  | { acao: "travar"; ligado: boolean }
  | { acao: "responder"; texto: string }

const W_WORDS: [WidgetType, string[]][] = [
  ["pcmusic", ["spotify", "deezer", "apple music", "player do pc", "tidal", "amazon music"]],
  ["musicclip", ["clipe", "video da musica"]],
  ["musicstats", ["mais ouco", "estatistica", "mais escuto"]],
  ["lyrics", ["letra"]],
  ["music", ["youtube music", "musica", "music", "player"]],
  ["clock", ["relogio", "hora", "horas"]],
  ["stopwatch", ["cronometro", "timer", "temporizador"]],
  ["weather", ["clima", "tempo", "previsao", "temperatura"]],
  ["news", ["noticia", "jornal"]],
  ["photo", ["foto", "quadro", "imagem"]],
  ["calendar", ["calendario"]],
  ["agenda", ["agenda do google", "google agenda", "eventos", "compromisso"]],
  ["note", ["nota", "anotac", "lembrete", "bloco"]],
  ["tasks", ["tarefa", "to do", "todo", "afazer"]],
  ["valagent", ["agente"]],
  ["cs2", ["cs2", "counter", "csgo"]],
  ["valorant", ["valorant", "vlr"]],
  ["football", ["futebol", "placar", "jogo do", "brasileirao", "time"]],
  ["discord", ["discord", "call"]],
  ["ifood", ["ifood", "pedido", "comida"]],
  ["whatsapp", ["whatsapp", "zap", "conversa"]],
  ["finance", ["financ", "gasto", "dinheiro", "conta", "orcamento"]],
  ["gaming", ["jogando", "jogo aberto"]],
  ["sysmon", ["desempenho", "cpu", "gpu", "memoria", "ram", "temperatura do pc"]],
]
const S_WORDS: [SectionId, string[]][] = [
  ...SECTIONS.map((s) => [s.id, [norm(s.label)]] as [SectionId, string[]]),
  ["finance", ["financ", "dinheiro", "gastos", "extrato"]],
  ["gallery", ["imagens", "galeria", "fotos", "papel de parede"]],
  ["rooms", ["sala", "compartilhar tela", "transmitir"]],
  ["settings", ["configurac", "ajustes", "opcoes"]],
  ["today", ["hoje", "meu dia"]],
]
const COLORS: Record<string, string> = {
  rosa: "#ff8fb8", azul: "#5aa9ff", verde: "#5ee3a1", roxo: "#a78bfa", lilas: "#c49bff", vermelho: "#ff5c5c", laranja: "#ff9a3c",
  amarelo: "#ffd36e", ciano: "#3ccfcf", turquesa: "#3ccfcf", branco: "#e8e8f0", dourado: "#e0b64a", cinza: "#9aa3b5",
}
const THEMES: [ThemeId, string[]][] = [["glass", ["vidro", "glass", "iphone"]], ["metal", ["metal"]], ["retro", ["retro", "95", "antigo"]], ["terminal", ["terminal", "crt", "hacker"]], ["minimal", ["minimal", "limpo", "simples"]]]

function norm(t: string) { return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() }
const findIn = <T,>(t: string, list: [T, string[]][]) => list.find(([, ws]) => ws.some((w) => t.includes(w)))?.[0]

/** entende um pedaço do pedido sem IA; null = não sei */
function rule(part: string): Action | null {
  const t = norm(part)
  if (/(arrum|organiz|encaix|alinh|ajeit|reorganiz|distribu|junt)/.test(t) && !/(adicion|coloc|abr)/.test(t)) {
    const estilo: ArrangeStyle = /esquerd/.test(t) ? "esquerda" : /direit/.test(t) ? "direita" : /(cima|topo|alto)/.test(t) ? "topo" : "centro"
    return { acao: "arrumar", estilo }
  }
  if (/(destrav|desbloque|soltar)/.test(t) && /widget/.test(t)) return { acao: "travar", ligado: false }
  if (/(trav|bloque|prend|fix)/.test(t) && /widget/.test(t)) return { acao: "travar", ligado: true }
  if (/(tira|remov|apag|exclu|fecha o widget|deleta)/.test(t)) { const w = findIn(t, W_WORDS); if (w) return { acao: "remover", widget: w } }
  if (/(adicion|coloc|poe|bota|cria|quero um|quero uma|novo widget|mostra o widget)/.test(t)) { const w = findIn(t, W_WORDS); if (w) return { acao: "adicionar", widget: w } }
  if (/(tema|modo|cor |deixa .*(escur|clar)|fundo)/.test(t) || /(escuro|claro)$/.test(t)) {
    const a: Extract<Action, { acao: "tema" }> = { acao: "tema" }
    if (/escur|dark|noite/.test(t)) a.escuro = true
    if (/(claro|light|dia\b)/.test(t)) a.escuro = false
    a.tema = findIn(t, THEMES)
    const c = Object.keys(COLORS).find((k) => t.includes(k))
    if (c) a.cor = COLORS[c]
    if (a.escuro != null || a.tema || a.cor) return a
  }
  if (/(abr|abrir|mostra|vai pr|ir pr|entra|quero ver)/.test(t)) { const s = findIn(t, S_WORDS); if (s) return { acao: "abrir", aba: s } }
  return null
}

/** quebra "arruma os widgets e abre finanças" em partes; só vale se TODAS as partes forem entendidas */
export function parseByRules(text: string): Action[] | null {
  const parts = text.split(/\s*(?:,|;|\.|\be depois\b|\bdepois\b|\be\b)\s+/i).map((p) => p.trim()).filter(Boolean)
  // "coloca relógio e clima": a parte sem verbo usa o verbo da anterior
  const acts = parts.map((p, i) => rule(p) ?? (i > 0 ? rule(parts[i - 1].split(/\s+/)[0] + " " + p) : null))
  if (!acts.length || acts.some((a) => !a)) {
    const one = rule(text)
    return one ? [one] : null
  }
  return acts as Action[]
}

/* ---------------- IA local ---------------- */
export const AI_MODELS = {
  small: { id: "onnx-community/Qwen2.5-0.5B-Instruct", label: "Rápida (~450 MB)" },
  big: { id: "onnx-community/Qwen2.5-1.5B-Instruct", label: "Mais esperta (~1,2 GB)" },
} as const
export type AiModel = keyof typeof AI_MODELS

let worker: Worker | null = null
let seq = 0
let idle: ReturnType<typeof setTimeout> | undefined
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void; prog?: (pct: number, msg: string) => void }>()
function getWorker() {
  clearTimeout(idle)
  if (worker) return worker
  worker = new LlmWorker()
  worker.onmessage = (e) => {
    const { id, progress, result, error } = e.data
    const p = pending.get(id)
    if (!p) return
    if (progress) return p.prog?.(progress.pct, progress.msg)
    pending.delete(id)
    error ? p.rej(new Error(error)) : p.res(result)
    // devolve a memória do modelo depois de 3 min sem uso
    if (!pending.size) idle = setTimeout(() => { worker?.terminate(); worker = null }, 180_000)
  }
  worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || "a IA parou")); pending.clear(); worker?.terminate(); worker = null }
  return worker
}
function callLlm<T>(msg: Record<string, any>, prog?: (pct: number, msg: string) => void) {
  const id = ++seq
  return new Promise<T>((res, rej) => { pending.set(id, { res, rej, prog }); getWorker().postMessage({ ...msg, id, ort: new URL("ort/", location.href).href }) })
}
export const preloadAi = (model: AiModel, prog?: (pct: number, msg: string) => void) => callLlm<{ device: string }>({ type: "load", model: AI_MODELS[model].id }, prog)

const widgetList = () => (Object.keys({ clock: 1, stopwatch: 1, weather: 1, news: 1, photo: 1, calendar: 1, note: 1, music: 1, pcmusic: 1, cs2: 1, valorant: 1, football: 1, lyrics: 1, tasks: 1, discord: 1, ifood: 1, whatsapp: 1, finance: 1, agenda: 1, musicstats: 1, gaming: 1, musicclip: 1, valagent: 1, sysmon: 1 }) as WidgetType[])

function systemPrompt() {
  const st = useStore.getState()
  const have = [...new Set(st.widgets.map((w) => w.type))].join(", ") || "nenhum"
  return `Você é o assistente do Agenda, um app de área de trabalho. Responda SOMENTE com um JSON no formato:
{"acoes":[...], "resposta":"frase curta em português"}
Ações possíveis:
{"acao":"arrumar","estilo":"centro|esquerda|direita|topo"} - organiza/encaixa todos os widgets
{"acao":"adicionar","widget":"<tipo>"} - adiciona um widget
{"acao":"remover","widget":"<tipo>"} - remove um widget
{"acao":"abrir","aba":"<aba>"} - abre uma aba do app
{"acao":"tema","tema":"glass|metal|retro|terminal|minimal","escuro":true|false,"cor":"#rrggbb"} - muda a aparência (use só os campos pedidos)
{"acao":"travar","ligado":true|false} - trava ou destrava os widgets
{"acao":"responder","texto":"..."} - quando for só uma pergunta ou não houver ação
Tipos de widget: ${widgetList().join(", ")}
Abas: ${SECTIONS.map((s) => `${s.id} (${s.label})`).join(", ")}
Widgets na tela agora: ${have}
Exemplos:
Pedido: deixa tudo organizado e coloca um relógio
{"acoes":[{"acao":"adicionar","widget":"clock"},{"acao":"arrumar","estilo":"centro"}],"resposta":"Pronto: coloquei um relógio e organizei os widgets."}
Pedido: quero ver meus gastos
{"acoes":[{"acao":"abrir","aba":"finance"}],"resposta":"Abrindo Finanças."}
Pedido: deixa com cara de computador antigo
{"acoes":[{"acao":"tema","tema":"retro"}],"resposta":"Tema retrô aplicado."}`
}

function parseJson(text: string): { acoes: Action[]; resposta: string } | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}")
  if (a < 0 || b <= a) return null
  try {
    const j = JSON.parse(text.slice(a, b + 1))
    return { acoes: Array.isArray(j.acoes) ? j.acoes : [], resposta: typeof j.resposta === "string" ? j.resposta : "" }
  } catch { return null }
}

/** só deixa passar ações válidas (a IA pequena às vezes inventa) */
function validate(a: any): Action | null {
  if (!a || typeof a !== "object") return null
  const types = widgetList()
  switch (a.acao) {
    case "arrumar": return { acao: "arrumar", estilo: ["centro", "esquerda", "direita", "topo"].includes(a.estilo) ? a.estilo : "centro" }
    case "adicionar": case "remover": return types.includes(a.widget) ? { acao: a.acao, widget: a.widget } : null
    case "abrir": return SECTIONS.some((s) => s.id === a.aba) ? { acao: "abrir", aba: a.aba } : null
    case "tema": {
      const o: any = { acao: "tema" }
      if (["glass", "metal", "retro", "terminal", "minimal"].includes(a.tema)) o.tema = a.tema
      if (typeof a.escuro === "boolean") o.escuro = a.escuro
      if (typeof a.cor === "string" && /^#[0-9a-f]{6}$/i.test(a.cor)) o.cor = a.cor
      return o.tema || o.escuro != null || o.cor ? o : null
    }
    case "travar": return { acao: "travar", ligado: a.ligado !== false }
    case "responder": return typeof a.texto === "string" && a.texto ? { acao: "responder", texto: a.texto.slice(0, 600) } : null
  }
  return null
}

/* ---------------- executar ---------------- */
export interface Result { said: string; did: string[]; undo?: () => void; usedAi: boolean; device?: string }

function run(acts: Action[]): { did: string[]; undo?: () => void } {
  const st = useStore.getState()
  const before: { widgets: Widget[]; settings: typeof st.settings } = { widgets: st.widgets, settings: st.settings }
  const did: string[] = []
  let changed = false
  const label = (t: WidgetType) => (W_WORDS.find(([w]) => w === t)?.[1][0] ?? t)
  // adicionar/remover antes de arrumar, para o encaixe já contar com eles
  const order = [...acts].sort((a, b) => (a.acao === "arrumar" ? 1 : 0) - (b.acao === "arrumar" ? 1 : 0))
  for (const a of order) {
    const s = useStore.getState()
    if (a.acao === "arrumar") { arrangeWidgets(a.estilo); did.push("Organizei os widgets" + (a.estilo && a.estilo !== "centro" ? ` (${a.estilo})` : "")); changed = true }
    else if (a.acao === "adicionar") { s.addWidget(a.widget); did.push(`Adicionei: ${label(a.widget)}`); changed = true }
    else if (a.acao === "remover") {
      const w = [...s.widgets].reverse().find((x) => x.type === a.widget)
      if (w) { s.removeWidget(w.id); did.push(`Tirei: ${label(a.widget)}`); changed = true } else did.push(`Não tem widget de ${label(a.widget)} na tela`)
    } else if (a.acao === "abrir") { s.openWindow(a.aba); did.push(`Abri ${SECTIONS.find((x) => x.id === a.aba)?.label}`) }
    else if (a.acao === "tema") {
      if (a.tema) s.applyTheme(a.tema)
      const p: any = {}
      if (a.escuro != null) p.dark = a.escuro
      if (a.cor) p.accent = a.cor
      if (Object.keys(p).length) useStore.getState().setSettings(p)
      did.push("Mudei a aparência"); changed = true
    } else if (a.acao === "travar") { s.setSettings({ widgetsLocked: a.ligado }); did.push(a.ligado ? "Widgets travados" : "Widgets destravados"); changed = true }
  }
  return { did, undo: changed ? () => useStore.setState({ widgets: before.widgets, settings: before.settings }) : undefined }
}

export async function ask(text: string, model: AiModel, useAi: boolean, prog?: (pct: number, msg: string) => void): Promise<Result> {
  const quick = parseByRules(text)
  if (quick) {
    const r = run(quick)
    return { said: r.did.join(". ") + ".", did: r.did, undo: r.undo, usedAi: false }
  }
  if (!useAi) return { said: "Não entendi esse pedido. Ligue a IA local para pedidos mais livres, ou tente algo como “arruma os widgets”, “coloca um relógio”, “abre finanças”, “tema escuro”.", did: [], usedAi: false }
  const out = await callLlm<{ text: string; device: string }>({
    type: "chat", model: AI_MODELS[model].id, maxTokens: 220,
    messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: "Pedido: " + text }],
  }, prog)
  const j = parseJson(out.text)
  if (!j) return { said: out.text.trim().slice(0, 600) || "Não consegui entender.", did: [], usedAi: true, device: out.device }
  const acts = j.acoes.map(validate).filter(Boolean) as Action[]
  const talk = acts.filter((a) => a.acao === "responder").map((a) => (a as any).texto as string)
  const r = run(acts.filter((a) => a.acao !== "responder"))
  const said = j.resposta || talk.join(" ") || (r.did.length ? r.did.join(". ") + "." : "Não encontrei o que fazer com esse pedido.")
  return { said, did: r.did, undo: r.undo, usedAi: true, device: out.device }
}
