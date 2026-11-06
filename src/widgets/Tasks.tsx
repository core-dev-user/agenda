import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Plus, Trash2, X } from "lucide-react"
import { useStore } from "@/lib/store"
import type { Task, Widget } from "@/lib/types"
import { cn, todayISO, uid } from "@/lib/utils"

/* ------------------------------ datas ------------------------------ */
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return todayISO(d) }
const dayDiff = (iso: string) => Math.round((+new Date(iso + "T12:00") - +new Date(todayISO() + "T12:00")) / 86400000)

export function dayLabel(iso?: string) {
  if (!iso) return "Sem data"
  const n = dayDiff(iso)
  if (n === 0) return "Hoje"
  if (n === 1) return "Amanhã"
  if (n === -1) return "Ontem"
  const d = new Date(iso + "T12:00")
  const base = `${WD[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase().slice(0, 3)}`
  return n > 1 && n < 7 ? base.split(",")[0].replace(/^./, (c) => c.toUpperCase()) + ` ${d.getDate()}` : base
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
/**
 * Entende datas escritas no texto da tarefa e tira elas do título:
 * "hoje", "amanhã", "depois de amanhã", "sexta", "dia 12", "12/11", "15h", "15:30", "às 9".
 */
export function parseTask(text: string, fallbackDate?: string) {
  let t = ` ${text} `
  let date: string | undefined
  let time: string | undefined
  const n = () => norm(t)
  const cut = (re: RegExp) => { const m = n().match(re); if (m && m.index != null) { t = t.slice(0, m.index) + " " + t.slice(m.index + m[0].length); return m } return null }

  let m: RegExpMatchArray | null
  if ((m = cut(/\s(as\s|às\s)?(\d{1,2})(?::|h)(\d{2})?h?(?=\s)/))) time = `${m[2].padStart(2, "0")}:${m[3] ?? "00"}`
  else if ((m = cut(/\s(as|às)\s(\d{1,2})(?=\s)/))) time = `${m[2].padStart(2, "0")}:00`
  if (time && Number(time.slice(0, 2)) > 23) time = undefined

  const today = todayISO()
  if (cut(/\sdepois de amanha(?=\s)/)) date = addDays(today, 2)
  else if (cut(/\samanha(?=\s)/)) date = addDays(today, 1)
  else if (cut(/\shoje(?=\s)/)) date = today
  else if ((m = cut(/\s(?:dia\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear()
    date = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    if (!m[3] && date < today) date = `${y + 1}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  } else if ((m = cut(/\sdia\s(\d{1,2})(?=\s)/))) {
    const d = new Date(); const day = Number(m[1])
    if (day < d.getDate()) d.setMonth(d.getMonth() + 1)
    d.setDate(day)
    date = todayISO(d)
  } else {
    const names = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"]
    const re = new RegExp(`\\s(?:na |no |proxim[ao] )?(${names.join("|")})(?:-feira)?(?=\\s)`)
    if ((m = cut(re))) {
      const target = names.indexOf(m[1])
      let k = (target - new Date().getDay() + 7) % 7
      if (k === 0) k = 7
      date = addDays(today, k)
    }
  }
  const title = t.replace(/\s+/g, " ").trim()
  return { title, date: date ?? fallbackDate, time, detected: !!date || !!time }
}

/* ------------------------------ mini calendário ------------------------------ */
function MonthPicker({ value, onPick, marks }: { value?: string; onPick: (iso: string | undefined) => void; marks: Set<string> }) {
  const [ref, setRef] = useState(() => new Date((value ?? todayISO()) + "T12:00"))
  const y = ref.getFullYear(), mo = ref.getMonth()
  const first = new Date(y, mo, 1).getDay()
  const days = new Date(y, mo + 1, 0).getDate()
  const today = todayISO()
  return (
    <div className="w-[230px] p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <button className="btn btn-ghost btn-icon !p-1" onClick={() => setRef(new Date(y, mo - 1, 1))}><ChevronLeft size={13} /></button>
        <div className="text-sm font-semibold">{MONTHS[mo]} {y}</div>
        <button className="btn btn-ghost btn-icon !p-1" onClick={() => setRef(new Date(y, mo + 1, 1))}><ChevronRight size={13} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px] text-fg-muted uppercase">{["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: first }, (_, i) => <div key={"e" + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
          return (
            <button
              key={iso}
              onClick={() => onPick(iso)}
              className={cn("font-num relative h-7 rounded-md text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]", iso === today && "font-bold text-brand", iso === value && "!bg-brand !text-white")}
            >
              {i + 1}
              {marks.has(iso) && iso !== value && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand" />}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1">
        {[["Hoje", today], ["Amanhã", addDays(today, 1)], ["Sem data", undefined]].map(([l, v]) => (
          <button key={l as string} className="btn flex-1 !px-1 !py-1 text-[11px]" onClick={() => onPick(v as string | undefined)}>{l}</button>
        ))}
      </div>
    </div>
  )
}

function Popover({ open, onClose, children, align = "left" }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={onClose} />
          <motion.div
            className={cn("surface absolute top-full z-50 mt-1", align === "right" ? "right-0" : "left-0")}
            style={{ background: "color-mix(in srgb, #1b1220 92%, transparent)" }}
            initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}
            data-nodrag
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

const COLORS = ["#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff", "#ff6b6b"]

/* ------------------------------ uma tarefa ------------------------------ */
function TaskRow({ t, showDate, marks }: { t: Task; showDate: boolean; marks: Set<string> }) {
  const setKey = useStore((s) => s.set)
  const upd = (p: Partial<Task>) => setKey("tasks", (ts) => ts.map((x) => (x.id === t.id ? { ...x, ...p } : x)))
  const [edit, setEdit] = useState(false)
  const [pick, setPick] = useState(false)
  const late = !t.done && t.date && (t.date < todayISO() || (t.date === todayISO() && t.time && t.time < new Date().toTimeString().slice(0, 5)))
  const color = t.color ?? "var(--accent)"
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20, height: 0 }}
      className="group relative flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]"
    >
      <motion.button
        whileTap={{ scale: 0.8 }}
        onClick={() => upd({ done: !t.done, doneAt: t.done ? undefined : Date.now() })}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{ borderColor: color, background: t.done ? color : "transparent" }}
        title={t.done ? "Desmarcar" : "Concluir"}
      >
        {t.done && <Check size={11} strokeWidth={3.5} className="text-white" />}
      </motion.button>
      <div className="min-w-0 flex-1">
        {edit ? (
          <input
            autoFocus
            className="w-full bg-transparent text-[13.5px] outline-none"
            defaultValue={t.title}
            onBlur={(e) => { upd({ title: e.target.value.trim() || t.title }); setEdit(false) }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <div onDoubleClick={() => setEdit(true)} className={cn("text-[13.5px] leading-snug break-words transition-colors", t.done && "text-fg-muted line-through")}>{t.title}</div>
        )}
        {!t.done && (
          <div className={cn("relative mt-0.5 items-center gap-1.5 text-[11px]", showDate || t.time || late || pick ? "flex" : "hidden group-hover:flex")}>
            <button className={cn("flex items-center gap-1 rounded-md px-1 hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]", late ? "text-[#ff6b6b]" : "text-fg-muted")} onClick={() => setPick(true)} title="Mudar a data">
              {(showDate || late || !t.time) && <><CalendarDays size={10} /> {showDate || late ? dayLabel(t.date) : "mudar dia / horário"}</>}
              {t.time && <><Clock size={10} className="ml-0.5" /> {t.time}</>}
            </button>
            <Popover open={pick} onClose={() => setPick(false)}>
              <MonthPicker value={t.date} marks={marks} onPick={(v) => { upd({ date: v, notified: false }); setPick(false) }} />
              <div className="flex items-center gap-2 border-t border-line px-2.5 py-2 text-xs">
                <Clock size={12} className="text-fg-muted" />
                <input type="time" className="field !px-1.5 !py-0.5 text-xs" value={t.time ?? ""} onChange={(e) => upd({ time: e.target.value || undefined, notified: false })} />
                {t.time && <button className="text-fg-muted hover:text-fg" onClick={() => upd({ time: undefined })}>sem horário</button>}
              </div>
              <div className="flex gap-1.5 border-t border-line px-2.5 py-2">
                {COLORS.map((c) => <button key={c} className={cn("h-4 w-4 rounded-full", t.color === c && "ring-2 ring-white")} style={{ background: c }} onClick={() => upd({ color: c })} />)}
              </div>
            </Popover>
          </div>
        )}
      </div>
      <button className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!text-red-400 hover:!opacity-100" onClick={() => setKey("tasks", (ts) => ts.filter((x) => x.id !== t.id))} title="Apagar"><Trash2 size={13} /></button>
    </motion.div>
  )
}

/* ------------------------------ widget ------------------------------ */
export function TasksWidget({ w }: { w: Widget }) {
  const tasks = useStore((s) => s.tasks)
  const setKey = useStore((s) => s.set)
  const [day, setDay] = useState<string | null>(null) // null = todas
  const [weekStart, setWeekStart] = useState(() => addDays(todayISO(), -1))
  const [text, setText] = useState("")
  const [draftDate, setDraftDate] = useState<string | undefined | null>(null) // null = segue o filtro
  const [pick, setPick] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const today = todayISO()

  const marks = useMemo(() => new Set(tasks.filter((t) => !t.done && t.date).map((t) => t.date!)), [tasks])
  const preview = text.trim() ? parseTask(text, draftDate === null ? day ?? undefined : draftDate) : null
  const targetDate = preview ? preview.date : draftDate === null ? day ?? undefined : draftDate

  const add = () => {
    const p = parseTask(text, draftDate === null ? day ?? undefined : draftDate)
    if (!p.title) return
    setKey("tasks", (ts) => [...ts, { id: uid(), title: p.title, date: p.date, time: p.time, done: false, createdAt: Date.now() }])
    setText("")
    setDraftDate(null)
  }

  // grupos
  const pending = tasks.filter((t) => !t.done)
  const byTime = (a: Task, b: Task) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.time ?? "99").localeCompare(b.time ?? "99") || a.createdAt - b.createdAt
  let groups: { key: string; label: string; items: Task[]; tone?: string }[]
  if (day) {
    groups = [{ key: day, label: dayLabel(day), items: pending.filter((t) => t.date === day).sort(byTime) }]
  } else {
    const late = pending.filter((t) => t.date && t.date < today).sort(byTime)
    const dated = pending.filter((t) => t.date && t.date >= today).sort(byTime)
    const map = new Map<string, Task[]>()
    for (const t of dated) map.set(t.date!, [...(map.get(t.date!) ?? []), t])
    groups = [
      ...(late.length ? [{ key: "late", label: "Atrasadas", items: late, tone: "#ff6b6b" }] : []),
      ...[...map.entries()].map(([k, v]) => ({ key: k, label: dayLabel(k), items: v })),
      ...(pending.some((t) => !t.date) ? [{ key: "none", label: "Algum dia", items: pending.filter((t) => !t.date) }] : []),
    ]
  }
  const done = tasks.filter((t) => t.done && (!day || t.date === day)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayCount = pending.filter((t) => t.date === today).length

  return (
    <div className="flex h-full flex-col p-3">
      {/* topo */}
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-tight font-semibold">Tarefas</div>
          <div className="text-[11px] text-fg-muted">{todayCount ? `${todayCount} para hoje` : "nada para hoje"} · {pending.length} pendentes</div>
        </div>
        <button className={cn("rounded-full px-2.5 py-1 text-xs transition-colors", !day ? "bg-brand text-white" : "text-fg-muted hover:text-fg")} onClick={() => setDay(null)}>Todas</button>
      </div>

      {/* semana */}
      {w.h >= 260 && (
        <div className="mb-2 flex items-center gap-1">
          <button className="btn btn-ghost btn-icon !p-0.5" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={13} /></button>
          <div className="grid flex-1 grid-cols-7 gap-1">
            {week.map((d) => {
              const dt = new Date(d + "T12:00")
              const sel = day === d
              const n = pending.filter((t) => t.date === d).length
              return (
                <button
                  key={d}
                  onClick={() => setDay(sel ? null : d)}
                  className={cn("relative flex flex-col items-center rounded-xl py-1 transition-colors", sel ? "bg-brand text-white" : d === today ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]")}
                >
                  <span className={cn("text-[9px] uppercase", sel ? "text-white/80" : "text-fg-muted")}>{WD[dt.getDay()]}</span>
                  <span className="font-num text-sm font-semibold">{dt.getDate()}</span>
                  <span className="flex h-1 gap-0.5">{Array.from({ length: Math.min(3, n) }, (_, i) => <span key={i} className={cn("h-1 w-1 rounded-full", sel ? "bg-white" : "bg-brand")} />)}</span>
                </button>
              )
            })}
          </div>
          <button className="btn btn-ghost btn-icon !p-0.5" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={13} /></button>
        </div>
      )}

      {/* adicionar */}
      <form className="relative mb-2" onSubmit={(e) => { e.preventDefault(); add() }} data-nodrag>
        <div className="field flex items-center gap-1.5 !py-1.5">
          <Plus size={14} className="shrink-0 text-fg-muted" />
          <input
            ref={input}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder={day ? `Tarefa para ${dayLabel(day).toLowerCase()}…` : "Nova tarefa… (ex.: dentista amanhã 15h)"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className={cn("flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]", targetDate ? "bg-brand/20 text-fg" : "text-fg-muted hover:text-fg")} onClick={() => setPick(true)} title="Escolher o dia no calendário">
            <CalendarDays size={12} /> {targetDate ? dayLabel(targetDate) : "dia"}{preview?.time ? ` ${preview.time}` : ""}
          </button>
        </div>
        <Popover open={pick} onClose={() => setPick(false)} align="right">
          <MonthPicker value={targetDate} marks={marks} onPick={(v) => { setDraftDate(v); setPick(false); input.current?.focus() }} />
        </Popover>
      </form>

      {/* lista */}
      <div className="min-h-0 flex-1 overflow-auto pr-0.5" data-nodrag>
        {groups.every((g) => g.items.length === 0) && (
          <div className="py-6 text-center text-sm text-fg-muted">
            {day ? `Nada marcado para ${dayLabel(day).toLowerCase()}.` : "Nenhuma tarefa pendente."}
          </div>
        )}
        <AnimatePresence initial={false}>
          {groups.filter((g) => g.items.length).map((g) => (
            <motion.div key={g.key} layout className="mb-1.5">
              {!day && <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: g.tone ?? "var(--fg-muted)" }}>{g.label}</div>}
              <AnimatePresence initial={false}>
                {g.items.map((t) => <TaskRow key={t.id} t={t} showDate={g.key === "late"} marks={marks} />)}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
        {done.length > 0 && (
          <div className="mt-1 border-t border-line pt-1">
            <button className="flex w-full items-center gap-1 px-2 py-1 text-[11px] text-fg-muted hover:text-fg" onClick={() => setShowDone(!showDone)}>
              <Check size={11} /> Concluídas ({done.length}) <span className="ml-auto">{showDone ? "esconder" : "mostrar"}</span>
            </button>
            <AnimatePresence initial={false}>
              {showDone && done.slice(0, 30).map((t) => <TaskRow key={t.id} t={t} showDate={false} marks={marks} />)}
            </AnimatePresence>
            {showDone && done.length > 0 && (
              <button className="flex items-center gap-1 px-2 py-1 text-[11px] text-fg-muted hover:text-red-400" onClick={() => setKey("tasks", (ts) => ts.filter((t) => !(t.done && (!day || t.date === day))))}>
                <X size={11} /> limpar concluídas
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
