import { ArrowUpRight, Check } from "lucide-react"
import { useStore } from "@/lib/store"
import { mediaUrl } from "@/lib/bridge"
import type { SectionId, Widget } from "@/lib/types"
import { brl, cn, todayISO } from "@/lib/utils"
import { SECTIONS } from "@/components/sections-meta"
import { AppIcon } from "@/components/AppIcon"

const brlShort = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

/** Atalho para uma aba, já mostrando uma prévia do conteúdo dela. */
export function SectionWidget({ w }: { w: Widget }) {
  const section: SectionId = w.config.section ?? "habits"
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const open = useStore((s) => s.openWindow)

  return (
    <div className="flex h-full flex-col">
      <button onClick={() => open(section)} className="group/h flex items-center gap-2.5 px-4 pt-3 pb-2 text-left">
        <AppIcon id={section} size={32} />
        <span className="font-display flex-1 font-semibold">{meta.label}</span>
        <span className="flex items-center gap-0.5 text-xs text-fg-muted transition-colors group-hover/h:text-brand">
          Abrir <ArrowUpRight size={13} />
        </span>
      </button>
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
        {section === "habits" && <HabitsPreview />}
        {section === "studies" && <StudiesPreview />}
        {section === "services" && <ServicesPreview />}
        {section === "lists" && <ListsPreview listId={w.config.listId} />}
        {section === "gallery" && <GalleryPreview />}
        {section === "settings" && <div className="text-sm text-fg-muted">Tema, fontes, cursor, barra de tarefas e mais.</div>}
      </div>
    </div>
  )
}

const muted = "color-mix(in srgb, var(--fg) 10%, transparent)"

function HabitsPreview() {
  const habits = useStore((s) => s.habits).filter((h) => !h.archived)
  const log = useStore((s) => s.habitLog)
  const toggle = useStore((s) => s.toggleHabit)
  const today = log[todayISO()] ?? []
  const done = habits.filter((h) => today.includes(h.id)).length
  if (!habits.length) return <div className="text-sm text-fg-muted">Nenhum hábito ainda.</div>
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        Hoje <span className="font-num">{done}/{habits.length}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: muted }}>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: (done / habits.length) * 100 + "%" }} />
        </div>
      </div>
      <div className="space-y-1 overflow-auto">
        {habits.map((h) => {
          const on = today.includes(h.id)
          return (
            <button key={h.id} onClick={() => toggle(h.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]">
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors", on ? "border-transparent" : "border-line")} style={on ? { background: h.color } : {}}>
                {on && <Check size={12} strokeWidth={3} className="text-black/70" />}
              </span>
              <span>{h.emoji}</span>
              <span className={cn("truncate", on && "text-fg-muted line-through")}>{h.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StudiesPreview() {
  const subjects = useStore((s) => s.subjects)
  if (!subjects.length) return <div className="text-sm text-fg-muted">Nenhuma matéria ainda.</div>
  const since = new Date()
  since.setDate(since.getDate() - 6)
  const from = todayISO(since)
  const rows = subjects
    .map((s) => ({ s, week: s.sessions.filter((x) => x.date >= from).reduce((a, b) => a + b.minutes, 0), total: s.sessions.reduce((a, b) => a + b.minutes, 0) }))
    .sort((a, b) => b.week - a.week)
  const weekTotal = rows.reduce((a, r) => a + r.week, 0)
  return (
    <div className="space-y-2">
      <div className="text-xs text-fg-muted">Últimos 7 dias: <span className="font-num text-fg">{(weekTotal / 60).toFixed(1)}h</span></div>
      {rows.slice(0, 5).map(({ s, total }) => (
        <div key={s.id} className="text-sm">
          <div className="flex justify-between"><span className="truncate">{s.emoji} {s.name}</span><span className="font-num text-xs text-fg-muted">{(total / 60).toFixed(1)}/{s.goalHours}h</span></div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full" style={{ background: muted }}>
            <div className="h-full rounded-full" style={{ width: Math.min(100, (total / 60 / Math.max(1, s.goalHours)) * 100) + "%", background: s.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ServicesPreview() {
  const services = useStore((s) => s.services)
  const prefix = todayISO().slice(0, 7)
  const month = services.filter((s) => s.date.startsWith(prefix))
  const total = month.reduce((a, s) => a + s.value, 0)
  const paid = month.reduce((a, s) => a + Math.min(s.paid, s.value), 0)
  const openAll = services.filter((s) => s.paid < s.value)
  const late = openAll.filter((s) => s.dueDate && s.dueDate < todayISO()).length
  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs text-fg-muted capitalize">{new Date().toLocaleDateString("pt-BR", { month: "long" })} · {month.length} serviço(s)</div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Total", v: total, c: undefined },
          { l: "Recebido", v: paid, c: "#5ee3a1" },
          { l: "Falta", v: total - paid, c: "#ffd36e" },
        ].map((x) => (
          <div key={x.l} className="rounded-lg p-2" style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>
            <div className="text-[10px] text-fg-muted uppercase">{x.l}</div>
            <div className="font-num truncate text-[13px] font-semibold" style={{ color: x.c }} title={brl(x.v)}>{brlShort(x.v)}</div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: muted }}>
          <div className="h-full rounded-full bg-[#5ee3a1]" style={{ width: (paid / total) * 100 + "%" }} />
        </div>
      )}
      {openAll.slice(0, 3).map((s) => (
        <div key={s.id} className="flex justify-between text-xs">
          <span className="truncate">{s.client || s.description || "—"}</span>
          <span className="font-num text-[#ffd36e]">{brl(s.value - s.paid)}</span>
        </div>
      ))}
      {late > 0 && <div className="text-xs text-[#ff6b8b]">⚠ {late} pagamento(s) em atraso</div>}
    </div>
  )
}

function ListsPreview({ listId }: { listId?: string }) {
  const lists = useStore((s) => s.lists)
  const setKey = useStore((s) => s.set)
  const l = lists.find((x) => x.id === listId) ?? lists[0]
  if (!l) return <div className="text-sm text-fg-muted">Nenhuma lista ainda.</div>
  const pending = l.items.filter((i) => !i.checked)
  const remaining = pending.reduce((a, i) => a + i.price * i.qty, 0)
  const check = (id: string) => setKey("lists", (ls) => ls.map((x) => (x.id === l.id ? { ...x, items: x.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) } : x)))
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex justify-between text-xs text-fg-muted">
        <span>{l.emoji} {l.name} · {pending.length} pendente(s)</span>
        <span className="font-num text-[#ffd36e]">{brl(remaining)}</span>
      </div>
      <div className="space-y-0.5 overflow-auto">
        {pending.length === 0 && <div className="text-sm text-fg-muted">Tudo comprado 🎉</div>}
        {pending.map((i) => (
          <button key={i.id} onClick={() => check(i.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]">
            <span className="h-4.5 w-4.5 shrink-0 rounded-md border border-line" />
            <span className="flex-1 truncate">{i.name}{i.qty > 1 && <span className="text-fg-muted"> ×{i.qty}</span>}</span>
            <span className="font-num text-xs text-fg-muted">{brl(i.price * i.qty)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function GalleryPreview() {
  const media = useStore((s) => s.media)
  if (!media.length) return <div className="text-sm text-fg-muted">Nenhuma imagem ainda.</div>
  return (
    <div className="grid h-full grid-cols-3 gap-1.5">
      {media.slice(0, 6).map((m) => (
        <img key={m.id} src={mediaUrl(m.file)} className="h-full min-h-0 w-full rounded-lg object-cover" draggable={false} loading="lazy" />
      ))}
    </div>
  )
}
