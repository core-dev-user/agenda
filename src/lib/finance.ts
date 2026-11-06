/**
 * Finanças: leitura de extratos e faturas (OFX, CSV/TXT, PDF ou texto colado) e categorização automática.
 * Tudo roda no seu PC: nenhum dado sai do computador.
 */
import { uid } from "./utils"

export type AccountKind = "checking" | "card"
export interface FinAccount { id: string; name: string; kind: AccountKind; color: string; last4?: string }
export type CatKind = "expense" | "income" | "ignore"
export interface FinCategory { id: string; name: string; emoji: string; color: string; kind: CatKind; budget?: number }
export interface Txn {
  id: string
  accountId: string
  /** data da compra/lançamento (AAAA-MM-DD) */
  date: string
  /** mês em que conta (AAAA-MM): no cartão é o mês da fatura */
  month: string
  desc: string
  /** descrição normalizada (usada nas regras) */
  key: string
  /** negativo = saída, positivo = entrada */
  amount: number
  categoryId: string
  /** escolhida por você (não muda sozinha) */
  manual?: boolean
  /** não reconhecida: aparece em "a revisar" */
  review?: boolean
  installment?: { n: number; total: number }
  note?: string
  fitid?: string
  importId?: string
}
export interface FinRule { id: string; match: string; categoryId: string; createdAt: number }
export interface FinImport { id: string; at: number; accountId: string; name: string; count: number; month?: string }
export interface FinData {
  v: 1
  accounts: FinAccount[]
  categories: FinCategory[]
  rules: FinRule[]
  txns: Txn[]
  imports: FinImport[]
}

export const ITAU = "#ec7000"
export const defaultData = (): FinData => ({
  v: 1,
  accounts: [
    { id: "conta", name: "Itaú · Conta", kind: "checking", color: ITAU },
    { id: "cartao1", name: "Cartão 1", kind: "card", color: "#3987e5" },
    { id: "cartao2", name: "Cartão 2", kind: "card", color: "#9085e9" },
  ],
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  rules: [],
  txns: [],
  imports: [],
})

export const DEFAULT_CATEGORIES: FinCategory[] = [
  { id: "mercado", name: "Mercado", emoji: "🛒", color: "#1baf7a", kind: "expense" },
  { id: "delivery", name: "Delivery e restaurantes", emoji: "🍔", color: "#eb6834", kind: "expense" },
  { id: "transporte", name: "Transporte", emoji: "🚗", color: "#2a78d6", kind: "expense" },
  { id: "moradia", name: "Moradia e contas", emoji: "🏠", color: "#eda100", kind: "expense" },
  { id: "saude", name: "Saúde", emoji: "💊", color: "#e34948", kind: "expense" },
  { id: "assinaturas", name: "Assinaturas", emoji: "📺", color: "#6250d6", kind: "expense" },
  { id: "jogos", name: "Jogos", emoji: "🎮", color: "#9085e9", kind: "expense" },
  { id: "compras", name: "Compras", emoji: "🛍️", color: "#e87ba4", kind: "expense" },
  { id: "lazer", name: "Lazer", emoji: "🎉", color: "#d95926", kind: "expense" },
  { id: "educacao", name: "Educação", emoji: "📚", color: "#256abf", kind: "expense" },
  { id: "cuidados", name: "Cuidados pessoais", emoji: "💈", color: "#d55181", kind: "expense" },
  { id: "pets", name: "Pets", emoji: "🐾", color: "#c98500", kind: "expense" },
  { id: "viagem", name: "Viagem", emoji: "✈️", color: "#199e70", kind: "expense" },
  { id: "taxas", name: "Impostos e tarifas", emoji: "🧾", color: "#8a8a8a", kind: "expense" },
  { id: "pix", name: "Pix e transferências", emoji: "↔️", color: "#5598e7", kind: "expense" },
  { id: "outros", name: "Outros", emoji: "📦", color: "#a0a0a0", kind: "expense" },
  { id: "receitas", name: "Salário e entradas", emoji: "💰", color: "#008300", kind: "income" },
  { id: "investimentos", name: "Investimentos", emoji: "📈", color: "#184f95", kind: "ignore" },
  { id: "fatura", name: "Pagamento de fatura", emoji: "💳", color: "#777777", kind: "ignore" },
]

