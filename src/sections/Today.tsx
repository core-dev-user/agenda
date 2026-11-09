import { useEffect, useMemo, useState } from "react"
import { matchHasFav } from "@/lib/favs"
import type { SportKind } from "@/lib/types"
import { Glyph } from "@/components/Glyph"
import { motion } from "framer-motion"
import { Check, Lock, Play, Plus, Briefcase, CalendarDays, GraduationCap, ListChecks, Sprout, Star, Trophy, Wallet } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, type SportMatch } from "@/lib/bridge"
import { useFinance } from "@/lib/financeStore"
import { summary, ym } from "@/lib/finance"
import { brl, cn, todayISO, uid } from "@/lib/utils"
import { Card, Switch } from "@/components/ui/controls"
import { loadWeather, LABEL, WxIcon, type Wx } from "@/widgets/Weather"
import { statusOf } from "./Services"
import { useNow } from "@/widgets/Clock"
import type { CalEvent } from "@/lib/types"

const greet = (h: number) => (h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite")
const hm = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const sameDay = (t: number, d: Date) => new Date(t).toDateString() === d.toDateString()

/** Tela "Hoje": o resumo do dia em um lugar só. */
export default function Today() {
  const now = useNow(30000)
  const s = useStore((x) => x.settings)
  const setSettings = useStore((x) => x.setSettings)
  const today = todayISO(now)
  return (
    <div className="space-y-5 p-6">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <div className="font-display text-3xl font-semibold">{greet(now.getHours())}</div>
          <div className="text-fg-muted capitalize">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
        <WeatherChip city={s.weatherCity} />
      </motion.div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Agenda now={now} />
          <TasksToday today={today} />
        </div>
        <div className="space-y-4">
          <HabitsToday today={today} />
          <StudyToday today={today} />
          <ServicesToday today={today} />
        </div>
        <div className="space-y-4">
          <GamesToday />
          <MoneyToday />
        </div>
      </div>
      <div className="max-w-sm"><Switch label="Abrir esta tela quando o Agenda abrir" checked={!!s.todayOnStart} onChange={(v) => setSettings({ todayOnStart: v })} /></div>
    </div>
  )
}

function WeatherChip({ city }: { city: string }) {
  const [wx, setWx] = useState<Wx | null>(null)
  useEffect(() => { loadWeather(city).then(setWx).catch(() => {}) }, [city])
  if (!wx) return null
  return (
    <Card className="flex items-center gap-3 !py-2.5">
      <WxIcon code={wx.code} day={wx.isDay} size={34} />
      <div>
        <div className="font-num text-2xl font-semibold">{Math.round(wx.temp)}°</div>
        <div className="text-xs text-fg-muted">{LABEL(wx.code)} · {Math.round(wx.min)}° / {Math.round(wx.max)}° · {wx.city}</div>
      </div>
    </Card>
  )
}

function Title({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mb-2 flex items-center gap-2"><div className="flex flex-1 items-center gap-2 font-semibold">{children}</div>{right}</div>
}

function Agenda({ now }: { now: Date }) {
  const events = useStore((x) => x.calEvents)
  const feeds = useStore((x) => x.settings.calendars) ?? []
  const open = useStore((x) => x.openWindow)
  const tomorrow = new Date(now.getTime() + 86400000)
  const list = (d: Date) => events.filter((e) => sameDay(e.start, d) || (e.allDay && e.start <= d.getTime() && e.end > d.getTime()))
  const today = list(now), tom = list(tomorrow)
  const row = (e: CalEvent) => {
    const past = !e.allDay && e.end < now.getTime()
    return (
      <div key={e.id} className={cn("flex items-center gap-2.5 py-1 text-sm", past && "opacity-45")}>
        <span className="h-8 w-1 rounded-full" style={{ background: e.color }} />
        <span className="font-num w-12 text-xs text-fg-muted">{e.allDay ? "dia todo" : hm(e.start)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate">{e.title}</span>{e.location && <span className="block truncate text-[11px] text-fg-muted">{e.location}</span>}</span>
      </div>
    )
  }
  return (
    <Card>
      <Title><CalendarDays size={15} className="text-fg-muted" /> Agenda</Title>
      {!feeds.length ? (
        <div className="text-sm text-fg-muted">Conecte sua agenda do Google em <button className="underline" onClick={() => open("settings")}>Configurações → Rotina e avisos</button>.</div>
      ) : (
        <>
          {today.length ? today.map(row) : <div className="text-sm text-fg-muted">Nada marcado para hoje.</div>}
          {tom.length > 0 && <><div className="mt-2 mb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Amanhã</div>{tom.slice(0, 4).map(row)}</>}
        </>
      )}
    </Card>
  )
}

function TasksToday({ today }: { today: string }) {
  const tasks = useStore((x) => x.tasks)
  const setKey = useStore((x) => x.set)
  const [txt, setTxt] = useState("")
  const list = tasks.filter((t) => !t.done && t.date && t.date <= today).sort((a, b) => (a.date! + (a.time ?? "")).localeCompare(b.date! + (b.time ?? "")))
  const doneToday = tasks.filter((t) => t.done && t.doneAt && todayISO(new Date(t.doneAt)) === today).length
  const add = () => { if (!txt.trim()) return; setKey("tasks", (ts) => [...ts, { id: uid(), title: txt.trim(), date: today, done: false, createdAt: Date.now() }]); setTxt("") }
  return (
    <Card>
      <Title right={doneToday > 0 && <span className="text-xs text-fg-muted">{doneToday} feita{doneToday > 1 ? "s" : ""} hoje</span>}><ListChecks size={15} className="text-fg-muted" /> Tarefas</Title>
      {list.length === 0 && <div className="mb-2 text-sm text-fg-muted">Tudo em dia.</div>}
      {list.map((t) => (
        <button key={t.id} className="flex w-full items-center gap-2 py-1 text-left text-sm" onClick={() => setKey("tasks", (ts) => ts.map((x) => (x.id === t.id ? { ...x, done: true, doneAt: Date.now() } : x)))}>
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md border border-line" style={{ borderColor: t.color }} />
          <span className="min-w-0 flex-1 truncate">{t.title}</span>
          <span className={cn("text-xs", t.date! < today ? "text-[#ff6b8b]" : "text-fg-muted")}>{t.date! < today ? "atrasada" : t.time ?? ""}</span>
        </button>
      ))}
      <div className="mt-2 flex gap-1.5">
        <input className="field !py-1 text-sm" placeholder="Nova tarefa para hoje" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-icon" onClick={add}><Plus size={14} /></button>
      </div>
    </Card>
  )
}

function HabitsToday({ today }: { today: string }) {
  const allHabits = useStore((x) => x.habits)
  const habits = allHabits.filter((h) => !h.archived)
  const log = useStore((x) => x.habitLog[today]) ?? []
  const toggle = useStore((x) => x.toggleHabit)
  if (!habits.length) return null
  const done = habits.filter((h) => log.includes(h.id)).length
  return (
    <Card>
      <Title right={<span className="font-num text-xs text-fg-muted">{done}/{habits.length}</span>}><Sprout size={15} className="text-fg-muted" /> Hábitos</Title>
      <div className="flex flex-wrap gap-1.5">
        {habits.map((h) => {
          const on = log.includes(h.id)
          return (
            <motion.button whileTap={{ scale: 0.9 }} key={h.id} onClick={() => toggle(h.id)} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors" style={{ borderColor: on ? h.color : "var(--line)", background: on ? `color-mix(in srgb, ${h.color} 22%, transparent)` : undefined }}>
              {on ? <Check size={13} style={{ color: h.color }} /> : <Glyph v={h.emoji} size={13} />} {h.name}
            </motion.button>
          )
        })}
      </div>
    </Card>
  )
}

function StudyToday({ today }: { today: string }) {
  const subjects = useStore((x) => x.subjects)
  const timer = useStore((x) => x.studyTimer)
  const setKey = useStore((x) => x.set)
  const open = useStore((x) => x.openWindow)
  if (!subjects.length) return null
  const mins = subjects.reduce((a, s) => a + s.sessions.filter((x) => x.date === today).reduce((b, x) => b + x.minutes, 0), 0)
  // sugestão: a matéria mais longe da meta
  const pct = (s: (typeof subjects)[number]) => s.sessions.reduce((a, x) => a + x.minutes, 0) / 60 / Math.max(1, s.goalHours)
  const next = [...subjects].sort((a, b) => pct(a) - pct(b))[0]
  return (
    <Card>
      <Title right={<span className="font-num text-xs text-fg-muted">{mins} min hoje</span>}><GraduationCap size={15} className="text-fg-muted" /> Estudos</Title>
      {timer ? (
        <button className="text-sm underline" onClick={() => open("studies")}>Sessão em andamento: {subjects.find((s) => s.id === timer.subjectId)?.name}</button>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">Sugestão: <b>{next.name}</b> <span className="text-fg-muted">({Math.round(pct(next) * 100)}% da meta)</span></span>
          <button className="btn !py-1 text-xs" onClick={() => { setKey("studyTimer", { subjectId: next.id, startedAt: Date.now(), elapsed: 0 }); open("studies") }}><Play size={12} /> Começar</button>
        </div>
      )}
    </Card>
  )
}

function ServicesToday({ today }: { today: string }) {
  const services = useStore((x) => x.services)
  const open = useStore((x) => x.openWindow)
  const due = services.filter((s) => s.dueDate && s.dueDate <= today && statusOf(s) !== "pago")
  if (!due.length) return null
  return (
    <Card>
      <Title><Briefcase size={15} className="text-fg-muted" /> A receber</Title>
      {due.slice(0, 5).map((s) => (
        <button key={s.id} className="flex w-full items-center gap-2 py-0.5 text-left text-sm" onClick={() => open("services")}>
          <span className="min-w-0 flex-1 truncate">{s.client || s.description}</span>
          <span className={cn("text-xs", s.dueDate < today ? "text-[#ff6b8b]" : "text-fg-muted")}>{s.dueDate < today ? "atrasado" : "hoje"}</span>
          <span className="font-num">{brl(s.value - s.paid)}</span>
        </button>
      ))}
    </Card>
  )
}

function GamesToday() {
  const byS = useStore((x) => x.settings.favBySport)
  const [list, setList] = useState<(SportMatch & { sport: SportKind })[] | null>(null)
  useEffect(() => {
    const tag = (sport: SportKind) => (ms: SportMatch[]) => ms.map((m) => ({ ...m, sport }))
    Promise.all([
      bridge.sports.get("football", { leagues: ["bra.1", "conmebol.libertadores", "uefa.champions", "uefa.europa", "eng.1", "esp.1", "eng.3", "bra.copa_do_brazil"] }).then(tag("football")).catch(() => []),
      bridge.sports.get("cs2").then(tag("cs2")).catch(() => []),
      bridge.sports.get("valorant").then(tag("valorant")).catch(() => []),
    ]).then((ls) => setList(ls.flat()))
  }, [])
  const day = new Date()
  // cada jogo só olha os favoritos do esporte dele
  const isFav = (m: SportMatch & { sport: SportKind }) => matchHasFav(m, byS?.[m.sport] ?? [])
  const games = useMemo(() => (list ?? []).filter((m) => m.state === "live" || sameDay(m.start, day)).sort((a, b) => Number(isFav(b)) - Number(isFav(a)) || Number(b.state === "live") - Number(a.state === "live") || a.start - b.start).slice(0, 8), [list, JSON.stringify(byS ?? {})])
  return (
    <Card>
      <Title><Trophy size={15} className="text-fg-muted" /> Jogos de hoje</Title>
      {!list ? <div className="animate-pulse text-sm text-fg-muted">Carregando…</div> : games.length === 0 ? <div className="text-sm text-fg-muted">Nenhum jogo hoje nas ligas que você acompanha.</div> : games.map((m) => (
        <button key={m.id} className="flex w-full items-center gap-2 py-1 text-left text-sm" onClick={() => bridge.app.openExternal(m.link)}>
          {isFav(m) && <Star size={12} className="fill-current text-amber-300" />}
          <span className="min-w-0 flex-1 truncate">{m.a.short || m.a.name} <span className="text-fg-muted">x</span> {m.b.short || m.b.name}</span>
          {m.state === "live" ? <span className="font-num font-semibold text-[#ff5a63]">{m.a.score ?? 0} - {m.b.score ?? 0} ●</span> : m.state === "done" ? <span className="font-num text-fg-muted">{m.a.score} - {m.b.score}</span> : <span className="font-num text-xs text-fg-muted">{hm(m.start)}</span>}
        </button>
      ))}
    </Card>
  )
}

function MoneyToday() {
  const fin = useFinance()
  const open = useStore((x) => x.openWindow)
  useEffect(() => { if (fin.status === "idle") fin.check() }, [])
  if (fin.status !== "open") return (
    <Card><Title><Wallet size={15} className="text-fg-muted" /> Finanças</Title><button className="flex items-center gap-1.5 text-sm text-fg-muted" onClick={() => open("finance")}><Lock size={13} /> Bloqueado, abra a aba para ver</button></Card>
  )
  if (!fin.data.txns.length) return null
  const m = ym(new Date())
  const s = summary(fin.data, m)
  const top = [...s.byCat].sort((a, b) => b[1] - a[1])[0]
  const cat = top && fin.data.categories.find((c) => c.id === top[0])
  const money = (n: number) => (fin.hidden ? "R$ ••••" : brl(n))
  return (
    <Card>
      <Title><Wallet size={15} className="text-fg-muted" /> Finanças do mês</Title>
      <button className="w-full text-left" onClick={() => open("finance")}>
        <div className="font-num text-2xl font-semibold">{money(s.expense)}</div>
        <div className="text-xs text-fg-muted">gastos{cat ? ` · mais em ${cat.name} (${money(top[1])})` : ""}</div>
      </button>
    </Card>
  )
}
