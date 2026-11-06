import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Archive, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Trash2 } from "lucide-react"
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
  }, [log, habits, y, m])

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
        <div className="overflow-auto rounded-[calc(var(--r)*0.7)] border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-52 p-2 text-left font-medium" style={{ background: "var(--field)" }}>Hábito</th>
                {Array.from({ length: days }, (_, i) => {
                  const k = iso(y, m, i + 1)
                  const wd = new Date(y, m, i + 1).getDay()
                  return (
                    <th key={i} className={cn("w-8 p-1 text-center font-normal", k === today && "text-brand", (wd === 0 || wd === 6) && "text-fg-muted")}>
                      <div className="text-[10px] uppercase">{WEEKDAYS[wd][0]}</div>
                      <div className="font-num">{i + 1}</div>
                    </th>
                  )
                })}
                <th className="p-2 text-center font-medium">🔥</th>
              </tr>
            </thead>
            <tbody>
              {active.map((h) => (
                <tr key={h.id} className="group border-t border-line">
                  <td className="sticky left-0 z-10 p-2" style={{ background: "var(--field)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{h.emoji}</span>
                      <span className="flex-1 truncate">{h.name}</span>
                      <button className="opacity-0 group-hover:opacity-60 hover:!opacity-100" onClick={() => setEdit(h)}><Pencil size={13} /></button>
                    </div>
                  </td>
                  {Array.from({ length: days }, (_, i) => {
                    const k = iso(y, m, i + 1)
                    const on = (log[k] ?? []).includes(h.id)
                    const future = k > today
                    return (
                      <td key={i} className="p-0.5 text-center">
                        <motion.button
                          whileTap={{ scale: 0.7, rotateY: 180 }}
                          disabled={future}
                          onClick={() => toggle(h.id, k)}
                          className={cn("h-6 w-6 rounded-md transition-all", future ? "opacity-20" : "hover:scale-110", k === today && !on && "ring-1 ring-brand")}
                          style={on ? { background: `linear-gradient(160deg, ${h.color}, color-mix(in srgb, ${h.color} 60%, #000))`, boxShadow: `0 2px 8px -2px ${h.color}, inset 0 1px 0 rgb(255 255 255 / .5)` } : { background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}
                        />
                      </td>
                    )
                  })}
                  <td className="font-num p-2 text-center">{streak(h.id, log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