/** palavras → categoria (comparadas na descrição normalizada) */
const KEYWORDS: [string, string[]][] = [
  ["fatura", ["pagamento fatura", "pagto fatura", "pag fatura", "fatura cartao", "itau cartao", "itau card", "pagamento efetuado", "pagamento recebido", "pgto fatura", "deb aut fatura", "credicard"]],
  ["investimentos", ["aplicacao", "aplic aut", "resgate", "cdb", "tesouro direto", "poupanca", "rdb", "lci", "lca", "fundo de invest", "corretora", "xp invest", "nuinvest", "rico invest", "btg pactual"]],
  ["receitas", ["salario", "pagto salario", "rend pago aplic", "remuneracao", "folha pagamento", "rend pago", "rendimento", "proventos", "dividendo", "13 salario", "ferias", "reembolso", "cashback", "estorno"]],
  ["delivery", ["ifood", "ifd ", "rappi", "ze delivery", "aiqfome", "mcdonald", "mc donald", "burger king", "bk ", "subway", "habibs", "outback", "starbucks", "pizzaria", "pizza", "restaurante", "lanchonete", "lanches", "hamburgueria", "churrascaria", "sushi", "cafeteria", "padaria", "bar e rest", "food", "giraffas", "spoleto", "china in box", "coco bambu", "madero", "popeyes", "kfc", "jeronimo", "bob s", "bobs"]],
  ["mercado", ["supermercado", "mercado", "carrefour", "atacadao", "assai", "pao de acucar", "extra hiper", "dia brasil", "hirota", "oba hortifruti", "hortifruti", "sams club", "makro", "tenda atacado", "mambo", "st marche", "zaffari", "big bompreco", "condor", "sonda", "savegnago", "guanabara", "mundial", "hipermercado", "atacado", "acougue", "sacolao", "quitanda", "emporio"]],
  ["transporte", ["uber", "99app", "99 app", "99 tecnologia", "99pop", "cabify", "indrive", "posto", "combustivel", "shell", "ipiranga", "petrobras", "br mania", "ale combust", "estacionamento", "estapar", "zona azul", "pedagio", "sem parar", "conectcar", "veloe", "metro", "cptm", "sptrans", "bilhete unico", "top recarga", "recarga transporte", "onibus", "auto pecas", "mecanica", "oficina", "lava rapido", "moovit"]],
  ["moradia", ["aluguel", "condominio", "enel", "light sa", "cemig", "copel", "cpfl", "celesc", "coelba", "energisa", "equatorial", "neoenergia", "sabesp", "cedae", "copasa", "sanepar", "embasa", "comgas", "naturgy", "ultragaz", "liquigas", "vivo", "claro", "tim ", "oi fibra", "net servicos", "internet", "telefonica", "iptu", "seguro resid", "quinto andar", "quintoandar", "imobiliaria", "leroy merlin", "telhanorte", "casa e video", "tok stok", "etna", "mobly"]],
  ["saude", ["drogasil", "droga raia", "raia", "drogaria", "farmacia", "pague menos", "panvel", "drogao", "ultrafarma", "onofre", "unimed", "amil", "sulamerica", "bradesco saude", "hapvida", "notredame", "hospital", "laboratorio", "fleury", "lavoisier", "dasa", "clinica", "dentista", "odonto", "psicolog", "medico", "consulta", "academia", "smart fit", "smartfit", "bluefit", "gympass", "wellhub", "totalpass", "bodytech"]],
  ["assinaturas", ["netflix", "spotify", "disney", "hbo", "max.com", "hbomax", "prime video", "amazon prime", "primevideo", "youtube", "google youtube", "youtubepremium", "google one", "google storage", "icloud", "apple.com", "apple com bill", "crunchyroll", "deezer", "globoplay", "paramount", "star plus", "chatgpt", "openai", "claude.ai", "anthropic", "microsoft 365", "microsoft*", "office 365", "adobe", "canva", "notion", "dropbox", "tidal", "apple music", "twitch", "patreon", "discord nitro", "duolingo"]],
  ["jogos", ["steam", "steampowered", "valve", "epic games", "riot", "riot games", "playstation", "sony interactive", "psn", "xbox", "microsoft store", "nintendo", "nuuvem", "gamers club", "gamersclub", "faceit", "blizzard", "battle net", "ea games", "electronic arts", "ubisoft", "rockstar", "roblox", "garena", "hoyoverse", "eneba", "g2a", "green man", "kinguin", "csgoempire", "buff163"]],
  ["compras", ["amazon", "amzn", "mercadolivre", "mercado livre", "mercadopago", "meli", "shopee", "shein", "aliexpress", "alipay", "magalu", "magazine luiza", "americanas", "submarino", "casas bahia", "ponto frio", "kabum", "pichau", "terabyte", "fast shop", "renner", "c&a", "cea ", "riachuelo", "zara", "hering", "centauro", "netshoes", "decathlon", "nike", "adidas", "puma", "lojas", "shopping", "dafiti", "zattini", "paypal", "temu", "havan", "miniso", "daiso", "livraria cultura", "fnac"]],
  ["lazer", ["cinema", "cinemark", "cinepolis", "uci ", "kinoplex", "ingresso", "sympla", "eventim", "ticketmaster", "tickets for fun", "show", "teatro", "parque", "boliche", "karaoke", "balada", "clube", "museu", "bilheteria", "beer", "cervejaria", "choperia", "pub ", "adega", "tabacaria", "bar "]],
  ["educacao", ["escola", "faculdade", "universidade", "colegio", "curso", "udemy", "alura", "coursera", "rocketseat", "hotmart", "kiwify", "eduzz", "saraiva", "livraria", "kindle", "papelaria", "kalunga", "mensalidade", "material escolar", "ingles", "wizard", "ccaa", "fisk", "cna "]],
  ["cuidados", ["barbearia", "barber", "salao", "cabeleireiro", "boticario", "natura", "sephora", "avon", "eudora", "o boticario", "manicure", "estetica", "perfumaria", "beleza", "the beauty box", "quem disse berenice"]],
  ["pets", ["petz", "cobasi", "petlove", "pet shop", "petshop", "veterinari", "agropet", "racao"]],
  ["viagem", ["latam", "gol linhas", "gol transportes", "azul linhas", "azul viagens", "voeazul", "airbnb", "booking", "hotel", "pousada", "hostel", "decolar", "123milhas", "maxmilhas", "hurb", "buser", "clickbus", "rodoviaria", "localiza", "movida", "unidas", "smiles", "latam pass", "cvc", "trivago", "expedia"]],
  ["taxas", ["iof", "tarifa", "anuidade", "juros", "multa", "encargo", "mora", "darf", "ipva", "licenciamento", "detran", "das simples", "inss", "gps ", "imposto", "cesta de servicos", "pacote servicos", "manutencao conta", "seguro cartao", "taxa"]],
  ["pix", ["pix transf", "pix enviado", "pix qrs", "pix qr", "transf pix", "pix", "ted ", "doc ", "transferencia", "transf ", "sispag"]],
]

