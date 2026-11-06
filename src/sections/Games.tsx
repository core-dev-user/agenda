import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Trash2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { agoText, emptyGaming, fmtClock, fmtDur, perGame, sessionEnd, since, type GamingData } from "@/lib/gaming"
import { Segmented } from "@/components/ui/controls"
import { GameBackdrop } from "@/widgets/GamingWidget"
import { useNow } from "@/widgets/Clock"

const hm = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const setG = (fn: (g: GamingData) => GamingData) => useStore.setState((s) => ({ gaming: fn(s.gaming ?? emptyGaming()) }))

/** Registro de jogos: o que você jogou, quanto tempo e quando. */
export default function Games() {
  const g = useStore((s) => s.gaming) ?? emptyGaming()
  const running = useStore((s) => s.gamesRunning)
  const [p, setP] = useState<"7" | "30" | "all">("7")
  const now = useNow(1000)
  const minute = Math.floor(now.getTime() / 60000)
  const from = since(p === "all" ? null : Number(p))
  const games = useMemo(() => perGame(g, from), [g, from, minute])
  const total = games.reduce((a, x) => a + x.ms, 0)
  const [limit, setLimit] = useState(30)

  const days = useMemo(() => {
    const list = [...g.sessions].filter((s) => sessionEnd(s) > from).sort((a, b) => b.start - a.start).slice(0, limit)
    const m = new Map<string, typeof list>()
    for (const s of list) {
      const d = new Date(s.start)
      const k = d.toDateString() === new Date().toDateString() ? "Hoje" : d.toDateString() === new Date(Date.now() - 86400000).toDateString() ? "Ontem" : d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return [...m]
  }, [g, from, limit, minute])
  const count = g.sessions.filter((s) => sessionEnd(s) > from).length

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <div className="font-display text-2xl font-semibold">Registro de jogos</div>
          <div className="text-sm text-fg-muted">{total ? `${fmtDur(total)} jogados ${p === "all" ? "no total" : `nos últimos ${p} dias`}` : "Nada jogado neste período"}</div>
        </div>
        <Segmented value={p} onChange={setP} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "all", label: "Tudo" }]} />
      </div>

      {running.map((r) => (
        <div key={r.id} className="relative h-36 overflow-hidden rounded-[calc(var(--r)*0.8)] text-white">
          <GameBackdrop info={{ name: r.name, color: r.color, art: r.art }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
          <div className="relative flex h-full flex-col justify-end p-5">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-[#5ee3a1] uppercase">● Jogando agora</div>
            <div className="font-display text-3xl font-bold">{r.name}</div>
            <div className="font-num text-lg" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtClock(now.getTime() - r.start)} <span className="text-sm text-white/70">desde {hm(r.start)}</span></div>
          </div>
        </div>
      ))}

      {games.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((x, i) => (
            <motion.div key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="relative h-32 overflow-hidden rounded-[calc(var(--r)*0.7)] text-white">
              <GameBackdrop info={x.info} kenburns={false} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-3.5">
                <div className="truncate text-lg font-bold">{x.info.name}</div>
                <div className="flex items-baseline gap-2 text-xs text-white/75">
                  <b className="font-num text-base text-white">{fmtDur(x.ms)}</b>
                  <span>{x.sessions} {x.sessions === 1 ? "sessão" : "sessões"}</span>
                  <span className="ml-auto">{running.some((r) => r.id === x.id) ? "agora" : agoText(x.last)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white/85" style={{ width: `${(x.ms / Math.max(1, games[0].ms)) * 100}%` }} /></div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {days.length > 0 && (
        <div>
          <div className="mb-2 font-semibold">Sessões</div>
          <div className="space-y-4">
            {days.map(([day, ss]) => (
              <div key={day}>
                <div className="mb-1 flex justify-between border-b border-line pb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
                  <span>{day}</span><span className="font-num">{fmtDur(ss.reduce((a, s) => a + sessionEnd(s) - s.start, 0))}</span>
                </div>
                {ss.map((s) => {
                  const info = g.games[s.game]
                  return (
                    <div key={s.id} className="group flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                      <span className="h-6 w-1 rounded-full" style={{ background: info?.color || "var(--accent)" }} />
                      <span className="min-w-0 flex-1 truncate">{info?.name ?? s.game}</span>
                      <span className="font-num text-xs text-fg-muted">{hm(s.start)} – {s.open ? "agora" : hm(s.end)}</span>
                      <span className="font-num w-20 text-right text-sm">{fmtDur(sessionEnd(s) - s.start)}</span>
                      <button className="btn btn-ghost btn-icon !p-1 opacity-0 group-hover:opacity-70" title="Apagar esta sessão" onClick={() => setG((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== s.id) }))}><Trash2 size={12} /></button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {count > limit && <button className="mt-3 w-full text-sm text-fg-muted hover:text-fg" onClick={() => setLimit((l) => l + 60)}>Mostrar mais</button>}
        </div>
      )}

      {!games.length && !running.length && (
        <div className="py-16 text-center text-fg-muted">
          <div className="font-display text-lg text-fg">Nenhum jogo registrado ainda</div>
          <div className="mt-1 text-sm">Abra um jogo: o Agenda reconhece sozinho e começa a contar o tempo.</div>
        </div>
      )}
    </div>
  )
}
