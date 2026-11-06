import { useStore } from "@/lib/store"
import { CalendarDays } from "lucide-react"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

const dayLabel = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  const tom = new Date(Date.now() + 86400000)
  if (d.toDateString() === today.toDateString()) return "Hoje"
  if (d.toDateString() === tom.toDateString()) return "Amanhã"
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })
}

/** Próximos eventos das agendas conectadas (Google Agenda pelo endereço iCal). */
export function AgendaWidget({ w }: { w: Widget }) {
  const events = useStore((s) => s.calEvents)
  const feeds = useStore((s) => s.settings.calendars) ?? []
  const open = useStore((s) => s.openWindow)
  const now = Date.now()
  const list = events.filter((e) => e.end > now).slice(0, Math.max(3, Math.floor((w.h - 60) / 40)))
  let last = ""
  return (
    <div className="flex h-full flex-col gap-2 p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={15} className="text-fg-muted" /> <span className="flex-1">Próximos eventos</span></div>
      {!feeds.length ? (
        <button className="flex flex-1 items-center justify-center text-center text-sm text-fg-muted" onClick={() => open("settings")}>Conecte sua agenda do Google em Configurações → Rotina e avisos.</button>
      ) : list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">Nada nos próximos dias.</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          {list.map((e) => {
            const d = dayLabel(e.start)
            const head = d !== last
            last = d
            const live = e.start <= now && e.end > now
            return (
              <div key={e.id}>
                {head && <div className="mt-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase first:mt-0">{d}</div>}
                <div className="flex items-center gap-2 py-0.5">
                  <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className={cn("font-num w-11 shrink-0 text-xs", live ? "font-semibold text-[#5ee3a1]" : "text-fg-muted")}>{e.allDay ? "dia" : live ? "agora" : new Date(e.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