/** texto → chave sem acentos, minúsculo, sem números de parcela/datas */
export function normalize(desc: string) {
  return desc
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(parc(ela)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, " ")
    .replace(/[^a-z0-9&.* ]+/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
const pad = (s: string) => ` ${s.replace(/[.*]/g, " ")} `

/** escolhe a categoria: primeiro as regras que você ensinou (a mais específica vence), depois as palavras conhecidas */
export function categorize(key: string, amount: number, rules: FinRule[], cats: FinCategory[]): { categoryId: string; review: boolean } {
  const own = rules.filter((r) => r.match && key.includes(r.match)).sort((a, b) => b.match.length - a.match.length)[0]
  if (own && cats.some((c) => c.id === own.categoryId)) return { categoryId: own.categoryId, review: false }
  const k = pad(key)
  // a palavra conhecida MAIS LONGA vence ("mercado livre" é Compras, não Mercado; "amazon prime" é Assinatura)
  let best: { cat: string; len: number } | null = null
  for (const [cat, words] of KEYWORDS) {
    if (!cats.some((c) => c.id === cat)) continue
    for (const w of words) {
      const ww = w.trim()
      // palavras curtas só valem como palavra inteira
      if ((ww.length <= 4 ? k.includes(pad(ww)) : k.includes(ww.replace(/[.*]/g, " "))) && (!best || ww.length > best.len)) best = { cat, len: ww.length }
    }
  }
  if (best) {
    // "pix" recebido é entrada
    if (best.cat === "pix" && amount > 0) return { categoryId: "receitas", review: true }
    return { categoryId: best.cat, review: false }
  }
  if (amount > 0) return { categoryId: cats.some((c) => c.id === "receitas") ? "receitas" : cats[0].id, review: true }
  return { categoryId: cats.some((c) => c.id === "outros") ? "outros" : cats[0].id, review: true }
}

/* ---------------------------------------------------------------- leitura ---------------------------------------------------------------- */

export interface Parsed { date: string; desc: string; amount: number; fitid?: string; installment?: { n: number; total: number } }
export interface ParseResult { rows: Parsed[]; kindHint?: AccountKind; format: string; /** valores de fatura vêm positivos: inverter */ cardPositive?: boolean; warnings: string[] }

const MES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }
const z2 = (n: number) => String(n).padStart(2, "0")

/** "1.234,56" / "-1234.56" / "R$ 12,00-" / "12,00 D" → número */
export function money(s: string): number | null {
  let t = s.replace(/R\$|\s/g, "").trim()
  let neg = false
  if (/^-|^−/.test(t)) { neg = true; t = t.slice(1) }
  if (/-$|D$/i.test(t)) { neg = true; t = t.slice(0, -1) }
  if (/C$/i.test(t)) t = t.slice(0, -1)
  if (/^-/.test(t)) { neg = !neg; t = t.slice(1) }
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(,\d{3})*\.\d{1,2}$|^\d+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, "")
  else return null
  const n = Number(t)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

function installmentOf(desc: string) {
  const m = desc.match(/(?:parc(?:ela)?\.?\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i) || desc.match(/parc(?:ela)?\.?\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i)
  if (!m) return undefined
  const n = +m[1], total = +m[2]
  return n >= 1 && total >= 2 && n <= total && total <= 48 ? { n, total } : undefined
}

/** OFX (o "Money" que os bancos exportam) */
export function parseOFX(txt: string): ParseResult {
  const rows: Parsed[] = []
  const blocks = txt.split(/<STMTTRN>/i).slice(1)
  const tag = (b: string, t: string) => { const m = b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, "i")); return m ? m[1].trim() : "" }
  for (const b0 of blocks) {
    const b = b0.split(/<\/STMTTRN>/i)[0]
    const d = tag(b, "DTPOSTED")
    const amt = money(tag(b, "TRNAMT").replace(",", "."))
    if (!/^\d{8}/.test(d) || amt == null) continue
    const desc = [tag(b, "NAME"), tag(b, "MEMO")].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || tag(b, "TRNTYPE")
    rows.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, desc, amount: amt, fitid: tag(b, "FITID") || undefined, installment: installmentOf(desc) })
  }
  return { rows, kindHint: /<CCSTMTRS>|CREDITCARD/i.test(txt) ? "card" : "checking", format: "OFX", warnings: [] }
}

