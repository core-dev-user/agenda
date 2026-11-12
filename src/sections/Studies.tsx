import { useEffect, useMemo, useState } from "react"
import { Glyph } from "@/components/Glyph"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft, BookOpen, Check, ClipboardPaste, Clock, ExternalLink, FileText, Flame, GraduationCap, Music2, Paperclip, Pause, Pencil,
  Play, Plus, Sparkles, Square, Timer, Trash2, Undo2, X,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import type { Song, StudyTopic, Subject } from "@/lib/types"
import { cn, todayISO, uid } from "@/lib/utils"
import { Card, Modal, Slider, Switch, ThemedButton } from "@/components/ui/controls"
import { IconPicker } from "@/components/IconPicker"
import { FrameField, FramedImage } from "@/components/FramedImage"

const COLORS = ["#a78bfa", "#8f9bff", "#7cc8ff", "#5eead4", "#8cf0b0", "#fbbf24", "#fb923c", "#ff8fb8", "#f87171", "#e5e7eb"]
const fmtH = (min: number) => {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m ? `${h}h ${String(m).padStart(2, "0")}` : `${h}h`
}
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return (h ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`
}
const totalMin = (s: Subject) => s.sessions.reduce((a, b) => a + b.minutes, 0)
const learnedOf = (s: Subject) => {
  const total = s.topics.length
  const learned = s.topics.filter((t) => t.done).length
  return { total, learned, pct: total ? Math.round((learned / total) * 100) : 0 }
}

/* --------------------------- cronômetro (persistido) --------------------------- */
function useTimerMs() {
  const t = useStore((s) => s.studyTimer)
  const [, force] = useState(0)
  useEffect(() => {
    if (!t?.startedAt) return
    const id = setInterval(() => force((x) => x + 1), 500)
    return () => clearInterval(id)
  }, [t?.startedAt])
  if (!t) return { t: null, ms: 0 }
  return { t, ms: t.elapsed + (t.startedAt ? Date.now() - t.startedAt : 0) }
}

/* ======================================================================= */
export default function Studies() {
  const subjects = useStore((s) => s.subjects)
  const setKey = useStore((s) => s.set)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { t: timer, ms } = useTimerMs()
  const open = subjects.find((s) => s.id === openId)

  if (open) return <SubjectPage key={open.id} s={open} onBack={() => setOpenId(null)} />

  const total = subjects.reduce((a, s) => a + totalMin(s), 0)
  const sessions = subjects.reduce((a, s) => a + s.sessions.length, 0)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const k = todayISO(d)
    return { k, label: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), per: subjects.map((s) => ({ c: s.color, m: s.sessions.filter((x) => x.date === k).reduce((a, b) => a + b.minutes, 0) })) }
  })
  const maxDay = Math.max(60, ...week.map((d) => d.per.reduce((a, b) => a + b.m, 0)))
  const weekMin = week.reduce((a, d) => a + d.per.reduce((x, y) => x + y.m, 0), 0)
  const streak = (() => {
    let n = 0
    const d = new Date()
    for (;;) {
      const k = todayISO(d)
      if (subjects.some((s) => s.sessions.some((x) => x.date === k))) { n++; d.setDate(d.getDate() - 1) } else if (n === 0 && k === todayISO()) d.setDate(d.getDate() - 1)
      else break
    }
    return n
  })()
  const timerSubject = timer ? subjects.find((s) => s.id === timer.subjectId) : null

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="font-display text-3xl font-semibold">Estudos</div>
          <div className="text-sm text-fg-muted">Transforme curiosidade em conhecimento.</div>
        </div>
        <ThemedButton onClick={() => setCreating(true)}><Plus size={15} /> Nova matéria</ThemedButton>
      </div>

      {timerSubject && (
        <button className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left" style={{ borderColor: timerSubject.color, background: `color-mix(in srgb, ${timerSubject.color} 14%, transparent)` }} onClick={() => setOpenId(timerSubject.id)}>
          <span className="relative flex h-3 w-3"><span className={cn("absolute inset-0 rounded-full opacity-70", timer?.startedAt && "animate-ping")} style={{ background: timerSubject.color }} /><span className="relative h-3 w-3 rounded-full" style={{ background: timerSubject.color }} /></span>
          <span className="flex-1 text-sm">{timer?.startedAt ? "Cronômetro ativo" : "Sessão pausada"} em <b>{timerSubject.name}</b></span>
          <span className="font-num text-xl font-semibold">{clock(ms)}</span>
        </button>
      )}

      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)] gap-3">
        <MiniStat icon={<GraduationCap size={16} />} label="Matérias" value={String(subjects.length)} />
        <MiniStat icon={<BookOpen size={16} />} label="Sessões" value={String(sessions)} />
        <MiniStat icon={<Clock size={16} />} label="Tempo total" value={fmtH(total)} sub={`${fmtH(weekMin)} nesta semana`} />
        <MiniStat icon={<Flame size={16} />} label="Sequência" value={`${streak} dia${streak === 1 ? "" : "s"}`} sub="estudando seguidos" />
        <Card className="!p-3">
          <div className="mb-1.5 text-[11px] tracking-wide text-fg-muted uppercase">Últimos 7 dias</div>
          <div className="flex h-14 items-end gap-2">
            {week.map((d) => (
              <div key={d.k} className="flex flex-1 flex-col items-center gap-1" title={fmtH(d.per.reduce((a, b) => a + b.m, 0))}>
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-md" style={{ height: 40 }}>
                  {d.per.map((p, i) => <motion.div key={i} initial={{ height: 0 }} animate={{ height: (p.m / maxDay) * 40 }} style={{ background: p.c }} />)}
                </div>
                <span className="text-[10px] text-fg-muted inline-block cap-first">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {subjects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line py-16 text-center">
          <GraduationCap size={40} className="text-fg-muted" />
          <div className="font-display text-xl">Comece pela primeira matéria</div>
          <div className="max-w-sm text-sm text-fg-muted">Crie um espaço para reunir o que quer aprender e acompanhar o tempo dedicado.</div>
          <ThemedButton onClick={() => setCreating(true)}><Plus size={15} /> Criar matéria</ThemedButton>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {subjects.map((s) => <SubjectCard key={s.id} s={s} active={timer?.subjectId === s.id} onOpen={() => setOpenId(s.id)} />)}
        </div>
      )}

      {creating && <SubjectForm onClose={() => setCreating(false)} onSave={(s) => { setKey("subjects", (ss) => [...ss, s]); setCreating(false); setOpenId(s.id) }} />}
    </div>
  )
}

function MiniStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-fg-muted uppercase">{icon}{label}</div>
      <div className="font-num mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-fg-muted">{sub}</div>}
    </Card>
  )
}

function SubjectCard({ s, active, onOpen }: { s: Subject; active: boolean; onOpen: () => void }) {
  const { learned, total, pct } = learnedOf(s)
  return (
    <motion.button
      layout
      whileHover={{ y: -4 }}
      onClick={onOpen}
      className="group relative flex min-h-[210px] flex-col overflow-hidden rounded-[calc(var(--r)*0.9)] border text-left"
      style={{ borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, boxShadow: `0 14px 40px -18px ${s.color}88` }}
    >
      <FramedImage f={s.cover} className="transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0" style={{ background: s.cover ? `linear-gradient(180deg, rgb(8 6 12 / .25), rgb(8 6 12 / .88)), linear-gradient(135deg, ${s.color}33, transparent 60%)` : `linear-gradient(140deg, color-mix(in srgb, ${s.color} 30%, #120c18), #0d0a12)` }} />
      <div className="relative flex flex-1 flex-col p-4 text-white">
        <div className="flex items-start gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${s.color} 35%, transparent)`, boxShadow: `inset 0 0 0 1px ${s.color}66` }}><Glyph v={s.emoji} size={21} /></span>
          <div className="flex-1" />
          {active && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: s.color, color: "#111" }}>cronômetro ativo</span>}
          {s.music && <Music2 size={15} className="opacity-70" />}
        </div>
        <div className="mt-auto pt-6">
          <div className="font-display text-xl leading-tight font-semibold" style={{ color: s.color }}>{s.name}</div>
          {s.subtitle && <div className="text-sm text-white/70">{s.subtitle}</div>}
          <div className="mt-1 line-clamp-2 text-xs text-white/60">{s.description || "Sem descrição"}</div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/70">
            <span>{learned}/{total} aprendidos</span>
            <span className="font-semibold" style={{ color: s.color }}>{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: pct + "%", background: s.color }} /></div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-white/60">
            <span className="flex items-center gap-1"><Clock size={11} /> {fmtH(totalMin(s))}</span>
            <span>{s.sessions.length} {s.sessions.length === 1 ? "sessão" : "sessões"}</span>
            <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" style={{ color: s.color }}>Abrir matéria →</span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

