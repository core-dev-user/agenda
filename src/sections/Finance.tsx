import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardPaste, CreditCard, Download, Eye, EyeOff,
  FileUp, KeyRound, Landmark, Lock, Plus, Repeat, Search, ShieldCheck, Trash2, Undo2, Wallet, XCircle,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { useFinance, reapply } from "@/lib/financeStore"
import {
  addMonths, buildTxns, guessMonth, normalize, parseFile, parseText, recurring, summary, toCSV, ym,
  type FinAccount, type FinCategory, type FinData, type ParseResult, type Txn, categorize,
} from "@/lib/finance"
import { bridge } from "@/lib/bridge"
import { brl, cn, MONTHS, todayISO, uid } from "@/lib/utils"
import { Card, Empty, Modal, Segmented, ThemedButton } from "@/components/ui/controls"

// usado pelo modo de verificação (AGENDA_SHOT) para montar dados de exemplo
;(window as any).__finance = { useFinance, parseText, buildTxns, parseFile }

type Tab = "overview" | "txns" | "budgets" | "import" | "settings"
const monthLabel = (m: string, short = false) => { const [y, mo] = m.split("-").map(Number); const n = MONTHS[mo - 1]; return short ? `${n.slice(0, 3).toLowerCase()}/${String(y).slice(2)}` : `${n} ${y}` }
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** valores escondidos (R$ ••••) quando você ativa o olho */
function useMoney() {
  const hidden = useFinance((s) => s.hidden)
  return (n: number, signed = false) => (hidden ? "R$ ••••" : (signed && n > 0 ? "+" : "") + brl(n))
}

export default function Finance() {
  const status = useFinance((s) => s.status)
  const check = useFinance((s) => s.check)
  useEffect(() => { check() }, [])
  if (status === "idle") return <div className="flex h-full items-center justify-center text-sm text-fg-muted"><span className="animate-pulse">Abrindo o cofre…</span></div>
  if (status === "locked") return <LockScreen />
  return <FinanceMain />
}

/* ------------------------------------------------------------ cadeado ------------------------------------------------------------ */
function LockScreen() {
  const unlock = useFinance((s) => s.unlock)
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [shake, setShake] = useState(0)
  const go = async () => {
    const r = await unlock(pin)
    if (r.ok) return
    setPin("")
    setShake((n) => n + 1)
    setErr(r.error === "wait" || (r.waitMs ?? 0) > 0 ? `Muitas tentativas. Espere ${Math.ceil((r.waitMs ?? 0) / 1000)} s.` : "Senha incorreta.")
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.35 }} className="flex flex-col items-center gap-4">
        <img src="logos/financas.svg" className="h-20 w-20" draggable={false} />
        <div className="font-display text-xl font-semibold">Finanças bloqueadas</div>
        <input
          autoFocus type="password" inputMode="numeric" className="field w-56 text-center text-2xl tracking-[0.5em]" value={pin}
          onChange={(e) => { setPin(e.target.value); setErr("") }} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="••••"
        />
        <div className="h-4 text-sm" style={{ color: "#ff6b8b" }}>{err}</div>
        <ThemedButton onClick={go}><KeyRound size={15} /> Desbloquear</ThemedButton>
      </motion.div>
      <div className="flex items-center gap-1.5 text-xs text-fg-muted"><ShieldCheck size={13} /> Dados criptografados no seu PC, nada vai para a internet.</div>
    </div>
  )
}

