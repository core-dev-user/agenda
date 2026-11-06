import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowDown, ArrowUp, Banknote, Briefcase, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardPaste, FileText, MapPin,
  Paperclip, Pencil, Plus, Receipt, Search, Trash2, X, Camera,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import type { Service } from "@/lib/types"
import { brl, cn, MONTHS, todayISO, uid } from "@/lib/utils"
import { Card, Empty, Modal, Segmented, ThemedButton } from "@/components/ui/controls"

type Status = "pago" | "parcial" | "pendente" | "atrasado"
export const statusOf = (s: Service): Status =>
  s.paid >= s.value && s.value > 0 ? "pago" : s.dueDate && s.dueDate < todayISO() ? "atrasado" : s.paid > 0 ? "parcial" : "pendente"
const STATUS_STYLE: Record<Status, { label: string; c: string; words: string }> = {
  pago: { label: "Pago", c: "#5ee3a1", words: "pago recebido" },
  parcial: { label: "Parcial", c: "#ffd36e", words: "parcial parcialmente recebido" },
  pendente: { label: "Pendente", c: "#9aa4ff", words: "pendente a receber" },
  atrasado: { label: "Atrasado", c: "#ff6b8b", words: "atrasado vencido a receber" },
}
const fmtDate = (d?: string) => (d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "")
const attachCount = (s: Service) => (s.receipts?.length ?? 0) + (s.invoices?.length ?? 0) + (s.photos?.length ?? 0)
type SortCol = "date" | "client" | "service" | "value" | "status"

/* números de um conjunto de serviços */
const sums = (list: Service[]) => {
  const total = list.reduce((a, s) => a + s.value, 0)
  const paid = list.reduce((a, s) => a + Math.min(s.paid, s.value), 0)
  return { count: list.length, total, paid, pending: total - paid }
}