/** CSV ou TXT com separador ; , ou tab */
export function parseCSV(txt: string): ParseResult {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim())
  const delim = [";", "\t", ","].map((d) => [d, lines.slice(0, 20).reduce((a, l) => a + (l.split(d).length - 1), 0)] as const).sort((a, b) => b[1] - a[1])[0][0]
  const split = (l: string) => {
    const out: string[] = []
    let cur = "", q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if (ch === delim && !q) { out.push(cur.trim()); cur = "" }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const rows: Parsed[] = []
  const warnings: string[] = []
  for (const l of lines) {
    const cells = split(l)
    const di = cells.findIndex((c) => /^\d{2}\/\d{2}\/\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(c))
    if (di < 0) continue
    const date = toISO(cells[di])
    if (!date) continue
    // valor: última célula numérica com centavos que não seja a data (a última costuma ser saldo quando há 2)
    const nums = cells.map((c, i) => ({ i, v: i === di ? null : /\d[.,]\d{2}\s*-?$/.test(c) || /^-?\s*R?\$?\s*\d/.test(c) ? money(c) : null })).filter((x) => x.v != null)
    if (!nums.length) continue
    const amt = nums.length >= 2 && /saldo/i.test(lines[0]) ? nums[0] : nums[0]
    const desc = cells.filter((_, i) => i !== di && !nums.some((n) => n.i === i)).sort((a, b) => b.length - a.length)[0] || ""
    if (/^saldo|saldo (anterior|do dia|final)/i.test(desc)) continue
    rows.push({ date, desc, amount: amt.v!, installment: installmentOf(desc) })
  }
  if (!rows.length) warnings.push("Não encontrei lançamentos (data + descrição + valor) nesse arquivo.")
  return { rows, format: "CSV", warnings, cardPositive: rows.length > 0 && rows.filter((r) => r.amount > 0).length > rows.length * 0.7 }
}