/* ------------------------------------------------------------ principal ------------------------------------------------------------ */
function FinanceMain() {
  const [tab, setTab] = useState<Tab>("overview")
  const data = useFinance((s) => s.data)
  const hidden = useFinance((s) => s.hidden)
  const setHidden = useFinance((s) => s.setHidden)
  const hasPin = useFinance((s) => s.hasPin)
  const lock = useFinance((s) => s.lock)
  const latest = useMemo(() => data.txns.reduce((m, t) => (t.month > m ? t.month : m), ""), [data.txns])
  const [month, setMonth] = useState(() => latest || ym(new Date()))
  const [catFilter, setCatFilter] = useState("")
  const empty = data.txns.length === 0
  const reviewCount = data.txns.filter((t) => t.review).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Visão geral" },
            { value: "txns", label: <span className="flex items-center gap-1.5">Lançamentos{reviewCount > 0 && <span className="rounded-full bg-[#ffd36e] px-1.5 text-[10px] font-bold text-black">{reviewCount}</span>}</span> },
            { value: "budgets", label: "Orçamentos" },
            { value: "import", label: "Importar" },
            { value: "settings", label: "Ajustes" },
          ]}
        />
        {(tab === "overview" || tab === "txns" || tab === "budgets") && (
          <div className="flex items-center gap-1">
            <button className="btn btn-icon" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={16} /></button>
            <div className="font-display min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</div>
            <button className="btn btn-icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></button>
          </div>
        )}
        <div className="flex-1" />
        <button className="btn btn-icon" title={hidden ? "Mostrar valores" : "Esconder valores"} onClick={() => setHidden(!hidden)}>{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        {hasPin && <button className="btn btn-icon" title="Bloquear agora" onClick={lock}><Lock size={16} /></button>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {tab === "overview" && (empty ? <Welcome go={() => setTab("import")} /> : <Overview month={month} openCat={(c) => { setCatFilter(c); setTab("txns") }} goReview={() => { setCatFilter("review"); setTab("txns") }} />)}
            {tab === "txns" && <Txns month={month} catFilter={catFilter} setCatFilter={setCatFilter} />}
            {tab === "budgets" && <Budgets month={month} />}
            {tab === "import" && <Import done={(m) => { if (m) setMonth(m); setTab("overview") }} />}
            {tab === "settings" && <FinSettings />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Welcome({ go }: { go: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6 text-center">
      <img src="logos/financas.svg" className="mx-auto h-24 w-24" draggable={false} />
      <div className="font-display text-2xl font-semibold">Suas finanças, só no seu PC</div>
      <p className="text-fg-muted">Importe o extrato da conta Itaú e as faturas dos seus dois cartões. O Agenda separa tudo em categorias sozinho e aprende com as suas correções.</p>
      <div className="grid gap-3 text-left sm:grid-cols-3">
        {[
          { i: <Landmark size={18} />, t: "Extrato da conta", d: "No app ou site do Itaú, exporte o extrato em OFX (o mais preciso), PDF ou copie e cole." },
          { i: <CreditCard size={18} />, t: "Fatura do cartão", d: "Baixe a fatura em PDF ou copie os lançamentos e cole aqui. Funciona com os dois cartões." },
          { i: <ShieldCheck size={18} />, t: "100% local", d: "Sem senha do banco, sem servidor. Os dados ficam criptografados pela sua conta do Windows." },
        ].map((x) => (
          <Card key={x.t}><div className="mb-1 flex items-center gap-2 font-semibold">{x.i}{x.t}</div><div className="text-sm text-fg-muted">{x.d}</div></Card>
        ))}
      </div>
      <ThemedButton size="lg" onClick={go}><FileUp size={16} /> Importar agora</ThemedButton>
    </div>
  )
}

/* ------------------------------------------------------------ visão geral ------------------------------------------------------------ */
function Overview({ month, openCat, goReview }: { month: string; openCat: (id: string) => void; goReview: () => void }) {
  const data = useFinance((s) => s.data)
  const money = useMoney()
  const services = useStore((s) => s.services)
  const cur = useMemo(() => summary(data, month), [data, month])
  const prev = useMemo(() => summary(data, addMonths(month, -1)), [data, month])
  const cats = new Map(data.categories.map((c) => [c.id, c]))
  const byCat = [...cur.byCat].filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v), ...byCat.map(([id]) => cats.get(id)?.budget ?? 0))
  const rec = useMemo(() => recurring(data, month), [data, month])
  const review = cur.list.filter((t) => t.review).length
  const top = cur.list.filter((t) => t.amount < 0 && cats.get(t.categoryId)?.kind === "expense").sort((a, b) => a.amount - b.amount).slice(0, 5)
  const ifood = cur.list.filter((t) => t.key.includes("ifood") || t.key.includes("ifd")).reduce((a, t) => a - t.amount, 0)
  const servicesIn = services.filter((s) => (s.payDate || "").startsWith(month)).reduce((a, s) => a + Math.min(s.paid, s.value), 0)
  const delta = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null)
  const dExp = delta(cur.expense, prev.expense)

  return (
    <div className="space-y-5">
      {review > 0 && (
        <button className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm" style={{ borderColor: "#ffd36e66", background: "#ffd36e14" }} onClick={goReview}>
          <AlertTriangle size={15} color="#ffd36e" /> {review} lançamento{review > 1 ? "s" : ""} sem categoria certa neste mês. Clique para revisar (o app aprende com você).
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<ArrowDownRight size={15} />} label="Entradas" value={money(cur.income)} tone="#5ee3a1" sub={prev.income ? `mês anterior ${money(prev.income)}` : undefined} />
        <Tile icon={<ArrowUpRight size={15} />} label="Gastos" value={money(cur.expense)} tone="#ff8a6b" sub={dExp == null ? undefined : `${dExp > 0 ? "+" : ""}${dExp}% vs mês anterior`} subTone={dExp == null ? undefined : dExp > 0 ? "#ff6b8b" : "#5ee3a1"} />
        <Tile icon={<Wallet size={15} />} label="Saldo do mês" value={money(cur.balance, true)} tone={cur.balance >= 0 ? "#5ee3a1" : "#ff6b8b"} sub={cur.income ? `${Math.round((cur.expense / cur.income) * 100)}% das entradas gastos` : undefined} />
        <Tile icon={<Repeat size={15} />} label="Fixos por mês" value={money(rec.reduce((a, r) => a + r.amount, 0))} sub={`${rec.length} recorrente${rec.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <div className="font-semibold">Gastos por categoria</div>
            <div className="text-xs text-fg-muted">clique para ver os lançamentos</div>
          </div>
          {byCat.length === 0 ? <div className="py-6 text-center text-sm text-fg-muted">Nenhum gasto neste mês.</div> : (
            <div className="space-y-1">
              {byCat.map(([id, v]) => {
                const c = cats.get(id)
                const budget = c?.budget ?? 0
                const over = budget > 0 && v > budget
                return (
                  <button key={id} className="group grid w-full grid-cols-[160px_1fr_130px] items-center gap-3 rounded-lg px-1.5 py-1 text-left hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" onClick={() => openCat(id)} title={budget ? `Orçamento: ${brl(budget)}` : undefined}>
                    <span className="truncate text-sm">{c?.emoji} {c?.name ?? id}</span>
                    <span className="relative h-3.5">
                      <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-all" style={{ width: `${(v / maxCat) * 100}%`, background: over ? "#ff6b8b" : "var(--viz-1)", minWidth: 3 }} />
                      {budget > 0 && <span className="absolute -inset-y-1 w-0.5 rounded bg-fg" style={{ left: `${(budget / maxCat) * 100}%`, opacity: 0.55 }} />}
                    </span>
                    <span className="font-num text-right text-sm whitespace-nowrap">{money(v)} <span className="text-[10px] text-fg-muted">{Math.round((v / Math.max(1, cur.expense)) * 100)}%</span></span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-1 font-semibold">Últimos 6 meses</div>
          <MonthsChart month={month} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-2 font-semibold">Contas e cartões</div>
          <div className="space-y-2">
            {data.accounts.map((a) => {
              const ts = cur.list.filter((t) => t.accountId === a.id && cats.get(t.categoryId)?.kind === "expense")
              const total = ts.reduce((s, t) => s - t.amount, 0)
              return (
                <div key={a.id} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: a.color }}>{a.kind === "card" ? <CreditCard size={15} /> : <Landmark size={15} />}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm">{a.name}{a.last4 ? ` ·· ${a.last4}` : ""}</div><div className="text-[11px] text-fg-muted">{ts.length} gasto{ts.length === 1 ? "" : "s"}</div></div>
                  <span className="font-num text-sm">{money(total)}</span>
                </div>
              )
            })}
          </div>
          {(ifood > 0 || servicesIn > 0) && (
            <div className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-fg-muted">
              {ifood > 0 && <div className="flex justify-between"><span>🍔 iFood no mês</span><span className="font-num text-fg">{money(ifood)}</span></div>}
              {servicesIn > 0 && <div className="flex justify-between" title="Recebimentos marcados na aba Serviços (podem já estar no extrato)"><span>💼 Recebido em Serviços</span><span className="font-num text-fg">{money(servicesIn)}</span></div>}
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-2 font-semibold">Maiores gastos</div>
          {top.length === 0 ? <div className="text-sm text-fg-muted">—</div> : top.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1 text-sm">
              <span>{cats.get(t.categoryId)?.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{t.desc}</span>
              <span className="font-num">{money(-t.amount)}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-1.5 font-semibold"><Repeat size={14} /> Assinaturas e fixos</div>
          {rec.length === 0 ? <div className="text-sm text-fg-muted">Aparecem aqui quando um gasto se repete em 2 meses ou mais.</div> : rec.slice(0, 7).map((r) => (
            <div key={r.key} className="flex items-center gap-2 py-1 text-sm">
              <span>{cats.get(r.categoryId)?.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="font-num">{money(r.amount)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

function Tile({ icon, label, value, tone, sub, subTone }: { icon: React.ReactNode; label: string; value: string; tone?: string; sub?: string; subTone?: string }) {
  return (
    <Card className="min-w-0 !p-3">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-fg-muted uppercase">{icon}{label}</div>
      <div className="font-num mt-1 truncate text-2xl font-semibold" style={{ color: tone }}>{value}</div>
      {sub && <div className="truncate text-[11px]" style={{ color: subTone ?? "var(--fg-muted)" }}>{sub}</div>}
    </Card>
  )
}

/** Entradas × gastos nos últimos 6 meses (barras agrupadas, dica ao passar o mouse) */
function MonthsChart({ month }: { month: string }) {
  const data = useFinance((s) => s.data)
  const money = useMoney()
  const [hover, setHover] = useState<number | null>(null)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5))
  const vals = months.map((m) => { const s = summary(data, m); return { m, inc: s.income, exp: s.expense } })
  const max = Math.max(1, ...vals.flatMap((v) => [v.inc, v.exp]))
  const H = 150
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-1)" }} />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-2)" }} />Gastos</span>
      </div>
      <div className="relative">
        <div className="flex items-end gap-3 border-b border-line" style={{ height: H }}>
          {vals.map((v, i) => (
            <div key={v.m} className="relative flex h-full flex-1 cursor-default items-end justify-center gap-[2px]" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {hover === i && <div className="absolute inset-0 -mx-1 rounded-md bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" />}
              <div className="relative w-[38%] max-w-5 rounded-t-[4px]" style={{ height: `${(v.inc / max) * 100}%`, background: "var(--viz-1)", minHeight: v.inc ? 2 : 0 }} />
              <div className="relative w-[38%] max-w-5 rounded-t-[4px]" style={{ height: `${(v.exp / max) * 100}%`, background: "var(--viz-2)", minHeight: v.exp ? 2 : 0, outline: v.m === month ? "2px solid var(--fg)" : undefined, outlineOffset: 1 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-3 text-center text-[10px] text-fg-muted">{vals.map((v) => <div key={v.m} className={cn("flex-1", v.m === month && "font-semibold text-fg")}>{monthLabel(v.m, true)}</div>)}</div>
        {hover != null && (
          <div className="pointer-events-none absolute z-10 rounded-lg border border-line px-2.5 py-1.5 text-xs shadow-lg" style={{ background: "var(--field)", left: `${((hover + 0.5) / 6) * 100}%`, top: 0, transform: `translateX(${hover > 3 ? "-105%" : "8%"})` }}>
            <div className="mb-0.5 font-semibold">{monthLabel(vals[hover].m)}</div>
            <div className="flex justify-between gap-3"><span className="text-fg-muted">Entradas</span><span className="font-num">{money(vals[hover].inc)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-fg-muted">Gastos</span><span className="font-num">{money(vals[hover].exp)}</span></div>
            <div className="flex justify-between gap-3 border-t border-line pt-0.5"><span className="text-fg-muted">Saldo</span><span className="font-num">{money(vals[hover].inc - vals[hover].exp, true)}</span></div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ lançamentos ------------------------------------------------------------ */
function Txns({ month, catFilter, setCatFilter }: { month: string; catFilter: string; setCatFilter: (v: string) => void }) {
  const data = useFinance((s) => s.data)
  const update = useFinance((s) => s.update)
  const recategorize = useFinance((s) => s.recategorize)
  const money = useMoney()
  const [q, setQ] = useState("")
  const [acc, setAcc] = useState("")
  const [all, setAll] = useState(false)
  const [limit, setLimit] = useState(200)
  const [toast, setToast] = useState("")
  const [adding, setAdding] = useState(false)
  const cats = new Map(data.categories.map((c) => [c.id, c]))
  const accs = new Map(data.accounts.map((a) => [a.id, a]))
  const list = useMemo(() => {
    const n = normalize(q)
    return data.txns
      .filter((t) => all || t.month === month)
      .filter((t) => !acc || t.accountId === acc)
      .filter((t) => !catFilter || (catFilter === "review" ? t.review : t.categoryId === catFilter))
      .filter((t) => !n || t.key.includes(n) || t.desc.toLowerCase().includes(q.toLowerCase()) || brl(Math.abs(t.amount)).includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [data.txns, month, acc, catFilter, q, all])
  const total = list.reduce((a, t) => a + (cats.get(t.categoryId)?.kind === "ignore" ? 0 : t.amount), 0)

  const change = (t: Txn, cat: string) => {
    const n = recategorize(t.id, cat, true)
    const c = cats.get(cat)
    setToast(`Aprendido: "${t.desc.slice(0, 32)}" agora é ${c?.emoji} ${c?.name}${n ? ` (+${n} igua${n > 1 ? "is" : "l"} atualizado${n > 1 ? "s" : ""})` : ""}`)
    setTimeout(() => setToast(""), 3500)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted" /><input className="field !pl-8" placeholder="Buscar (loja, valor…)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)}>
          <option value="">Todas as contas</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="field !w-auto" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">Todas as categorias</option>
          <option value="review">⚠️ A revisar</option>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Todos os meses</label>
        <div className="flex-1" />
        <span className="text-sm text-fg-muted">{list.length} lançamentos · <span className="font-num text-fg">{money(total, true)}</span></span>
        <button className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Lançamento</button>
      </div>
      {catFilter === "review" && <div className="text-xs text-fg-muted">Escolha a categoria certa: o Agenda aprende e os próximos lançamentos iguais já chegam certos.</div>}
      {list.length === 0 ? <Empty icon="🧾" title="Nada por aqui">Mude os filtros ou importe um extrato.</Empty> : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] tracking-wide text-fg-muted uppercase" style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>
              <tr><th className="p-2.5">Data</th><th>Descrição</th><th>Conta</th><th>Categoria</th><th className="pr-3 text-right">Valor</th><th className="w-8" /></tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((t) => {
                const c = cats.get(t.categoryId)
                const a = accs.get(t.accountId)
                return (
                  <tr key={t.id} className="group border-t border-line hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
                    <td className="font-num p-2.5 text-fg-muted">{fmtDate(t.date)}</td>
                    <td className="max-w-[280px]">
                      <div className="truncate" title={t.desc}>{t.desc}</div>
                      {t.installment && <div className="text-[10px] text-fg-muted">parcela {t.installment.n} de {t.installment.total}</div>}
                    </td>
                    <td><span className="rounded-md px-1.5 py-0.5 text-[11px] text-white" style={{ background: a?.color ?? "#777" }}>{a?.name ?? "?"}</span></td>
                    <td>
                      <select className={cn("field !w-auto !py-0.5 text-xs", t.review && "!border-[#ffd36e]")} value={t.categoryId} onChange={(e) => change(t, e.target.value)}>
                        {data.categories.map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>)}
                      </select>
                      {t.review && <AlertTriangle size={12} className="ml-1 inline" color="#ffd36e" />}
                    </td>
                    <td className="font-num pr-3 text-right" style={{ color: c?.kind === "ignore" ? "var(--fg-muted)" : t.amount > 0 ? "#5ee3a1" : undefined }}>{money(t.amount, true)}</td>
                    <td><button className="btn btn-ghost btn-icon !p-1 opacity-0 group-hover:opacity-100" title="Excluir" onClick={() => update((d) => ({ ...d, txns: d.txns.filter((x) => x.id !== t.id) }))}><Trash2 size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length > limit && <button className="w-full border-t border-line py-2 text-sm text-fg-muted hover:text-fg" onClick={() => setLimit((l) => l + 300)}>Mostrar mais ({list.length - limit})</button>}
        </div>
      )}
      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="surface fixed bottom-24 left-1/2 z-[2000] -translate-x-1/2 px-4 py-2 text-sm">{toast}</motion.div>}
      </AnimatePresence>
      <ManualTxn open={adding} onClose={() => setAdding(false)} month={month} />
    </div>
  )
}

function ManualTxn({ open, onClose, month }: { open: boolean; onClose: () => void; month: string }) {
  const data = useFinance((s) => s.data)
  const update = useFinance((s) => s.update)
  const [f, setF] = useState({ date: todayISO(), desc: "", value: "", out: true, accountId: "conta", categoryId: "" })
  const save = () => {
    const v = Number(f.value.replace(/\./g, "").replace(",", "."))
    if (!f.desc.trim() || !Number.isFinite(v) || v === 0) return
    const amount = f.out ? -Math.abs(v) : Math.abs(v)
    const key = normalize(f.desc)
    const auto = categorize(key, amount, data.rules, data.categories)
    const acc = data.accounts.find((a) => a.id === f.accountId)
    const t: Txn = { id: uid(), accountId: f.accountId, date: f.date, month: acc?.kind === "card" ? month : f.date.slice(0, 7), desc: f.desc.trim(), key, amount, categoryId: f.categoryId || auto.categoryId, manual: !!f.categoryId }
    update((d) => ({ ...d, txns: [t, ...d.txns] }))
    setF({ ...f, desc: "", value: "" })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Novo lançamento" width={440}>
      <div className="space-y-3 text-sm">
        <Segmented value={f.out ? "out" : "in"} onChange={(v) => setF({ ...f, out: v === "out" })} options={[{ value: "out", label: "Gasto" }, { value: "in", label: "Entrada" }]} />
        <input className="field" placeholder="Descrição" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
        <div className="flex gap-2">
          <input className="field" placeholder="Valor (ex.: 49,90)" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <input type="date" className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <select className="field" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select className="field" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">Categoria automática</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end"><ThemedButton size="sm" onClick={save}>Adicionar</ThemedButton></div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ orçamentos ------------------------------------------------------------ */
export function budgetStatus(spent: number, budget: number) {
  const p = spent / budget
  if (p > 1) return { c: "#ff6b8b", label: "Estourou", icon: XCircle }
  if (p >= 0.8) return { c: "#ffd36e", label: "Perto do limite", icon: AlertTriangle }
  return { c: "#5ee3a1", label: "Dentro do limite", icon: CheckCircle2 }
}

function Budgets({ month }: { month: string }) {
  const data = useFinance((s) => s.data)
  const update = useFinance((s) => s.update)
  const money = useMoney()
  const cur = useMemo(() => summary(data, month), [data, month])
  const avg = (id: string) => { let s = 0; for (let i = 1; i <= 3; i++) s += summary(data, addMonths(month, -i)).byCat.get(id) ?? 0; return s / 3 }
  const setBudget = (id: string, v: number) => update((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, budget: v > 0 ? v : undefined } : c)) }))
  const exp = data.categories.filter((c) => c.kind === "expense")
  const totalBudget = exp.reduce((a, c) => a + (c.budget ?? 0), 0)
  return (
    <div className="space-y-4">
      <div className="text-sm text-fg-muted">Defina quanto quer gastar por mês em cada categoria. Você recebe um aviso quando chegar perto (80%) ou passar do limite.</div>
      {totalBudget > 0 && (
        <Card className="flex items-center gap-4">
          <div className="flex-1"><div className="text-xs text-fg-muted uppercase">Total planejado</div><div className="font-num text-xl font-semibold">{money(totalBudget)}</div></div>
          <div className="flex-1"><div className="text-xs text-fg-muted uppercase">Gasto nessas categorias</div><div className="font-num text-xl font-semibold">{money(exp.filter((c) => c.budget).reduce((a, c) => a + (cur.byCat.get(c.id) ?? 0), 0))}</div></div>
        </Card>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {exp.map((c) => {
          const spent = Math.max(0, cur.byCat.get(c.id) ?? 0)
          const st = c.budget ? budgetStatus(spent, c.budget) : null
          const a = avg(c.id)
          return (
            <Card key={c.id} className="!p-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{c.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="text-xs text-fg-muted">R$</span>
                <input
                  className="field !w-24 !py-0.5 text-right" inputMode="decimal" placeholder="sem limite" defaultValue={c.budget ? String(c.budget).replace(".", ",") : ""}
                  onBlur={(e) => setBudget(c.id, Number(e.target.value.replace(/\./g, "").replace(",", ".")) || 0)}
                />
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
                {c.budget ? <div className="h-full rounded-r-[4px]" style={{ width: `${Math.min(100, (spent / c.budget) * 100)}%`, background: st!.c }} /> : null}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-fg-muted">
                <span className="font-num">{money(spent)}{c.budget ? ` de ${money(c.budget)}` : ""}</span>
                {st ? <span className="flex items-center gap-1" style={{ color: st.c }}><st.icon size={12} />{st.label}</span> : a > 0 ? <span>média 3 meses: {money(a)}</span> : null}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ importar ------------------------------------------------------------ */
function Import({ done }: { done: (month?: string) => void }) {
  const data = useFinance((s) => s.data)
  const update = useFinance((s) => s.update)
  const money = useMoney()
  const [text, setText] = useState("")
  const [res, setRes] = useState<(ParseResult & { name: string }) | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [pwFile, setPwFile] = useState<File | null>(null)
  const [pw, setPw] = useState("")
  const [accountId, setAccountId] = useState("conta")
  const [month, setMonth] = useState("")
  const [flip, setFlip] = useState(false)
  const [cats, setCats] = useState<Record<number, string>>({})
  const [drag, setDrag] = useState(false)
  const inp = useRef<HTMLInputElement>(null)

  const accept = (r: ParseResult, name: string) => {
    setErr("")
    if (!r.rows.length) { setErr(r.warnings[0] ?? "Não encontrei lançamentos."); return }
    setRes({ ...r, name })
    const card = r.kindHint === "card"
    setAccountId(card ? data.accounts.find((a) => a.kind === "card")?.id ?? "conta" : data.accounts.find((a) => a.kind === "checking")?.id ?? "conta")
    setMonth(guessMonth(r.rows))
    setFlip(!!r.cardPositive)
    setCats({})
  }
  const readFile = async (f: File, password?: string) => {
    setBusy(true)
    try {
      const r = await parseFile(f, password)
      setPwFile(null); setPw("")
      accept(r, f.name)
    } catch (e: any) {
      if (e?.name === "PasswordException") { setPwFile(f); setErr(password ? "Senha do PDF incorreta." : "") }
      else setErr(`Não consegui ler "${f.name}": ${e?.message ?? e}`)
    }
    setBusy(false)
  }
  const account = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0]
  const importId = useMemo(() => uid(), [res])
  const built = useMemo(() => (res ? buildTxns(res, { account, month, flip, data, importId }) : []), [res, account, month, flip, data, importId])
  const fresh = built.filter((b) => !b.dup)
  const out = fresh.reduce((a, b) => a + (b.t.amount < 0 ? -b.t.amount : 0), 0)

  const confirmImport = () => {
    const txns = fresh.map((b, i) => (cats[built.indexOf(b)] ? { ...b.t, categoryId: cats[built.indexOf(b)], manual: true, review: false } : b.t)).map((t, i) => ({ ...t, id: t.id + i }))
    update((d) => ({ ...d, txns: [...txns, ...d.txns], imports: [{ id: importId, at: Date.now(), accountId, name: res!.name, count: txns.length, month: account.kind === "card" ? month : undefined }, ...d.imports] }))
    const m = txns.reduce((acc, t) => (t.month > acc ? t.month : acc), "")
    setRes(null); setText("")
    done(m || undefined)
  }

  if (res)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><div className="mb-1 text-xs text-fg-muted">Arquivo</div><div className="font-medium">{res.name} <span className="text-xs text-fg-muted">({res.format})</span></div></div>
          <div className="flex-1" />
          <label className="text-sm"><div className="mb-1 text-xs text-fg-muted">Conta ou cartão</div>
            <select className="field !w-auto" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          {account.kind === "card" && (
            <label className="text-sm"><div className="mb-1 text-xs text-fg-muted">Gastos contam no mês</div>
              <input type="month" className="field !w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
          )}
          <label className="flex items-center gap-1.5 pb-2 text-sm" title="Faturas de cartão listam as compras com valor positivo"><input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Valores positivos são gastos</label>
        </div>
        <Card className="flex flex-wrap gap-6 !p-3 text-sm">
          <span><b>{fresh.length}</b> novos</span>
          {built.length - fresh.length > 0 && <span className="text-fg-muted">{built.length - fresh.length} já importados (ignorados)</span>}
          <span>Gastos: <b className="font-num">{money(out)}</b></span>
          <span className="text-fg-muted">{fresh.filter((b) => b.t.review && !cats[built.indexOf(b)]).length} para revisar</span>
        </Card>
        <div className="max-h-[48vh] overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {built.map((b, i) => (
                <tr key={i} className={cn("border-t border-line first:border-0", b.dup && "opacity-40")}>
                  <td className="font-num p-2 text-fg-muted">{fmtDate(b.t.date)}</td>
                  <td className="max-w-[300px] truncate" title={b.t.desc}>{b.t.desc}{b.dup && <span className="ml-1.5 text-[10px]">(já importado)</span>}</td>
                  <td>
                    <select disabled={b.dup} className={cn("field !w-auto !py-0.5 text-xs", b.t.review && !cats[i] && "!border-[#ffd36e]")} value={cats[i] ?? b.t.categoryId} onChange={(e) => setCats({ ...cats, [i]: e.target.value })}>
                      {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                    </select>
                  </td>
                  <td className="font-num pr-3 text-right" style={{ color: b.t.amount > 0 ? "#5ee3a1" : undefined }}>{money(b.t.amount, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setRes(null)}>Cancelar</button>
          <ThemedButton disabled={!fresh.length} onClick={confirmImport}>Importar {fresh.length} lançamento{fresh.length === 1 ? "" : "s"}</ThemedButton>
        </div>
      </div>
    )

  return (
    <div className="space-y-5">
      <div
        className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors", drag ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-line")}
        onClick={() => inp.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f) }}
      >
        <FileUp size={30} className="opacity-70" />
        <div className="font-semibold">{busy ? "Lendo…" : "Solte aqui o extrato ou a fatura"}</div>
        <div className="text-sm text-fg-muted">OFX, PDF, CSV ou TXT, ou clique para escolher</div>
        <input ref={inp} type="file" accept=".ofx,.pdf,.csv,.txt,.qfx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = "" }} />
      </div>
      {pwFile && (
        <Card className="flex flex-wrap items-center gap-2">
          <KeyRound size={16} /> <span className="text-sm">Esse PDF tem senha (o Itaú costuma usar números do CPF).</span>
          <input type="password" className="field !w-48" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && readFile(pwFile, pw)} placeholder="Senha do PDF" autoFocus />
          <button className="btn" onClick={() => readFile(pwFile, pw)}>Abrir</button>
          <span className="w-full text-[11px] text-fg-muted">A senha é usada só para abrir o arquivo agora e não fica salva.</span>
        </Card>
      )}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><ClipboardPaste size={15} /> Ou cole o texto do extrato/fatura</div>
        <textarea className="field h-40 font-mono text-xs" placeholder={"05/11 IFOOD *RESTAURANTE 54,90\n06/11 UBER *TRIP 23,10\n07/11 PIX TRANSF MARIA -50,00"} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex justify-end"><button className="btn" disabled={!text.trim()} onClick={() => accept(parseText(text), "Texto colado")}>Ler texto</button></div>
      </div>
      {err && <div className="text-sm" style={{ color: "#ff6b8b" }}>{err}</div>}
      <Card className="text-sm">
        <div className="mb-1 font-semibold">Como tirar do Itaú</div>
        <ul className="list-disc space-y-1 pl-5 text-fg-muted">
          <li><b className="text-fg">Conta:</b> no Itaú pelo computador, abra o extrato, escolha o período e use <i>Salvar em OFX</i> (ou PDF). No app, você também pode copiar e colar.</li>
          <li><b className="text-fg">Cartões:</b> abra a fatura do cartão e baixe o <i>PDF</i>. Importe uma vez para cada cartão escolhendo &quot;Cartão 1&quot; ou &quot;Cartão 2&quot;.</li>
          <li>Pode importar o mesmo período de novo sem medo: lançamentos repetidos são ignorados.</li>
        </ul>
      </Card>
      {data.imports.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm font-semibold">Importações anteriores</div>
          <div className="space-y-1">
            {data.imports.slice(0, 15).map((im) => (
              <div key={im.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                <span className="min-w-0 flex-1 truncate">{im.name}</span>
                <span className="text-xs text-fg-muted">{data.accounts.find((a) => a.id === im.accountId)?.name} · {im.count} lanç. · {new Date(im.at).toLocaleDateString("pt-BR")}</span>
                <button className="btn btn-ghost !py-0.5 text-xs" title="Remove os lançamentos desta importação" onClick={() => confirm(`Desfazer a importação "${im.name}"?`) && update((d) => ({ ...d, txns: d.txns.filter((t) => t.importId !== im.id), imports: d.imports.filter((x) => x.id !== im.id) }))}><Undo2 size={12} /> Desfazer</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ ajustes ------------------------------------------------------------ */
function FinSettings() {
  const data = useFinance((s) => s.data)
  const update = useFinance((s) => s.update)
  const hasPin = useFinance((s) => s.hasPin)
  const check = useFinance((s) => s.check)
  const [pinOld, setPinOld] = useState("")
  const [pinNew, setPinNew] = useState("")
  const [msg, setMsg] = useState("")
  const setAcc = (id: string, p: Partial<FinAccount>) => update((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) }))
  const setCat = (id: string, p: Partial<FinCategory>) => update((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  const catName = new Map(data.categories.map((c) => [c.id, `${c.emoji} ${c.name}`]))

  const savePin = async () => {
    if (pinNew && pinNew.length < 4) { setMsg("Use pelo menos 4 dígitos."); return }
    const ok = await bridge.finance.setPin(pinOld, pinNew || null)
    setMsg(ok ? (pinNew ? "Senha definida. A aba pede a senha ao abrir o Agenda." : "Senha removida.") : "A senha atual não confere.")
    if (ok) { setPinOld(""); setPinNew(""); check() }
  }
  const exportCSV = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["﻿" + toCSV(data)], { type: "text/csv" }))
    a.download = `financas-${todayISO()}.csv`
    a.click()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <div className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck size={16} /> Segurança</div>
        <div className="mb-3 text-sm text-fg-muted">Os dados ficam só neste PC, criptografados pela sua conta do Windows. Com uma senha, a aba também pede a senha toda vez que o Agenda abre.</div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPin && <input type="password" className="field !w-40" placeholder="Senha atual" value={pinOld} onChange={(e) => setPinOld(e.target.value)} />}
          <input type="password" className="field !w-40" placeholder={hasPin ? "Nova senha (vazio = remover)" : "Criar senha (4+ dígitos)"} value={pinNew} onChange={(e) => setPinNew(e.target.value)} />
          <button className="btn" onClick={savePin}><KeyRound size={14} /> {hasPin ? "Trocar/remover" : "Definir senha"}</button>
          {msg && <span className="text-sm text-fg-muted">{msg}</span>}
        </div>
      </Card>

      <Card>
        <div className="mb-2 font-semibold">Contas e cartões</div>
        <div className="space-y-2">
          {data.accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <input type="color" value={a.color} onChange={(e) => setAcc(a.id, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent" />
              <input className="field flex-1" value={a.name} onChange={(e) => setAcc(a.id, { name: e.target.value })} />
              <input className="field !w-28" placeholder="final (4 díg.)" maxLength={4} value={a.last4 ?? ""} onChange={(e) => setAcc(a.id, { last4: e.target.value.replace(/\D/g, "") })} />
              <span className="w-20 text-xs text-fg-muted">{a.kind === "card" ? "cartão" : "conta"}</span>
              {data.accounts.length > 1 && <button className="btn btn-ghost btn-icon" title="Remover" onClick={() => confirm(`Remover "${a.name}" e os lançamentos dela?`) && update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id), txns: d.txns.filter((t) => t.accountId !== a.id) }))}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn !py-1 text-xs" onClick={() => update((d) => ({ ...d, accounts: [...d.accounts, { id: uid(), name: "Novo cartão", kind: "card", color: "#5598e7" }] }))}><Plus size={12} /> Cartão</button>
          <button className="btn !py-1 text-xs" onClick={() => update((d) => ({ ...d, accounts: [...d.accounts, { id: uid(), name: "Nova conta", kind: "checking", color: "#1baf7a" }] }))}><Plus size={12} /> Conta</button>
        </div>
      </Card>

      <Card>
        <div className="mb-2 font-semibold">Categorias</div>
        <div className="grid gap-1.5 md:grid-cols-2">
          {data.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5">
              <input className="field !w-11 !px-1 text-center" value={c.emoji} onChange={(e) => setCat(c.id, { emoji: e.target.value })} />
              <input className="field flex-1" value={c.name} onChange={(e) => setCat(c.id, { name: e.target.value })} />
              <select className="field !w-auto text-xs" value={c.kind} onChange={(e) => setCat(c.id, { kind: e.target.value as FinCategory["kind"] })} title="Gasto, entrada ou não contar (ex.: pagar a fatura, investir)">
                <option value="expense">gasto</option><option value="income">entrada</option><option value="ignore">não conta</option>
              </select>
              {!["outros", "receitas"].includes(c.id) && <button className="btn btn-ghost btn-icon !p-1" title="Excluir (lançamentos vão para Outros)" onClick={() => update((d) => reapply({ ...d, categories: d.categories.filter((x) => x.id !== c.id), rules: d.rules.filter((r) => r.categoryId !== c.id), txns: d.txns.map((t) => (t.categoryId === c.id ? { ...t, categoryId: "outros", manual: false } : t)) }))}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
        <button className="btn mt-2 !py-1 text-xs" onClick={() => update((d) => ({ ...d, categories: [...d.categories, { id: uid(), name: "Nova categoria", emoji: "🏷️", color: "#8a8a8a", kind: "expense" }] }))}><Plus size={12} /> Categoria</button>
      </Card>

      <Card>
        <div className="mb-1 font-semibold">O que o Agenda aprendeu</div>
        <div className="mb-2 text-sm text-fg-muted">Toda vez que você corrige uma categoria, vira uma regra. Apagar uma regra recategoriza o que ela tinha mudado.</div>
        {data.rules.length === 0 ? <div className="text-sm text-fg-muted">Nenhuma regra ainda.</div> : (
          <div className="max-h-64 space-y-1 overflow-auto">
            {[...data.rules].sort((a, b) => b.createdAt - a.createdAt).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">&quot;{r.match}&quot;</span>
                <span>→ {catName.get(r.categoryId) ?? "?"}</span>
                <button className="btn btn-ghost btn-icon !p-1" onClick={() => update((d) => reapply({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }))}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-wrap gap-2">
        <button className="btn" onClick={exportCSV}><Download size={14} /> Exportar planilha (CSV)</button>
        <button className="btn" style={{ color: "#ff6b8b" }} onClick={() => confirm("Apagar TODOS os lançamentos, regras e importações? (contas e categorias ficam)") && update((d: FinData) => ({ ...d, txns: [], rules: [], imports: [] }))}><Trash2 size={14} /> Apagar lançamentos</button>
      </Card>
    </div>
  )
}