export default function Services() {
  const services = useStore((s) => s.services)
  const setKey = useStore((s) => s.set)
  const [ref, setRef] = useState(() => new Date())
  const [scope, setScope] = useState<"month" | "year" | "all" | "range">("month")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Status | "">("")
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "date", dir: -1 })
  const [edit, setEdit] = useState<Service | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const y = ref.getFullYear(), m = ref.getMonth()
  const prefix = scope === "month" ? `${y}-${String(m + 1).padStart(2, "0")}` : scope === "year" ? `${y}` : ""
  const inScope = (s: Service) => (scope === "range" ? (!from || s.date >= from) && (!to || s.date <= to) : s.date.startsWith(prefix))

  const scoped = services.filter(inScope)
  const cur = sums(scoped)
  const late = scoped.filter((s) => statusOf(s) === "atrasado").reduce((a, s) => a + (s.value - s.paid), 0)

  // comparação: mês anterior e melhor mês (como na referência)
  const byMonth = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of services) map.set(s.date.slice(0, 7), [...(map.get(s.date.slice(0, 7)) ?? []), s])
    return new Map([...map].map(([k, v]) => [k, sums(v)]))
  }, [services])
  const prevKey = (() => { const d = new Date(y, m - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })()
  const prev = byMonth.get(prevKey)
  const best = (k: "count" | "total" | "paid") => [...byMonth.entries()].sort((a, b) => b[1][k] - a[1][k])[0]
  const change = (now: number, before: number) => (before === 0 ? (now === 0 ? null : { t: "novo", up: true }) : { t: `${now >= before ? "+" : "−"}${Math.round(Math.abs((now - before) / before) * 100)}%`, up: now >= before })

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return services
      .filter(inScope)
      .filter((s) => !filter || statusOf(s) === filter)
      .filter((s) => {
        if (!n) return true
        const st = STATUS_STYLE[statusOf(s)].words
        const hay = [s.client, s.description, s.category, s.address, s.notes, s.payMethod, brl(s.value), s.value.toFixed(2).replace(".", ","), fmtDate(s.date), fmtDate(s.payDate), st, attachCount(s) ? "comprovante nota fiscal fotos anexo" : ""].join(" ").toLowerCase()
        return hay.includes(n)
      })
      .sort((a, b) => {
        let r = 0
        if (sort.col === "date") r = a.date.localeCompare(b.date)
        if (sort.col === "client") r = a.client.localeCompare(b.client, "pt-BR", { sensitivity: "base" })
        if (sort.col === "service") r = (a.description || a.category).localeCompare(b.description || b.category, "pt-BR", { sensitivity: "base" })
        if (sort.col === "value") r = a.value - b.value
        if (sort.col === "status") r = statusOf(a).localeCompare(statusOf(b))
        return r * sort.dir
      })
  }, [services, scope, prefix, from, to, q, filter, sort])

  const byClient = useMemo(() => {
    const map = new Map<string, { open: number }>()
    for (const s of services) {
      const k = s.client || "Sem cliente"
      const e = map.get(k) ?? { open: 0 }
      e.open += Math.max(0, s.value - s.paid)
      map.set(k, e)
    }
    return [...map.entries()].filter(([, v]) => v.open > 0).sort((a, b) => b[1].open - a[1].open)
  }, [services])

  const yearBars = MONTHS.map((_, i) => {
    const v = byMonth.get(`${y}-${String(i + 1).padStart(2, "0")}`)
    return { t: v?.total ?? 0, p: v?.paid ?? 0 }
  })
  const maxBar = Math.max(1, ...yearBars.map((b) => b.t))

  const save = (s: Service) => {
    setKey("services", (all) => (all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [s, ...all]))
    setEdit(null)
  }
  const remove = (s: Service) => {
    if (!confirm(`Excluir o serviço de ${s.client || "—"}? Os dados e todos os anexos serão removidos.`)) return
    ;[...(s.receipts ?? []), ...(s.invoices ?? []), ...(s.photos ?? [])].forEach((f) => bridge.media.remove(f))
    setKey("services", (a) => a.filter((x) => x.id !== s.id))
    setViewId(null)
  }
  const blank = (): Service => ({ id: uid(), date: todayISO(), client: "", description: "", category: "", value: 0, paid: 0, dueDate: "", payMethod: "Pix", notes: "" })
  const viewing = services.find((s) => s.id === viewId)

  const th = (label: string, col: SortCol, align = "") => (
    <th className={cn("cursor-pointer select-none hover:text-fg", align, col === "date" && "p-3")} onClick={() => setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: col === "date" || col === "value" ? -1 : 1 }))}>
      <span className="inline-flex items-center gap-0.5">{label}{sort.col === col && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</span>
    </th>
  )
  const compareMonth = scope === "month"

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={scope} onChange={setScope} options={[{ value: "month", label: "Mês" }, { value: "year", label: "Ano" }, { value: "range", label: "Período" }, { value: "all", label: "Tudo" }]} />
        {(scope === "month" || scope === "year") && (
          <>
            <button className="btn btn-icon" onClick={() => setRef(scope === "month" ? new Date(y, m - 1, 1) : new Date(y - 1, m, 1))}><ChevronLeft size={16} /></button>
            <div className="font-display min-w-44 text-center text-xl font-semibold">{scope === "month" ? `${MONTHS[m]} ${y}` : y}</div>
            <button className="btn btn-icon" onClick={() => setRef(scope === "month" ? new Date(y, m + 1, 1) : new Date(y + 1, m, 1))}><ChevronRight size={16} /></button>
          </>
        )}
        {scope === "range" && (
          <div className="flex items-center gap-2 text-sm">
            de <input type="date" className="field !py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
            até <input type="date" className="field !py-1" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn btn-ghost !py-1 text-xs" disabled={!from && !to} onClick={() => { setFrom(""); setTo("") }}>Limpar período</button>
          </div>
        )}
        <div className="flex-1" />
        <ThemedButton size="sm" onClick={() => setEdit(blank())}><Plus size={15} /> Novo serviço</ThemedButton>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <StatCmp icon={<Briefcase size={15} />} label="Serviços" value={String(cur.count)} chg={compareMonth ? change(cur.count, prev?.count ?? 0) : null} prev={compareMonth ? String(prev?.count ?? 0) : undefined} best={compareMonth ? best("count") : undefined} bestFmt={(v) => String(v.count)} />
        <StatCmp icon={<CircleDollarSign size={15} />} label="Total realizado" value={brl(cur.total)} chg={compareMonth ? change(cur.total, prev?.total ?? 0) : null} prev={compareMonth ? brl(prev?.total ?? 0) : undefined} best={compareMonth ? best("total") : undefined} bestFmt={(v) => brl(v.total)} />
        <StatCmp icon={<CheckCircle2 size={15} />} label="Recebido" value={brl(cur.paid)} tone="#5ee3a1" chg={compareMonth ? change(cur.paid, prev?.paid ?? 0) : null} prev={compareMonth ? brl(prev?.paid ?? 0) : undefined} best={compareMonth ? best("paid") : undefined} bestFmt={(v) => brl(v.paid)} sub={cur.total ? `${Math.round((cur.paid / cur.total) * 100)}% do total` : undefined} />
        <StatCmp icon={<Banknote size={15} />} label="Falta receber" value={brl(cur.pending)} tone="#ffd36e" sub={late ? `${brl(late)} em atraso` : "nada em atraso"} subTone={late ? "#ff6b8b" : undefined} />
        <StatCmp icon={<Receipt size={15} />} label="Ticket médio" value={brl(cur.count ? cur.total / cur.count : 0)} />
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-4">
        <Card className="!p-0">
          <div className="flex items-center gap-2 border-b border-line p-3">
            <Search size={15} className="text-fg-muted" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Pesquisar por cliente, serviço, endereço, valor, data, status…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="field py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {list.length === 0 ? (
            services.length === 0 ? (
              <Empty icon="💼" title="Seu primeiro serviço começa aqui">
                <div className="max-w-sm text-sm">Cadastre um trabalho para acompanhar o pagamento e guardar comprovantes, notas e fotos.</div>
                <ThemedButton size="sm" onClick={() => setEdit(blank())}><Plus size={14} /> Novo serviço</ThemedButton>
              </Empty>
            ) : (
              <Empty icon="🔎" title="Nenhum serviço encontrado"><div className="text-sm">Revise a busca e os filtros.</div></Empty>
            )
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-fg-muted uppercase">
                <tr>{th("Data", "date")}{th("Cliente / Serviço", "client")}{th("Valor", "value", "text-right")}<th className="text-right">Falta</th>{th("Status", "status", "px-3")}<th /><th /></tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const st = STATUS_STYLE[statusOf(s)]
                  const n = attachCount(s)
                  return (
                    <tr key={s.id} className="group cursor-pointer border-t border-line hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]" onClick={() => setViewId(s.id)}>
                      <td className="font-num p-3 text-fg-muted">{new Date(s.date + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</td>
                      <td className="py-2">
                        <div className="font-medium">{s.client || "—"}</div>
                        <div className="text-xs text-fg-muted">{s.description}{s.category && ` · ${s.category}`}{s.address && <span className="ml-1 inline-flex items-center gap-0.5"><MapPin size={10} />{s.address}</span>}</div>
                      </td>
                      <td className="font-num text-right">{brl(s.value)}</td>
                      <td className="font-num text-right">{s.value - s.paid > 0 ? brl(s.value - s.paid) : "—"}</td>
                      <td className="px-3"><span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: st.c + "26", color: st.c }}>{st.label}</span></td>
                      <td className="text-xs text-fg-muted">{n > 0 && <span className="inline-flex items-center gap-0.5" title="Anexos"><Paperclip size={11} />{n}</span>}</td>
                      <td className="pr-3 whitespace-nowrap opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        {statusOf(s) !== "pago" && <button title="Marcar como pago" className="p-1 hover:text-[#5ee3a1]" onClick={() => save({ ...s, paid: s.value, payDate: s.payDate || todayISO() })}><CheckCircle2 size={15} /></button>}
                        <button title="Editar" className="p-1" onClick={() => setEdit(s)}><Pencil size={14} /></button>
                        <button title="Excluir" className="p-1 hover:text-red-400" onClick={() => remove(s)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-3 text-xs tracking-wide text-fg-muted uppercase">{y} — realizado × recebido</div>
            <div className="flex h-32 items-end gap-1">
              {yearBars.map((b, i) => (
                <button key={i} className="group relative flex h-full flex-1 flex-col justify-end" onClick={() => { setRef(new Date(y, i, 1)); setScope("month") }} title={`${MONTHS[i]}: ${brl(b.t)} / recebido ${brl(b.p)}`}>
                  <motion.div className={cn("relative w-full rounded-t-sm", i === m && scope === "month" && "ring-1 ring-brand")} initial={{ height: 0 }} animate={{ height: `${(b.t / maxBar) * 100}%` }} style={{ background: "color-mix(in srgb, var(--fg) 16%, transparent)" }}>
                    <div className="absolute bottom-0 w-full rounded-t-sm bg-[#5ee3a1]" style={{ height: b.t ? `${(b.p / b.t) * 100}%` : 0 }} />
                  </motion.div>
                  <span className="mt-1 text-center text-[9px] text-fg-muted">{MONTHS[i][0]}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <div className="mb-2 text-xs tracking-wide text-fg-muted uppercase">Quem ainda deve</div>
            {byClient.length === 0 ? <div className="text-sm text-fg-muted">Tudo recebido 🎉</div> : byClient.map(([c, v]) => (
              <button key={c} className="flex w-full justify-between border-b border-line py-1.5 text-left text-sm last:border-0 hover:text-brand" onClick={() => { setQ(c); setScope("all") }}>
                <span className="truncate">{c}</span><span className="font-num text-[#ffd36e]">{brl(v.open)}</span>
              </button>
            ))}
          </Card>
        </div>
      </div>

      {edit && <ServiceEditor s={edit} onSave={save} onClose={() => setEdit(null)} clients={[...new Set(services.map((s) => s.client).filter(Boolean))]} cats={[...new Set(services.map((s) => s.category).filter(Boolean))]} />}
      {viewing && <ServiceDetail s={viewing} onClose={() => setViewId(null)} onSave={(s) => setKey("services", (all) => all.map((x) => (x.id === s.id ? s : x)))} onEdit={() => setEdit(viewing)} onDelete={() => remove(viewing)} />}
    </div>
  )
}

function StatCmp({ icon, label, value, tone, sub, subTone, chg, prev, best, bestFmt }: {
  icon: React.ReactNode; label: string; value: string; tone?: string; sub?: string; subTone?: string
  chg?: { t: string; up: boolean } | null; prev?: string; best?: [string, ReturnType<typeof sums>]; bestFmt?: (v: ReturnType<typeof sums>) => string
}) {
  return (
    <Card className="min-w-0 !p-3">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-fg-muted uppercase">{icon}{label}</div>
      <div className="font-num mt-1 truncate text-2xl font-semibold" style={{ color: tone }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: subTone ?? "var(--fg-muted)" }}>{sub}</div>}
      {prev !== undefined && (
        <div className="mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-[11px] text-fg-muted">
          <div className="flex items-center gap-1">Anterior <span className="font-num text-fg">{prev}</span>{chg && <span className="ml-auto font-semibold" style={{ color: chg.up ? "#5ee3a1" : "#ff6b8b" }}>{chg.t}</span>}</div>
          {best && bestFmt && (
            <div className="flex items-center gap-1" title={`Melhor resultado em ${MONTHS[Number(best[0].slice(5)) - 1]} de ${best[0].slice(0, 4)}`}>
              Melhor <span className="font-num text-fg">{bestFmt(best[1])}</span><span className="ml-auto">{MONTHS[Number(best[0].slice(5)) - 1].slice(0, 3).toLowerCase()}/{best[0].slice(2, 4)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/* ------------------------- ficha do serviço ------------------------- */
function ServiceDetail({ s, onClose, onSave, onEdit, onDelete }: { s: Service; onClose: () => void; onSave: (s: Service) => void; onEdit: () => void; onDelete: () => void }) {
  const [notes, setNotes] = useState(s.notes)
  const st = STATUS_STYLE[statusOf(s)]
  const open = Math.max(0, s.value - s.paid)
  return (
    <Modal open onClose={() => { if (notes !== s.notes) onSave({ ...s, notes }); onClose() }} title={<span className="flex items-center gap-2">💼 {s.description || s.category || "Serviço"}</span>} width={760}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: st.c + "26", color: st.c }}>{open > 0 ? (statusOf(s) === "atrasado" ? "Pagamento atrasado" : "Pagamento pendente") : "Pago"}</span>
          <span className="text-lg font-semibold">{s.client || "—"}</span>
          <div className="flex-1" />
          {open > 0 && <button className="btn !py-1 text-xs" onClick={() => onSave({ ...s, paid: s.value, payDate: s.payDate || todayISO() })}><CheckCircle2 size={13} /> Marcar como pago</button>}
          <button className="btn !py-1 text-xs" onClick={onEdit}><Pencil size={13} /> Editar</button>
          <button className="btn !py-1 text-xs hover:!text-red-400" onClick={onDelete}><Trash2 size={13} /></button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Info label="Data do serviço" value={fmtDate(s.date)} />
          <Info label="Valor" value={brl(s.value)} />
          <Info label="Recebido" value={s.paid > 0 ? `${brl(Math.min(s.paid, s.value))}${s.payDate ? ` · ${fmtDate(s.payDate)}` : ""}` : "Ainda não recebido"} tone={s.paid > 0 ? "#5ee3a1" : undefined} />
          <Info label="Falta" value={open > 0 ? brl(open) : "—"} tone={open > 0 ? "#ffd36e" : undefined} sub={s.dueDate && open > 0 ? `vence ${fmtDate(s.dueDate)}` : undefined} />
        </div>
        {(s.address || s.payMethod || s.category) && (
          <div className="flex flex-wrap gap-4 text-sm text-fg-muted">
            {s.address && <span className="flex items-center gap-1"><MapPin size={13} /> {s.address}</span>}
            {s.category && <span>🏷️ {s.category}</span>}
            {s.payMethod && <span>💳 {s.payMethod}</span>}
          </div>
        )}
        <div>
          <div className="mb-1 text-sm font-medium">Observações</div>
          <textarea className="field min-h-20 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anote detalhes importantes deste serviço." />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Attachments title="Comprovantes de pagamento" desc="Prints do Pix, recibos…" icon={<Receipt size={14} />} files={s.receipts ?? []} onChange={(f) => onSave({ ...s, notes, receipts: f })} />
          <Attachments title="Notas fiscais" desc="NF emitidas para este serviço" icon={<FileText size={14} />} files={s.invoices ?? []} onChange={(f) => onSave({ ...s, notes, invoices: f })} />
          <Attachments title="Fotos do serviço" desc="Antes, depois, detalhes" icon={<Camera size={14} />} files={s.photos ?? []} onChange={(f) => onSave({ ...s, notes, photos: f })} images />
        </div>
      </div>
    </Modal>
  )
}

function Info({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line p-2.5" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
      <div className="text-[10px] tracking-wide text-fg-muted uppercase">{label}</div>
      <div className="font-num mt-0.5 text-sm font-semibold" style={{ color: tone }}>{value}</div>
      {sub && <div className="text-[10px] text-fg-muted">{sub}</div>}
    </div>
  )
}

function Attachments({ title, desc, icon, files, onChange, images }: { title: string; desc: string; icon: React.ReactNode; files: string[]; onChange: (f: string[]) => void; images?: boolean }) {
  const add = async () => { const r = await bridge.media.attach(images ? "images" : "any"); if (r.length) onChange([...files, ...r.map((x) => x.file)]) }
  const paste = async () => { const r = await bridge.media.paste(); if (r.length) onChange([...files, ...r.map((x) => x.file)]) }
  return (
    <div className="rounded-xl border border-line p-2.5" onPaste={(e) => { e.preventDefault(); paste() }} tabIndex={0}>
      <div className="flex items-center gap-1.5 text-sm font-medium">{icon} {title}</div>
      <div className="mb-2 text-[11px] text-fg-muted">{desc}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {files.map((f) => (
          <div key={f} className="group relative">
            <button onClick={() => bridge.media.open(f)} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-black/20" title="Abrir">
              {/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f) ? <img src={mediaUrl(f)} className="h-full w-full object-cover" /> : <FileText size={20} className="text-fg-muted" />}
            </button>
            <button className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex" onClick={() => { bridge.media.remove(f); onChange(files.filter((x) => x !== f)) }}><X size={11} /></button>
          </div>
        ))}
        <button onClick={add} className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line text-fg-muted hover:text-fg" title="Anexar"><Plus size={16} /></button>
      </div>
      <button className="mt-1.5 flex items-center gap-1 text-[10px] text-fg-muted hover:text-fg" onClick={paste}><ClipboardPaste size={10} /> ou cole um print (Ctrl+V)</button>
    </div>
  )
}

/* ------------------------- formulário ------------------------- */
function L({ t, children, className }: { t: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("block text-sm", className)}><span className="text-fg-muted">{t}</span><div className="mt-1">{children}</div></label>
}

function ServiceEditor({ s, onSave, onClose, clients, cats }: { s: Service; onSave: (s: Service) => void; onClose: () => void; clients: string[]; cats: string[] }) {
  const [v, setV] = useState(s)
  const [err, setErr] = useState("")
  const f = (k: keyof Service) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value })
  const pay = v.paid >= v.value && v.value > 0 ? "pago" : v.paid > 0 ? "parcial" : "pendente"
  const setPay = (p: string) => setV({ ...v, paid: p === "pago" ? v.value : p === "pendente" ? 0 : v.paid || Math.round(v.value / 2), payDate: p === "pendente" ? "" : v.payDate || todayISO() })
  const submit = () => {
    if (!v.client.trim() || !(v.description.trim() || v.category.trim())) return setErr("Preencha o cliente e o tipo de serviço.")
    if (!(v.value >= 0)) return setErr("Informe um valor válido.")
    onSave({ ...v, client: v.client.trim() })
  }
  return (
    <Modal open onClose={onClose} title={s.client ? "Editar serviço" : "Novo serviço"} width={600}>
      <div className="mb-3 text-sm text-fg-muted">Preencha os dados do cliente e do serviço.</div>
      <div className="grid grid-cols-2 gap-3">
        <L t="Nome do cliente"><input autoFocus list="clients" className="field w-full" value={v.client} onChange={f("client")} /></L>
        <L t="Data do serviço"><input type="date" className="field w-full" value={v.date} onChange={f("date")} /></L>
        <L t="Tipo de serviço" className="col-span-2"><input className="field w-full" value={v.description} onChange={f("description")} placeholder="Ex.: Instalação elétrica, logo para loja, aula particular" /></L>
        <L t="Categoria"><input list="cats" className="field w-full" value={v.category} onChange={f("category")} placeholder="Ex.: Design, Manutenção" /></L>
        <L t="Endereço"><input className="field w-full" value={v.address ?? ""} onChange={f("address")} placeholder="Rua, número, bairro" /></L>
        <L t="Valor total (R$)"><input type="number" step="0.01" className="field font-num w-full" value={v.value || ""} onChange={f("value")} /></L>
        <L t="Pagamento">
          <select className="field w-full" value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="pendente">Pendente (a receber)</option>
            <option value="parcial">Parcial (recebi uma parte)</option>
            <option value="pago">Pago (recebido)</option>
          </select>
        </L>
        {pay === "parcial" && <L t="Valor já recebido (R$)"><input type="number" step="0.01" className="field font-num w-full" value={v.paid || ""} onChange={f("paid")} /></L>}
        {pay !== "pendente" && <L t="Data do pagamento"><input type="date" className="field w-full" value={v.payDate ?? ""} onChange={f("payDate")} /></L>}
        {pay !== "pago" && <L t="Vencimento do pagamento"><input type="date" className="field w-full" value={v.dueDate} onChange={f("dueDate")} /></L>}
        <L t="Forma de pagamento">
          <select className="field w-full" value={v.payMethod} onChange={f("payMethod")}>
            {["Pix", "Dinheiro", "Cartão", "Transferência", "Boleto", "Outro"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </L>
        <L t="Falta receber"><div className="font-num py-2 text-lg text-[#ffd36e]">{brl(Math.max(0, v.value - v.paid))}</div></L>
        <L t="Observações" className="col-span-2"><textarea className="field min-h-20 w-full" value={v.notes} onChange={f("notes")} placeholder="Anote detalhes importantes sobre este serviço" /></L>
      </div>
      <datalist id="clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      {err && <div className="mt-2 text-sm text-[#ff8f8f]">{err}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <ThemedButton onClick={submit}>{s.client ? "Salvar alterações" : "Cadastrar serviço"}</ThemedButton>
      </div>
    </Modal>
  )
}