function toISO(s: string, yearHint?: number): string | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : yearHint ?? new Date().getFullYear()
    const mo = +m[2], d = +m[1]
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return `${y}-${z2(mo)}-${z2(d)}`
  }
  m = s.match(/^(\d{1,2})\s*(?:de\s*)?([a-zç]{3})[a-zç]*\.?(?:\s*(?:de\s*)?(\d{4}))?$/i)
  if (m && MES[m[2].toLowerCase()]) return `${m[3] ?? yearHint ?? new Date().getFullYear()}-${z2(MES[m[2].toLowerCase()])}-${z2(+m[1])}`
  return null
}

const SKIP = /^(total|subtotal|saldo|vencimento|limite|pagamento m[ií]nimo|valor m[ií]nimo|melhor data|fatura anterior|cr[eé]dito rotativo|cet\b|taxa de juros|juros do rotativo|encargos (m[aá]ximos|previstos)|data|lan[cç]amentos|descri[cç][aã]o|valor|resumo|demonstrativo|previs[aã]o)/i
const STOP = /(pr[oó]xima[s]? fatura|compras parceladas\s*-?\s*pr[oó]ximas|lan[cç]amentos futuros|simula[cç][aã]o)/i

/** Texto livre (colado do app/site do banco ou extraído do PDF). Uma linha pode ter mais de um lançamento (PDF em 2 colunas). */
export function parseText(txt: string): ParseResult {
  const years = [...txt.matchAll(/\b\d{2}\/\d{2}\/(20\d{2})\b/g)].map((m) => +m[1])
  const yearHint = years.length ? years.sort((a, b) => years.filter((y) => y === b).length - years.filter((y) => y === a).length)[0] : undefined
  const DATE = String.raw`(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?)`
  const AMT = String.raw`((?:-|−)?\s?(?:R\$\s?)?(?:-|−)?\s?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?[-DC])?)`
  const re = new RegExp(`${DATE}\\s+(.+?)\\s+${AMT}(?=\\s|$)`, "gi")
  const rows: Parsed[] = []
  let card = /fatura|cart[aã]o de cr[eé]dito|mastercard|visa|elo\b|anuidade/i.test(txt)
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim()
    if (STOP.test(line)) break
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      const desc = m[2].replace(/\s+/g, " ").trim()
      if (!desc || SKIP.test(desc) || /\bsaldo\b/i.test(desc) || desc.length < 2) continue
      const date = toISO(m[1].replace(/\s+de\s+/i, " "), yearHint)
      const amount = money(m[3].replace(/−/g, "-"))
      if (!date || amount == null || amount === 0) continue
      rows.push({ date, desc, amount, installment: installmentOf(desc) })
    }
  }
  const positives = rows.filter((r) => r.amount > 0).length
  const cardPositive = rows.length > 0 && positives > rows.length * 0.7
  if (cardPositive) card = true
  return { rows, kindHint: card ? "card" : "checking", format: "Texto", cardPositive, warnings: rows.length ? [] : ["Não encontrei lançamentos. Cada linha precisa de data, descrição e valor (ex.: 05/11 MERCADO 123,45)."] }
}