/* =========================== página da matéria =========================== */
function SubjectPage({ s, onBack }: { s: Subject; onBack: () => void }) {
  const setKey = useStore((x) => x.set)
  const upd = (p: Partial<Subject>) => setKey("subjects", (ss) => ss.map((x) => (x.id === s.id ? { ...x, ...p } : x)))
  const [editing, setEditing] = useState(false)
  const { learned, total, pct } = learnedOf(s)
  const mins = totalMin(s)
  const goalPct = Math.min(100, (mins / 60 / Math.max(1, s.goalHours)) * 100)

  return (
    <div className="relative min-h-full">
      {/* fundo da matéria */}
      {s.pageBg && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FramedImage f={s.pageBg} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(rgb(5 9 16 / .74), rgb(5 9 16 / .9))" }} />
        </div>
      )}
      <div className="relative space-y-5 p-6">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !px-2 text-sm" onClick={onBack}><ArrowLeft size={15} /> Todas as matérias</button>
          <div className="flex-1" />
          <button className="btn !py-1.5 text-sm" onClick={() => setEditing(true)}><Pencil size={13} /> Editar matéria</button>
          <button className="btn !py-1.5 text-sm hover:!text-red-400" onClick={() => { if (confirm(`Excluir "${s.name}"? Isso remove sessões, conteúdos e músicas desta matéria.`)) { setKey("subjects", (ss) => ss.filter((x) => x.id !== s.id)); onBack() } }}><Trash2 size={13} /></button>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl" style={{ background: `color-mix(in srgb, ${s.color} 25%, transparent)`, boxShadow: `inset 0 0 0 1px ${s.color}66, 0 10px 30px -10px ${s.color}` }}><Glyph v={s.emoji} size={30} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-4xl leading-tight font-semibold" style={{ color: s.color }}>{s.name}</div>
            {s.subtitle && <div className="text-lg text-fg-muted">{s.subtitle}</div>}
            {s.description && <div className="mt-0.5 text-sm text-fg-muted">{s.description}</div>}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
          <TimerPanel s={s} upd={upd} />
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={<Clock size={15} />} label="Tempo total" value={fmtH(mins)} sub={`${s.sessions.length} ${s.sessions.length === 1 ? "sessão" : "sessões"}`} />
            <MiniStat icon={<Sparkles size={15} />} label="Aprendido" value={`${pct}%`} sub={`${learned} de ${total} conteúdos`} />
            <Card className="col-span-2 !p-3">
              <div className="flex items-center justify-between text-sm">
                <span>Meta de estudo</span>
                <label className="flex items-center gap-1 text-xs text-fg-muted">
                  <input type="number" min={1} className="field font-num w-14 !px-1.5 !py-0.5 text-right text-xs" value={s.goalHours} onChange={(e) => upd({ goalHours: Number(e.target.value) || 1 })} /> horas
                </label>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
                <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: goalPct + "%" }} style={{ background: `linear-gradient(90deg, ${s.color}, color-mix(in srgb, ${s.color} 55%, #fff))`, boxShadow: `0 0 12px ${s.color}` }} />
              </div>
              <div className="font-num mt-1 text-right text-[11px] text-fg-muted">{fmtH(mins)} de {s.goalHours}h · {Math.round(goalPct)}%</div>
            </Card>
          </div>
        </div>

        <TopicsBoard s={s} upd={upd} />
        {s.music && <Repertoire s={s} upd={upd} />}

        <div className="grid grid-cols-2 gap-4">
          <SessionsCard s={s} upd={upd} />
          <Card>
            <div className="mb-2 flex items-center gap-2 font-medium"><FileText size={16} /> Anotações</div>
            <textarea className="field min-h-48 w-full resize-y" value={s.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Resumos, fórmulas, links, vocabulário…" />
          </Card>
        </div>
      </div>
      {editing && <SubjectForm s={s} onClose={() => setEditing(false)} onSave={(n) => { upd(n); setEditing(false) }} />}
    </div>
  )
}

