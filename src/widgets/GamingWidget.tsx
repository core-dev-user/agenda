import { useMemo } from "react"
import { motion } from "framer-motion"
import { Gamepad2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { emptyGaming, fmtDur, gamingStats } from "@/lib/gaming"
import { GameIcon } from "@/components/GameIcon"
import { CS2Live, LastMatch, LolLive, ValorantLive } from "@/components/GameLive"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86400000)
  if (d <= 0) return "hoje"
  if (d === 1) return "ontem"
  return `há ${d} dias`
}

/** Widget: "Jogando agora: Valorant há 34 minutos" + dados ao vivo do jogo. Clique duas vezes para abrir o histórico. */
export function GamingWidget({ w }: { w: Widget }) {
  const g = useStore((s) => s.gaming) ?? emptyGaming()
  const live = useStore((s) => s.gameLive)
  const open = useStore((s) => s.openWindow)
  const now = useNow(15000)
  const minute = Math.floor(now.getTime() / 60000)
  const playing = g.sessions.filter((s) => s.open)
  const today = useMemo(() => gamingStats(g, "today"), [g, minute])
  const cur = playing[0]
  const info = cur ? g.games[cur.game] : undefined
  const mins = cur ? Math.floor((now.getTime() - cur.start) / 60000) : 0
  const todayGame = cur ? today.games.find((x) => x.id === cur.game) : undefined
  const last = [...g.sessions].filter((s) => !s.open).sort((a, b) => b.end - a.end)[0]
  const recent = (g.matches ?? []).slice(0, Math.max(1, Math.floor((w.h - 200) / 36)))

  return (
    <div className="relative flex h-full w-full flex-col gap-2.5 overflow-hidden p-3.5" onDoubleClick={() => open("games")} title="Clique duas vezes para ver o histórico">
      {cur && <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `radial-gradient(120% 80% at 0% 0%, ${info?.color || "var(--accent)"}, transparent 70%)` }} />}
      <div className="relative flex items-center gap-2 text-sm font-semibold">
        <Gamepad2 size={16} /> <span className="flex-1">{cur ? "Jogando agora" : "Jogos"}</span>
        {cur && <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#5ee3a1] opacity-70" /><span className="relative h-2.5 w-2.5 rounded-full bg-[#5ee3a1]" /></span>}
      </div>

      {cur ? (
        <motion.div key={cur.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative min-h-0 flex-1 space-y-2.5 overflow-hidden">
          <div className="flex items-center gap-3">
            <GameIcon info={info} size={44} />
            <div className="min-w-0 flex-1">
              <div className="font-display truncate text-lg font-semibold leading-tight">{info?.name ?? cur.game}</div>
              <div className="text-xs">há <b className="font-num">{mins < 60 ? `${mins} ${mins === 1 ? "minuto" : "minutos"}` : fmtDur(mins * 60000)}</b>{todayGame && todayGame.ms - (now.getTime() - cur.start) > 60000 ? <span className="text-fg-muted"> · {fmtDur(todayGame.ms)} hoje</span> : null}</div>
            </div>
          </div>
          {cur.game === "cs2" && <CS2Live d={live.cs2} />}
          {cur.game === "valorant" && <ValorantLive d={live.valorant} />}
          {cur.game === "lol" && <LolLive d={live.lol} />}
          {!["cs2", "valorant", "lol"].includes(cur.game) && <OtherGame id={cur.game} />}
        </motion.div>
      ) : (
        <div className="relative min-h-0 flex-1 space-y-2 overflow-hidden">
          {last ? (
            <div className="flex items-center gap-3">
              <GameIcon info={g.games[last.game]} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Último jogo</div>
                <div className="truncate font-semibold">{g.games[last.game]?.name}</div>
                <div className="text-xs text-fg-muted">{ago(last.end)} · {fmtDur(last.end - last.start)}</div>
              </div>
            </div>
          ) : <div className="text-sm text-fg-muted">Abra um jogo e ele aparece aqui sozinho.</div>}
          {recent.length > 0 && <div className="space-y-1">{recent.map((m) => <LastMatch key={m.id} m={m} compact />)}</div>}
        </div>
      )}

      <div className="relative flex gap-2 text-xs">
        <span className="flex-1 rounded-lg px-2 py-1" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>Hoje <b className="font-num">{fmtDur(today.total)}</b></span>
        <span className="flex-1 truncate rounded-lg px-2 py-1 text-fg-muted" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>2 cliques = histórico</span>
      </div>
    </div>
  )
}

/** jogos sem estatísticas próprias: o que o Agenda sabe dele */
function OtherGame({ id }: { id: string }) {
  const g = useStore((s) => s.gaming) ?? emptyGaming()
  const all = useMemo(() => gamingStats(g, "all"), [g])
  const week = useMemo(() => gamingStats(g, "7"), [g])
  const a = all.games.find((x) => x.id === id), wk = week.games.find((x) => x.id === id)
  return (
    <div className="flex gap-1.5 text-center">
      {[["Nesta semana", wk ? fmtDur(wk.ms) : "—"], ["No total", a ? fmtDur(a.ms) : "—"], ["Sessões", String(a?.sessions ?? 0)]].map(([l, v]) => (
        <div key={l} className="flex-1 rounded-lg px-2 py-1" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>
          <div className="font-num text-sm font-semibold">{v}</div><div className="text-[9px] tracking-wide text-fg-muted uppercase">{l}</div>
        </div>
      ))}
    </div>
  )
}
