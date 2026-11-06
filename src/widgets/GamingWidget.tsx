import { useMemo } from "react"
import { motion } from "framer-motion"
import { Gamepad2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { emptyGaming, fmtDur, gamingStats } from "@/lib/gaming"
import { GameIcon } from "@/components/GameIcon"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86400000)
  if (d <= 0) return "hoje"
  if (d === 1) return "ontem"
  return `há ${d} dias`
}

/** Widget: "Jogando agora: Valorant há 34 minutos". Clique duas vezes para abrir o histórico. */
export function GamingWidget({ w }: { w: Widget }) {
  const g = useStore((s) => s.gaming) ?? emptyGaming()
  const open = useStore((s) => s.openWindow)
  const now = useNow(15000)
  const playing = g.sessions.filter((s) => s.open)
  const today = useMemo(() => gamingStats(g, "today"), [g, Math.floor(now.getTime() / 60000)])
  const week = useMemo(() => gamingStats(g, "7"), [g, Math.floor(now.getTime() / 60000)])
  const last = [...g.sessions].filter((s) => !s.open).sort((a, b) => b.end - a.end)[0]
  const cur = playing[0]
  const info = cur ? g.games[cur.game] : undefined
  const mins = cur ? Math.floor((now.getTime() - cur.start) / 60000) : 0

  return (
    <div className="relative flex h-full w-full flex-col gap-2 overflow-hidden p-3.5" onDoubleClick={() => open("games")} title="Clique duas vezes para ver o histórico">
      {cur && <div className="pointer-events-none absolute inset-0 opacity-35" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${info?.color || "var(--accent)"}, transparent 70%)` }} />}
      <div className="relative flex items-center gap-2 text-sm font-semibold">
        <Gamepad2 size={16} /> <span className="flex-1">{cur ? "Jogando agora" : "Jogos"}</span>
        {cur && <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#5ee3a1] opacity-70" /><span className="relative h-2.5 w-2.5 rounded-full bg-[#5ee3a1]" /></span>}
      </div>
      {cur ? (
        <motion.div key={cur.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative flex flex-1 items-center gap-3">
          <GameIcon info={info} size={Math.min(64, Math.max(44, w.h * 0.26))} />
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-xl font-semibold">{info?.name ?? cur.game}</div>
            <div className="text-sm">há <b className="font-num">{mins < 60 ? `${mins} ${mins === 1 ? "minuto" : "minutos"}` : fmtDur(mins * 60000)}</b></div>
            {playing.length > 1 && <div className="truncate text-xs text-fg-muted">+ {playing.slice(1).map((p) => g.games[p.game]?.name).join(", ")}</div>}
          </div>
        </motion.div>
      ) : (
        <div className="relative flex flex-1 items-center gap-3">
          {last ? (
            <>
              <GameIcon info={g.games[last.game]} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Último jogo</div>
                <div className="truncate font-semibold">{g.games[last.game]?.name}</div>
                <div className="text-xs text-fg-muted">{ago(last.end)} · {fmtDur(last.end - last.start)}</div>
              </div>
            </>
          ) : <div className="text-sm text-fg-muted">Abra um jogo e ele aparece aqui sozinho.</div>}
        </div>
      )}
      <div className="relative flex gap-2 text-xs">
        <span className="flex-1 rounded-lg px-2 py-1" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>Hoje <b className="font-num">{fmtDur(today.total)}</b></span>
        <span className="flex-1 rounded-lg px-2 py-1" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>7 dias <b className="font-num">{fmtDur(week.total)}</b></span>
      </div>
      {w.h >= 300 && week.games.length > 0 && (
        <div className="relative space-y-1">
          {week.games.slice(0, Math.floor((w.h - 230) / 26)).map((x) => (
            <div key={x.id} className="flex items-center gap-2 text-xs">
              <GameIcon info={x.info} size={18} />
              <span className="min-w-0 flex-1 truncate">{x.info.name}</span>
              <span className="font-num">{fmtDur(x.ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
