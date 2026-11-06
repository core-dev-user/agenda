import { AnimatePresence, motion } from "framer-motion"
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { SOURCE_META } from "@/lib/notify"
import { cn } from "@/lib/utils"

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return "agora"
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

/** sininho com o número de avisos não lidos */
export function BellIcon({ size }: { size: number }) {
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length)
  return (
    <span className="relative inline-flex">
      <Bell size={size} />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff4d6d] px-1 text-[9px] font-bold text-white" style={{ boxShadow: "0 0 0 2px var(--field)" }}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </span>
  )
}

/** painel da central de avisos (abre pela barra de tarefas) */
export function NotificationPanel({ close }: { close: () => void }) {
  const list = useStore((s) => s.notifications)
  const readAll = useStore((s) => s.markNotificationsRead)
  const clear = useStore((s) => s.clearNotifications)
  const open = useStore((s) => s.openWindow)
  const groups = new Map<string, typeof list>()
  for (const n of list.slice(0, 80)) {
    const d = new Date(n.at)
    const k = d.toDateString() === new Date().toDateString() ? "Hoje" : d.toDateString() === new Date(Date.now() - 86400000).toDateString() ? "Ontem" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    groups.set(k, [...(groups.get(k) ?? []), n])
  }
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="mb-2 flex items-center gap-2">
        <div className="font-display flex-1 text-lg font-semibold">Avisos</div>
        <button className="btn btn-ghost !py-1 text-xs" disabled={!list.some((n) => !n.read)} onClick={readAll}><CheckCheck size={13} /> Marcar lidos</button>
        <button className="btn btn-ghost btn-icon !p-1.5" title="Limpar tudo" disabled={!list.length} onClick={clear}><Trash2 size={14} /></button>
      </div>
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-fg-muted"><BellOff size={26} className="opacity-60" /> Nenhum aviso por enquanto.</div>
      ) : (
        <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-auto px-1">
          <AnimatePresence initial={false}>
            {[...groups].map(([g, items]) => (
              <div key={g}>
                <div className="mb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{g}</div>
                <div className="space-y-1">
                  {items.map((n) => (
                    <motion.button
                      layout
                      key={n.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn("flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]", !n.read && "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]")}
                      onClick={() => { if (n.open) { open(n.open); close() } }}
                    >
                      <span className="mt-0.5 text-lg leading-none">{n.icon ?? SOURCE_META[n.source].emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n.title}</span>
                          <span className="shrink-0 text-[10px] text-fg-muted">{ago(n.at)}</span>
                        </span>
                        {n.body && <span className="line-clamp-2 block text-xs text-fg-muted">{n.body}</span>}
                      </span>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