/* ------------------------------ cronômetro ------------------------------ */
function TimerPanel({ s, upd }: { s: Subject; upd: (p: Partial<Subject>) => void }) {
  const setKey = useStore((x) => x.set)
  const subjects = useStore((x) => x.subjects)
  const { t, ms } = useTimerMs()
  const mine = t?.subjectId === s.id
  const other = t && !mine ? subjects.find((x) => x.id === t.subjectId) : null
  const [finish, setFinish] = useState<{ minutes: number; start: string } | null>(null)

  const start = () => setKey("studyTimer", { subjectId: s.id, startedAt: Date.now(), elapsed: 0 })
  const pause = () => t && setKey("studyTimer", { ...t, startedAt: null, elapsed: ms })
  const resume = () => t && setKey("studyTimer", { ...t, startedAt: Date.now() })
  const cancel = () => confirm("Cancelar esta sessão? O tempo não será salvo.") && setKey("studyTimer", null)
  const end = () => {
    if (!t) return
    const startTs = Date.now() - ms
    setKey("studyTimer", { ...t, startedAt: null, elapsed: ms })
    setFinish({ minutes: Math.max(1, Math.round(ms / 60000)), start: new Date(startTs).toTimeString().slice(0, 5) })
  }

  const state = !mine ? "idle" : t?.startedAt ? "running" : "paused"
  return (
    <div className="relative overflow-hidden rounded-[calc(var(--r)*0.8)] border p-5" style={{ borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)` }}>
      {s.timerBg ? (
        <>
          <FramedImage f={s.timerBg} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(rgb(4 8 14 / .78), rgb(4 8 14 / .9))" }} />
        </>
      ) : (
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${s.color} 26%, transparent), transparent 60%)` }} />
      )}
      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Timer size={15} />
          {state === "running" ? <span className="text-fg">Sessão em andamento</span> : state === "paused" ? "Sessão pausada" : other ? "Há um cronômetro ativo em outra matéria" : "Pronto para sua próxima aula"}
          {state === "running" && <span className="relative ml-1 flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full opacity-70" style={{ background: s.color }} /><span className="relative h-2 w-2 rounded-full" style={{ background: s.color }} /></span>}
        </div>
        <div className="font-num my-4 text-6xl font-semibold tracking-tight tabular-nums" style={{ color: mine ? s.color : undefined, textShadow: mine ? `0 0 30px ${s.color}66` : undefined }}>
          {mine ? clock(ms) : "00:00"}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {state === "idle" && (
            <ThemedButton onClick={start} disabled={!!other}><Play size={15} /> Iniciar aula</ThemedButton>
          )}
          {state === "running" && <button className="btn" onClick={pause}><Pause size={15} /> Pausar</button>}
          {state === "paused" && <button className="btn" onClick={resume}><Play size={15} /> Continuar</button>}
          {state !== "idle" && (
            <>
              <ThemedButton onClick={end}><Square size={13} /> Finalizar</ThemedButton>
              <button className="btn btn-ghost hover:!text-red-400" onClick={cancel}><X size={15} /> Cancelar</button>
            </>
          )}
          {other && <span className="self-center text-xs text-fg-muted">Termine a sessão de <b>{other.name}</b> primeiro.</span>}
        </div>
      </div>
      {finish && (
        <FinishDialog
          s={s}
          minutes={finish.minutes}
          onClose={() => setFinish(null)}
          onSave={(minutes, note, addLearned) => {
            const session = { id: uid(), date: todayISO(), minutes, topic: note, time: finish.start }
            const topics: StudyTopic[] = addLearned && note.trim() ? [...s.topics, { id: uid(), title: note.trim(), done: true, learnedAt: Date.now() }] : s.topics
            upd({ sessions: [session, ...s.sessions], topics })
            setKey("studyTimer", null)
            setFinish(null)
          }}
        />
      )}
    </div>
  )
}