/** PDF (extrato ou fatura) → texto em linhas, mantendo a ordem visual */
export async function pdfToText(buf: ArrayBuffer, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist")
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password, isEvalSupported: false }).promise
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = (tc.items as any[]).filter((i) => typeof i.str === "string" && i.str.trim()).map((i) => ({ s: i.str as string, x: i.transform[4] as number, y: i.transform[5] as number, w: (i.width as number) || 0 }))
    // agrupa por linha (mesma altura)
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: { y: number; items: typeof items }[] = []
    for (const it of items) {
      const l = lines.find((l) => Math.abs(l.y - it.y) < 2.5)
      if (l) l.items.push(it)
      else lines.push({ y: it.y, items: [it] })
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x)
      let s = ""
      let end = -1e9
      for (const it of l.items) {
        // espaço grande entre blocos = coluna nova: força separação
        s += (s ? (it.x - end > 30 ? "   " : it.x - end > 1.5 ? " " : "") : "") + it.s
        end = it.x + it.w
      }
      out.push(s)
    }
  }
  return out.join("\n")
}

export async function parseFile(f: File, password?: string): Promise<ParseResult & { text?: string }> {
  const name = f.name.toLowerCase()
  if (name.endsWith(".pdf")) {
    const text = await pdfToText(await f.arrayBuffer(), password)
    return { ...parseText(text), format: "PDF", text }
  }
  // bancos brasileiros às vezes salvam em latin1
  const buf = await f.arrayBuffer()
  let txt = new TextDecoder("utf-8").decode(buf)
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf)
  if (name.endsWith(".ofx") || /<OFX>|OFXHEADER/i.test(txt)) return parseOFX(txt)
  if (name.endsWith(".csv")) return parseCSV(txt)
  const c = parseCSV(txt)
  const t = parseText(txt)
  return c.rows.length >= t.rows.length ? c : t
}

/* ----------------------------------------------------------- montar lançamentos ----------------------------------------------------------- */

