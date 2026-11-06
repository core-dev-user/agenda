import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Archive, Check, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Trash2 } from "lucide-react"
import { useStore } from "@/lib/store"
import type { Habit } from "@/lib/types"
import { cn, MONTHS, todayISO, uid, WEEKDAYS } from "@/lib/utils"
import { ColorPicker, Modal, Segmented, Stat, ThemedButton, Empty } from "@/components/ui/controls"

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

function streak(habitId: string, log: Record<string, string[]>) {
  let n = 0
  const d = new Date()
  if (!(log[todayISO(d)] ?? []).includes(habitId)) d.setDate(d.getDate() - 1)
  while ((log[todayISO(d)] ?? []).includes(habitId)) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export default function Habits() {
  const habits = useStore((s) => s.habits)
  const log = useStore((s) => s.habitLog)
  const toggle = useStore((s) => s.toggleHabit)
  const setKey = useStore((s) => s.set)
  const [ref, setRef] = useState(() => new Date())
  const [view, setView] = useState<"grid" | "calendar">("grid")
  const [edit, setEdit] = useState<Habit | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const y = ref.getFullYear(), m = ref.getMonth()
  const days = new Date(y, m + 1, 0).getDate()
  const today = todayISO()
  const active = habits.filter((h) => !h.archived)

  const stats = useMemo(() => {
    let done = 0, possible = 0
    for (let d = 1; d <= days; d++) {
      const k = iso(y, m, d)
      if (k > today) break
      possible += active.length
      done += (log[k] ?? []).filter((id) => active.some((h) => h.id === id)).length
    }
    const best = active.map((h) => ({ h, s: streak(h.id, log) })).sort((a, b) => b.s - a.s)[0]
    return { pct: possible ? Math.round((done / possible) * 100) : 0, done, best }
  }, [log, habits, y, m, today])

  const todayDone = (log[today] ?? []).filter((id) => active.some((h) => h.id === id)).length

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-icon" onClick={() => setRef(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <div className="font-display min-w-48 text-center text-2xl font-semibold">{MONTHS[m]} <span className="text-fg-muted">{y}</span></div>
        <button className="btn btn-icon" onClick={() => setRef(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
        <button className="btn btn-ghost text-sm" onClick={() => setRef(new Date())}>Hoje</button>
        <div className="flex-1" />
        <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "Grade" }, { value: "calendar", label: "Calendário" }]} />
        <ThemedButton size="sm" onClick={() => setEdit({ id: "", name: "", color: "#8cf0b0", emoji: "✨" })}><Plus size={15} /> Hábito</ThemedButton>
      </div>

      <div className="flex gap-3">
        <Stat label="Hoje" value={`${todayDone}/${active.length}`} sub="hábitos concluídos" />
        <Stat label="Conclusão no mês" value={`${stats.pct}%`} tone="var(--accent)" />
        <Stat label="Maior sequência" value={<span className="flex items-center gap-1"><Flame size={20} className="text-orange-400" />{stats.best?.s ?? 0} dias</span>} sub={stats.best?.h.name} />
      </div>

      {active.length === 0 ? (
        <Empty icon="🌱" title="Nenhum hábito ainda">Crie seu primeiro hábito para acompanhar no calendário.</Empty>
      ) : view === "grid" ? (
        <>
          {/* checklist de hoje: marcar rápido */}
          <div className="flex flex-wrap gap-2">
            {active.map((h) => {
              const on = (log[today] ?? []).includes(h.id)
              return (
                <motion.button
                  key={h.id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => toggle(h.id, today)}
                  className="flex items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 text-sm transition-colors"
                  style={{ borderColor: on ? h.color : "var(--line)", background: on ? `color-mix(in srgb, ${h.color} 20%, transparent)` : "color-mix(in srgb, var(--fg) 4%, transparent)" }}
                >
                  <span className="relative flex h-7 w-7 items-center justify-center rounded-full" style={{ background: on ? h.color : "color-mix(in srgb, var(--fg) 10%, transparent)" }}>
                    <AnimatePresence mode="wait" initial={false}>
                      {on ? (
                        <motion.span key="c" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}><Check size={15} strokeWidth={3} color="#fff" /></motion.span>
                      ) : (
                        <motion.span key="e" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>{h.emoji}</motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className={cn(on && "font-medium")}>{h.name}</span>
                </motion.button>
              )
            })}
          </div>

          {/* grade do mês: cabe na janela (quadrados se ajustam); só rola de lado em janelas bem estreitas */}
          <div className="overflow-x-auto rounded-[calc(var(--r)*0.7)] border border-line" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
            <div className="grid" style={{ gridTemplateColumns: `minmax(140px, 200px) repeat(${days}, minmax(18px, 1fr)) 52px`, minWidth: 140 + days * 20 + 52 }}>
              <div className="sticky left-0 z-10 flex items-end px-3 pt-2 pb-1.5 text-sm font-medium" style={{ background: "var(--field)" }}>Hábito</div>
              {Array.from({ length: days }, (_, i) => {
                const k = iso(y, m, i + 1)
                const wd = new Date(y, m, i + 1).getDay()
                return (
                  <div key={i} className={cn("flex flex-col items-center pt-2 pb-1.5 leading-tight", k === today ? "rounded-t-lg bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] font-semibold text-brand" : wd === 0 || wd === 6 ? "text-fg-muted" : "")}>
                    <span className="text-[9px] uppercase opacity-70">{WEEKDAYS[wd][0]}</span>
                    <span className="font-num text-xs">{i + 1}</span>
                  </div>
                )
              })}
              <div className="flex items-end justify-center pb-1.5 text-sm" title="Sequência atual">🔥</div>

              {active.map((h) => {
                const monthDone = Array.from({ length: days }, (_, i) => (log[iso(y, m, i + 1)] ?? []).includes(h.id)).filter(Boolean).length
                return (
                  <div key={h.id} className="group contents">
                    <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-t border-line px-3 py-1.5" style={{ background: "var(--field)" }}>
                      <span className="text-base">{h.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{h.name}</span>
                        <span className="block text-[10px] text-fg-muted">{monthDone} no mês</span>
                      </span>
                      <button className="opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100" title="Editar" onClick={() => setEdit(h)}><Pencil size={13} /></button>
                    </div>
                    {Array.from({ length: days }, (_, i) => {
                      const k = iso(y, m, i + 1)
                      const on = (log[k] ?? []).includes(h.id)
                      const future = k > today
                      return (
                        <div key={i} className={cn("flex items-center justify-center border-t border-line px-[2px] py-1.5", k === today && "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]")}>
                          <motion.button
                            whileHover={future ? undefined : { scale: 1.12 }}
                            whileTap={future ? undefined : { scale: 0.82 }}
                            disabled={future}
                            title={`${h.name} · ${new Date(k + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}`}
                            onClick={() => toggle(h.id, k)}
                            className={cn("flex aspect-square w-full max-w-[26px] items-center justify-center rounded-[7px] transition-colors", future && "cursor-default opacity-25")}
                            style={on
                              ? { background: `linear-gradient(160deg, ${h.color}, color-mix(in srgb, ${h.color} 62%, #000))`, boxShadow: `0 2px 8px -2px ${h.color}, inset 0 1px 0 rgb(255 255 255 / .45)` }
                              : { background: "color-mix(in srgb, var(--fg) 8%, transparent)", boxShadow: k === today ? `inset 0 0 0 1.5px ${h.color}` : undefined }}
                          >
                            <AnimatePresence initial={false}>
                              {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 700, damping: 24 }}><Check size={12} strokeWidth={3.2} color="#fff" /></motion.span>}
                            </AnimatePresence>
                          </motion.button>
                        </div>
                      )
                    })}
                    <div className="font-num flex items-center justify-center border-t border-line text-sm">{streak(h.id, log)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-fg-muted uppercase">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {Array.from({ length: new Date(y, m, 1).getDay() }, (_, i) => <div key={"e" + i} />)}
            {Array.from({ length: days }, (_, i) => {
              const k = iso(y, m, i + 1)
              const done = (log[k] ?? []).filter((id) => active.some((h) => h.id === id))
              const pct = active.length ? done.length / active.length : 0
              return (
                <motion.button
                  key={k}
                  whileHover={{ y: -3, rotateX: 8 }}
                  onClick={() => setDay(k)}
                  disabled={k > today}
                  className={cn("relative flex aspect-[1.15] flex-col rounded-xl border border-line p-2 text-left disabled:opacity-35", k === today && "ring-2 ring-brand")}
                  style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(pct * 35)}%, color-mix(in srgb, var(--fg) 4%, transparent))` }}
                >
                  <span className="font-num text-sm font-semibold">{i + 1}</span>
                  <div className="mt-auto flex flex-wrap gap-0.5">
                    {active.map((h) => <span key={h.id} className="h-2 w-2 rounded-full" style={{ background: done.includes(h.id) ? h.color : "color-mix(in srgb, var(--fg) 12%, transparent)" }} />)}
                  </div>
                  {pct === 1 && <span className="absolute top-1.5 right-2 text-sm">🌸</span>}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {habits.some((h) => h.archived) && (
        <details className="text-sm text-fg-muted">
          <summary className="cursor-pointer">Arquivados</summary>
          {habits.filter((h) => h.archived).map((h) => (
            <div key={h.id} className="flex items-center gap-2 py-1">{h.emoji} {h.name}
              <button className="btn btn-ghost text-xs" onClick={() => setKey("habits", (hs) => hs.map((x) => (x.id === h.id ? { ...x, archived: false } : x)))}>Restaurar</button>
            </div>
          ))}
        </details>
      )}

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? new Date(day + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) : ""} width={400}>
        <div className="space-y-2">
          {active.map((h) => {
            const on = (log[day!] ?? []).includes(h.id)
            return (
              <button key={h.id} onClick={() => toggle(h.id, day!)} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition-colors" style={on ? { background: h.color + "33", borderColor: h.color } : {}}>
                <span className="text-xl">{h.emoji}</span>
                <span className="flex-1">{h.name}</span>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-transparent" : "border-line")} style={on ? { background: h.color } : {}}>{on && "✓"}</span>
              </button>
            )
          })}
        </div>
      </Modal>

      {edit && <HabitEditor habit={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

const EMOJIS = ["✨", "💧", "🏃", "📚", "🧘", "🥗", "😴", "💪", "🎸", "✍️", "🧠", "🚭", "💊", "🌞", "🧹", "💰", "🙏", "🎨", "🐶", "📵"]

function HabitEditor({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const setKey = useStore((s) => s.set)
  const [cur, setH] = useState<Habit | null>(habit)
  const save = () => {
    if (!cur || !cur.name.trim()) return
    if (cur.id) setKey("habits", (hs) => hs.map((x) => (x.id === cur.id ? cur : x)))
    else setKey("habits", (hs) => [...hs, { ...cur, id: uid() }])
    onClose()
  }
  return (
    <Modal open={!!habit} onClose={onClose} title={habit?.id ? "Editar hábito" : "Novo hábito"} width={440}>
      {cur && (
        <div className="space-y-4">
          <input autoFocus className="field w-full text-lg" placeholder="Nome do hábito" value={cur.name} onChange={(e) => setH({ ...cur, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => <button key={e} onClick={() => setH({ ...cur, emoji: e })} className={cn("rounded-lg p-1.5 text-xl", cur.emoji === e && "bg-brand/40")}>{e}</button>)}
          </div>
          <ColorPicker value={cur.color} onChange={(c) => setH({ ...cur, color: c })} />
          <div className="flex justify-between">
            {cur.id ? (
              <div className="flex gap-2">
                <button className="btn" onClick={() => { setKey("habits", (hs) => hs.map((x) => (x.id === cur.id ? { ...x, archived: true } : x))); onClose() }}><Archive size={14} /> Arquivar</button>
                <button className="btn hover:!text-red-400" onClick={() => { if (confirm("Excluir hábito e seu histórico?")) { setKey("habits", (hs) => hs.filter((x) => x.id !== cur.id)); onClose() } }}><Trash2 size={14} /></button>
              </div>
            ) : <span />}
            <ThemedButton onClick={save}>Salvar</ThemedButton>
          </div>
        </div>
      )}
    </Modal>
  )
}