function FinishDialog({ s, minutes, onClose, onSave }: { s: Subject; minutes: number; onClose: () => void; onSave: (minutes: number, note: string, addLearned: boolean) => void }) {
  const [min, setMin] = useState(minutes)
  const [note, setNote] = useState("")
  const [learned, setLearned] = useState(true)
  return (
    <Modal open onClose={onClose} title="Aula finalizada" width={460}>
      <div className="space-y-3">
        <div className="text-sm text-fg-muted">Registre o que aprendeu nesta sessão de <b className="text-fg">{s.name}</b>, se quiser.</div>
        <label className="flex items-center gap-2 text-sm">Duração <input type="number" min={1} className="field font-num w-20" value={min} onChange={(e) => setMin(Number(e.target.value) || 1)} /> minutos</label>
        <textarea autoFocus className="field min-h-28 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escreva um resumo: o que estudou, o que ficou claro, dúvidas…" />
        <Switch label="Adicionar também em “Coisas aprendidas”" checked={learned} onChange={setLearned} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Voltar</button>
          <ThemedButton onClick={() => onSave(min, note, learned)}><Check size={14} /> Salvar sessão</ThemedButton>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------- quero aprender / aprendido ---------------------- */
function TopicsBoard({ s, upd }: { s: Subject; upd: (p: Partial<Subject>) => void }) {
  const [text, setText] = useState("")
  const [edit, setEdit] = useState<string | null>(null)
  const want = s.topics.filter((t) => !t.done)
  const got = s.topics.filter((t) => t.done).sort((a, b) => (b.learnedAt ?? 0) - (a.learnedAt ?? 0))
  const setT = (id: string, p: Partial<StudyTopic>) => upd({ topics: s.topics.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const del = (id: string) => upd({ topics: s.topics.filter((t) => t.id !== id) })
  const title = (t: StudyTopic) =>
    edit === t.id ? (
      <input autoFocus className="field w-full !py-0.5 text-sm" defaultValue={t.title} onBlur={(e) => { setT(t.id, { title: e.target.value.trim() || t.title }); setEdit(null) }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
    ) : (
      <span className="text-sm break-words" onDoubleClick={() => setEdit(t.id)}>{t.title}</span>
    )
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <div className="mb-1 flex items-center gap-2 font-medium"><BookOpen size={16} /> Quero aprender <span className="ml-auto text-xs font-normal text-fg-muted">Próximos passos</span></div>
        <form className="mb-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { upd({ topics: [...s.topics, { id: uid(), title: text.trim(), done: false }] }); setText("") } }}>
          <input className="field flex-1" placeholder="Um conteúdo, habilidade ou conceito…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-icon"><Plus size={14} /></button>
        </form>
        {want.length === 0 && <div className="py-4 text-center text-xs text-fg-muted">Adicione o primeiro conteúdo que deseja aprender.</div>}
        <div className="max-h-72 space-y-0.5 overflow-auto">
          <AnimatePresence initial={false}>
            {want.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                <button title="Marcar como aprendido" onClick={() => setT(t.id, { done: true, learnedAt: Date.now() })} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors hover:border-transparent" style={{ borderColor: `color-mix(in srgb, ${s.color} 60%, transparent)` }}><Check size={11} className="opacity-0 group-hover:opacity-50" /></button>
                <div className="min-w-0 flex-1">{title(t)}</div>
                <button className="opacity-0 group-hover:opacity-60" onClick={() => setEdit(t.id)} title="Editar"><Pencil size={12} /></button>
                <button className="opacity-0 group-hover:opacity-60 hover:!text-red-400" onClick={() => del(t.id)} title="Excluir"><Trash2 size={12} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>
      <Card style={{ background: `color-mix(in srgb, ${s.color} 7%, transparent)` }}>
        <div className="mb-2 flex items-center gap-2 font-medium"><Sparkles size={16} style={{ color: s.color }} /> Coisas aprendidas <span className="font-num ml-auto text-xs font-normal text-fg-muted">{got.length}</span></div>
        {got.length === 0 && <div className="py-4 text-center text-xs text-fg-muted">Os conteúdos marcados como aprendidos aparecem aqui.</div>}
        <div className="max-h-80 space-y-0.5 overflow-auto">
          <AnimatePresence initial={false}>
            {got.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white" style={{ background: s.color }}><Check size={12} strokeWidth={3} /></span>
                <div className="min-w-0 flex-1">
                  {title(t)}
                  {t.learnedAt && <div className="text-[10px] text-fg-muted">Aprendido em {new Date(t.learnedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</div>}
                </div>
                <button className="opacity-0 group-hover:opacity-60" title="Voltar para quero aprender" onClick={() => setT(t.id, { done: false, learnedAt: undefined })}><Undo2 size={12} /></button>
                <button className="opacity-0 group-hover:opacity-60 hover:!text-red-400" onClick={() => del(t.id)} title="Excluir"><Trash2 size={12} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------ sessões ------------------------------ */
function SessionsCard({ s, upd }: { s: Subject; upd: (p: Partial<Subject>) => void }) {
  const [manual, setManual] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [min, setMin] = useState(30)
  const [topic, setTopic] = useState("")
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2 font-medium"><Clock size={16} /> Sessões de estudo
        <button className="btn btn-ghost ml-auto !py-0.5 text-xs" onClick={() => setManual(!manual)}><Plus size={12} /> Registrar manualmente</button>
      </div>
      <AnimatePresence>
        {manual && (
          <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-2 flex flex-wrap gap-2 overflow-hidden" onSubmit={(e) => { e.preventDefault(); if (min > 0) { upd({ sessions: [{ id: uid(), date, minutes: min, topic }, ...s.sessions] }); setTopic(""); setManual(false) } }}>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="number" min={1} className="field font-num w-20" value={min} onChange={(e) => setMin(Number(e.target.value))} />
            <span className="self-center text-xs text-fg-muted">min</span>
            <input className="field min-w-0 flex-1" placeholder="O que estudou?" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <button className="btn"><Check size={13} /> Salvar</button>
          </motion.form>
        )}
      </AnimatePresence>
      {s.sessions.length === 0 && <div className="py-6 text-center text-xs text-fg-muted">Finalize seu primeiro cronômetro para criar o histórico.</div>}
      <div className="max-h-72 space-y-1 overflow-auto">
        {[...s.sessions].sort((a, b) => (b.date + (b.time ?? "")).localeCompare(a.date + (a.time ?? ""))).map((x) => (
          <div key={x.id} className="group flex items-start gap-3 rounded-lg border-b border-line px-1 py-2 text-sm last:border-0">
            <div className="font-num w-16 shrink-0 text-xs text-fg-muted">
              {new Date(x.date + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              {x.time && <div>{x.time}</div>}
            </div>
            <div className="min-w-0 flex-1 whitespace-pre-line">{x.topic || <span className="text-fg-muted">—</span>}</div>
            <span className="font-num shrink-0 font-medium" style={{ color: s.color }}>{fmtH(x.minutes)}</span>
            <button className="opacity-0 group-hover:opacity-60 hover:!text-red-400" title="Excluir sessão" onClick={() => confirm(`Excluir esta sessão de ${fmtH(x.minutes)}? O tempo total da matéria será atualizado.`) && upd({ sessions: s.sessions.filter((y) => y.id !== x.id) })}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------ repertório ------------------------------ */
const ytId = (u: string) => {
  try {
    const url = new URL(u.trim())
    if (url.hostname === "youtu.be") return url.pathname.slice(1)
    if (/youtube\.com$/.test(url.hostname.replace(/^www\.|^music\.|^m\./, ""))) return url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop() || ""
  } catch {}
  return ""
}

function Repertoire({ s, upd }: { s: Subject; upd: (p: Partial<Subject>) => void }) {
  const songs = s.songs ?? []
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const studying = songs.filter((x) => x.progress < 100)
  const done = songs.filter((x) => x.progress >= 100)
  const setSongs = (fn: (a: Song[]) => Song[]) => upd({ songs: fn(songs) })
  const song = songs.find((x) => x.id === openId)
  const tile = (x: Song) => (
    <button key={x.id} onClick={() => setOpenId(x.id)} className="group overflow-hidden rounded-xl border border-line text-left transition-transform hover:-translate-y-1" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
      <div className="relative aspect-video bg-black/40">
        {x.cover && <img src={x.cover} className="h-full w-full object-cover" draggable={false} />}
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40"><div className="h-full" style={{ width: x.progress + "%", background: s.color }} /></div>
      </div>
      <div className="p-2">
        <div className="truncate text-sm font-medium">{x.title}</div>
        <div className="text-[11px] text-fg-muted">{x.progress >= 100 ? "✓ aprendida" : `${x.progress}% · em estudo`}</div>
      </div>
    </button>
  )
  return (
    <Card>
      <div className="mb-1 text-[10px] font-semibold tracking-[0.2em] text-fg-muted">REPERTÓRIO</div>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1">
          <div className="font-display text-lg font-semibold">Músicas em estudo</div>
          <div className="text-xs text-fg-muted">Guarde o vídeo, acompanhe seu progresso, abra a cifra e a letra.</div>
        </div>
        <button className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Adicionar música</button>
      </div>
      {studying.length === 0 && <div className="py-4 text-center text-xs text-fg-muted">{done.length ? "Todas as músicas estão concluídas. Adicione outra para continuar praticando." : "Adicione a primeira música que está estudando nesta matéria."}</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">{studying.map(tile)}</div>
      {done.length > 0 && (
        <>
          <div className="mt-4 mb-2 text-sm font-medium">Músicas aprendidas</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 opacity-90">{done.map(tile)}</div>
        </>
      )}
      {adding && <SongForm color={s.color} onClose={() => setAdding(false)} onSave={(x) => { setSongs((a) => [...a, x]); setAdding(false) }} />}
      {song && <SongDetail s={s} song={song} onClose={() => setOpenId(null)} onChange={(p) => setSongs((a) => a.map((x) => (x.id === song.id ? { ...x, ...p, learnedAt: (p.progress ?? x.progress) >= 100 ? x.learnedAt ?? Date.now() : undefined } : x)))} onDelete={() => { (song.files ?? []).forEach((f) => bridge.media.remove(f)); setSongs((a) => a.filter((x) => x.id !== song.id)); setOpenId(null) }} />}
    </Card>
  )
}

function SongForm({ color, onClose, onSave }: { color: string; onClose: () => void; onSave: (s: Song) => void }) {
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [cifra, setCifra] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const id = ytId(url)
  const cover = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""
  useEffect(() => {
    if (!id) return
    let alive = true
    setBusy(true)
    bridge.net.text(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`)
      .then((t) => { const j = JSON.parse(t); if (alive && j.title && !title) setTitle(j.title) })
      .catch(() => alive && setErr("Não consegui buscar o título automaticamente. Pode digitar."))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [id])
  const save = () => {
    if (url && !id) return setErr("Cole um link válido de vídeo do YouTube.")
    if (cifra && !/^https:\/\/(www\.)?cifraclub\.com\.br\//.test(cifra)) return setErr("Use um link https do CifraClub.")
    if (!title.trim()) return setErr("Informe o nome da música.")
    onSave({ id: uid(), title: title.trim(), url: id ? `https://www.youtube.com/watch?v=${id}` : "", videoId: id || undefined, cover: cover || undefined, cifra: cifra || undefined, progress: 0, createdAt: Date.now() })
  }
  return (
    <Modal open onClose={onClose} title="Adicionar música" width={480}>
      <div className="space-y-3">
        <div className="text-xs text-fg-muted">Cole o link do YouTube para buscar o título e a capa automaticamente.</div>
        <input autoFocus className="field w-full" placeholder="Link da música no YouTube" value={url} onChange={(e) => { setUrl(e.target.value); setErr("") }} />
        {cover && <img src={cover} className="aspect-video w-full rounded-xl object-cover" style={{ boxShadow: `0 10px 30px -12px ${color}` }} />}
        <input className="field w-full" placeholder={busy ? "Buscando nome da música…" : "Nome da música"} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field w-full" placeholder="Link da cifra no CifraClub (opcional)" value={cifra} onChange={(e) => setCifra(e.target.value)} />
        {err && <div className="text-xs text-[#ff8f8f]">{err}</div>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancelar</button><ThemedButton onClick={save}><Plus size={14} /> Adicionar</ThemedButton></div>
      </div>
    </Modal>
  )
}

function SongDetail({ s, song, onClose, onChange, onDelete }: { s: Subject; song: Song; onClose: () => void; onChange: (p: Partial<Song>) => void; onDelete: () => void }) {
  const open = useStore((x) => x.openWindow)
  const [lyrics, setLyrics] = useState(song.lyrics ?? "")
  const [cifra, setCifra] = useState(song.cifra ?? "")
  const files = song.files ?? []
  return (
    <Modal open onClose={() => { onChange({ lyrics, cifra: cifra || undefined }); onClose() }} title={song.title} width={760}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-3">
          {song.cover && <img src={song.cover} className="aspect-video w-full rounded-xl object-cover" />}
          <Slider label="Meu progresso" value={song.progress} min={0} max={100} step={5} onChange={(v) => onChange({ progress: v })} format={(v) => (v >= 100 ? "100% · aprendida!" : v + "%")} />
          <div className="flex flex-wrap gap-2">
            {song.url && <button className="btn text-xs" onClick={() => { bridge.music.cmd("url", song.url); open("music") }}><Play size={13} /> Tocar no YouTube Music</button>}
            {song.url && <button className="btn text-xs" onClick={() => bridge.app.openExternal(song.url)}><ExternalLink size={13} /> YouTube</button>}
            {cifra && <button className="btn text-xs" onClick={() => bridge.app.openExternal(cifra)}><Music2 size={13} /> Abrir no CifraClub</button>}
          </div>
          <input className="field w-full text-xs" placeholder="Link da cifra no CifraClub" value={cifra} onChange={(e) => setCifra(e.target.value)} onBlur={() => onChange({ cifra: cifra || undefined })} />
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Paperclip size={14} /> Anexos para estudar
              <button className="btn btn-ghost ml-auto !py-0.5 text-xs" onClick={async () => { const r = await bridge.media.attach("any"); if (r.length) onChange({ files: [...files, ...r.map((x) => x.file)] }) }}><Plus size={12} /> Anexar</button>
            </div>
            {files.length === 0 && <div className="text-xs text-fg-muted">Partituras, tablaturas, PDFs, prints… Clique num anexo para abrir.</div>}
            <div className="grid grid-cols-4 gap-2">
              {files.map((f) => (
                <div key={f} className="group relative">
                  <button onClick={() => bridge.media.open(f)} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-black/20" title="Abrir">
                    {/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f) ? <img src={mediaUrl(f)} className="h-full w-full object-cover" /> : <FileText size={22} className="text-fg-muted" />}
                  </button>
                  <button className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex" onClick={() => { bridge.media.remove(f); onChange({ files: files.filter((x) => x !== f) }) }}><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-ghost text-xs hover:!text-red-400" onClick={() => confirm(`Excluir "${song.title}" das músicas da matéria?`) && onDelete()}><Trash2 size={13} /> Excluir música</button>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium">Letra para estudar
            <button className="btn btn-ghost ml-auto !py-0.5 text-xs" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setLyrics(t) } catch {} }}><ClipboardPaste size={12} /> Colar letra</button>
          </div>
          <textarea className="field min-h-[380px] w-full flex-1 resize-none font-mono text-[13px] leading-relaxed" value={lyrics} onChange={(e) => setLyrics(e.target.value)} onBlur={() => onChange({ lyrics })} placeholder="Cole aqui a letra que está usando para destrinchar a música. O texto fica salvo nesta música." style={{ caretColor: s.color }} />
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------ formulário ------------------------------ */
function SubjectForm({ s, onClose, onSave }: { s?: Subject; onClose: () => void; onSave: (s: Subject) => void }) {
  const [v, setV] = useState<Subject>(() => s ?? { id: uid(), name: "", color: COLORS[0], emoji: "i:Book", goalHours: 20, sessions: [], topics: [], notes: "" })
  const [pick, setPick] = useState(false)
  const [err, setErr] = useState("")
  const set = (p: Partial<Subject>) => setV((x) => ({ ...x, ...p }))
  const preview = useMemo(() => v, [v])
  return (
    <Modal open onClose={onClose} title={s ? "Editar matéria" : "Nova matéria"} width={680}>
      <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${v.color} 25%, transparent)` }} onClick={() => setPick(!pick)} title="Escolher ícone"><Glyph v={v.emoji} size={22} /></button>
              {pick && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={() => setPick(false)} />
                  <div className="surface absolute top-full left-0 z-50 mt-2 p-3" style={{ background: "color-mix(in srgb, #1b1220 94%, transparent)" }}><IconPicker value={v.emoji} onPick={(e) => { set({ emoji: e }); setPick(false) }} /></div>
                </>
              )}
            </div>
            <input autoFocus className="field min-w-0 flex-1 text-lg" placeholder="Nome da matéria (ex.: Inglês)" value={v.name} onChange={(e) => { set({ name: e.target.value }); setErr("") }} />
          </div>
          <input className="field w-full" placeholder="Segundo título (opcional) — ex.: 日本語, 한국어, français" value={v.subtitle ?? ""} onChange={(e) => set({ subtitle: e.target.value || undefined })} />
          <textarea className="field min-h-16 w-full" placeholder="Descrição: o que você quer alcançar com esta matéria?" value={v.description ?? ""} onChange={(e) => set({ description: e.target.value || undefined })} />
          <div>
            <div className="mb-1 text-sm">Cor</div>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => <button key={c} className={cn("h-7 w-7 rounded-full transition-transform hover:scale-110", v.color === c && "ring-2 ring-white ring-offset-2 ring-offset-transparent")} style={{ background: c }} onClick={() => set({ color: c })} />)}
              <label className="clickable relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}><input type="color" value={v.color} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 opacity-0" /></label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">Meta <input type="number" min={1} className="field font-num w-20" value={v.goalHours} onChange={(e) => set({ goalHours: Number(e.target.value) || 1 })} /> horas de estudo</label>
          <Switch label="Esta matéria tem repertório de músicas (instrumento, canto…)" checked={!!v.music} onChange={(m) => set({ music: m })} />
          <FrameField title="Imagem do cartão" desc="Aparece no cartão desta matéria na lista de Estudos." value={v.cover} onChange={(f) => set({ cover: f })} />
          <FrameField title="Imagem de fundo da matéria" desc="Aparece atrás do conteúdo quando você abre esta matéria." value={v.pageBg} onChange={(f) => set({ pageBg: f })} />
          <FrameField title="Imagem do painel do cronômetro" desc="Aparece só no painel do cronômetro de estudo." value={v.timerBg} onChange={(f) => set({ timerBg: f })} />
        </div>
        <div className="space-y-2">
          <div className="text-xs text-fg-muted">Prévia do cartão</div>
          <div className="pointer-events-none sticky top-0"><SubjectCard s={{ ...preview, name: preview.name || "Nome da matéria" }} active={false} onOpen={() => {}} /></div>
        </div>
      </div>
      {err && <div className="mt-2 text-sm text-[#ff8f8f]">{err}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <ThemedButton onClick={() => (v.name.trim() ? onSave({ ...v, name: v.name.trim() }) : setErr("Informe o nome da matéria."))}><Check size={14} /> {s ? "Salvar alterações" : "Criar matéria"}</ThemedButton>
      </div>
    </Modal>
  )
}