/** mês mais comum entre as compras à vista (é o mês "da fatura" na prática) */
export function guessMonth(rows: Parsed[]) {
  const cnt = new Map<string, number>()
  for (const r of rows) if (!r.installment || r.installment.n === 1) cnt.set(r.date.slice(0, 7), (cnt.get(r.date.slice(0, 7)) ?? 0) + 1)
  return [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().toISOString().slice(0, 7)
}

export const dupKey = (t: { accountId: string; date: string; amount: number; key: string; month: string; fitid?: string }) =>
  t.fitid ? `${t.accountId}|f|${t.fitid}` : `${t.accountId}|${t.month}|${t.date}|${t.amount.toFixed(2)}|${t.key}`

export function buildTxns(res: ParseResult, opts: { account: FinAccount; month?: string; flip: boolean; data: FinData; importId: string }) {
  const { account, data } = opts
  const existing = new Map<string, number>()
  for (const t of data.txns) { const k = dupKey(t); existing.set(k, (existing.get(k) ?? 0) + 1) }
  const seen = new Map<string, number>()
  return res.rows.map((r) => {
    const amount = Math.round((opts.flip ? -r.amount : r.amount) * 100) / 100
    const key = normalize(r.desc)
    const month = account.kind === "card" && opts.month ? opts.month : r.date.slice(0, 7)
    const c = categorize(key, amount, data.rules, data.categories)
    const t: Txn = { id: uid(), accountId: account.id, date: r.date, month, desc: r.desc, key, amount, categoryId: c.categoryId, review: c.review, installment: r.installment, fitid: r.fitid, importId: opts.importId }
    // repetido: mesmo lançamento já importado (conta quantas vezes aparece para não sumir com compras iguais no mesmo dia)
    const k = dupKey(t)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return { t, dup: n <= (existing.get(k) ?? 0) }
  })
}

/* ----------------------------------------------------------- números ----------------------------------------------------------- */

export const ym = (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}`
export const addMonths = (m: string, k: number) => { const [y, mo] = m.split("-").map(Number); return ym(new Date(y, mo - 1 + k, 1)) }

export function summary(data: FinData, month: string) {
  const kind = new Map(data.categories.map((c) => [c.id, c.kind]))
  const list = data.txns.filter((t) => t.month === month)
  let income = 0, expense = 0
  const byCat = new Map<string, number>()
  for (const t of list) {
    const k = kind.get(t.categoryId) ?? "expense"
    if (k === "ignore") continue
    if (k === "income") { income += t.amount; continue }
    // despesa: saídas somam, estornos (positivos) abatem
    expense += -t.amount
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) - t.amount)
  }
  return { list, income, expense, balance: income - expense, byCat }
}

/** gastos que se repetem todo mês (assinaturas, contas fixas) */
export function recurring(data: FinData, month: string) {
  const kind = new Map(data.categories.map((c) => [c.id, c.kind]))
  const months = [addMonths(month, -2), addMonths(month, -1), month]
  const g = new Map<string, Txn[]>()
  for (const t of data.txns) {
    if (t.amount >= 0 || !months.includes(t.month) || kind.get(t.categoryId) !== "expense" || t.installment || t.categoryId === "pix") continue
    const k = t.key.split(" ").slice(0, 3).join(" ")
    g.set(k, [...(g.get(k) ?? []), t])
  }
  const out: { key: string; name: string; amount: number; months: number; categoryId: string }[] = []
  for (const [k, ts] of g) {
    const ms = new Set(ts.map((t) => t.month))
    const subs = ts[0].categoryId === "assinaturas" || ts[0].categoryId === "moradia"
    if (ms.size < (subs ? 2 : 3) || ts.length > ms.size + 1) continue
    const vals = ts.map((t) => -t.amount)
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    if (vals.some((v) => Math.abs(v - avg) > avg * (subs ? 0.25 : 0.1) + 1)) continue
    const last = ts.sort((a, b) => b.date.localeCompare(a.date))[0]
    out.push({ key: k, name: last.desc, amount: -last.amount, months: ms.size, categoryId: last.categoryId })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

export function toCSV(data: FinData) {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]))
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]))
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  return ["data;mes;conta;descricao;categoria;valor", ...data.txns.map((t) => [t.date, t.month, esc(acc.get(t.accountId) ?? ""), esc(t.desc), esc(cat.get(t.categoryId) ?? ""), t.amount.toFixed(2).replace(".", ",")].join(";"))].join("\r\n")
}
