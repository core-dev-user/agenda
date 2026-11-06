import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Clock, EyeOff, Gamepad2, History, Layers, Plus, RefreshCw, Timer, Trash2, Trophy } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import { emptyGaming, fmtDur, gamingStats, type GamingData, type GPeriod } from "@/lib/gaming"
import { GameIcon } from "@/components/GameIcon"
import { CS2Live, LastMatch, LolLive, RESULT, ValorantLive } from "@/components/GameLive"
import { periodStart } from "@/lib/gaming"
import { Card, Segmented } from "@/components/ui/controls"
import { useNow } from "@/widgets/Clock"
import { todayISO } from "@/lib/utils"

const PERIODS: { value: GPeriod; label: string }[] = [
  { value: "today", label: "Hoje" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "year", label: "Este ano" }, { value: "all", label: "Tudo" },
]
const setG = (fn: (g: GamingData) => GamingData) => useStore.setState((s) => ({ gaming: fn(s.gaming ?? emptyGaming()) }))
const hm = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

/** Aba Jogos: o registro geral de tudo que você jogou. */
export default function Games() {
  const g = useStore((s) => s.gaming) ?? emptyGaming()
  const [p, setP] = useState<GPeriod>("7")
  const lv = useStore((s) => s.gameLive)
  const now = useNow(30000)
  const st = useMemo(() => gamingStats(g, p), [g, p, Math.floor(now.getTime() / 60000)])
  const playing = g.sessions.filter((s) => s.open)
  const maxGame = Math.max(1, ...st.games.map((x) => x.ms))

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-display flex-1 text-2xl font-semibold">Seus jogos</div>
        <Segmented value={p} onChange={setP} options={PERIODS} />
      </div>

      {playing.map((s) => {
        const info = g.games[s.game]
        return (
          <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative flex items-center gap-4 overflow-hidden rounded-[calc(var(--r)*0.7)] border border-line p-4">
            <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `linear-gradient(110deg, ${info?.color || "var(--accent)"}, transparent 65%)` }} />
            <GameIcon info={info} size={56} />
            <div className="relative flex-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-[#5ee3a1] uppercase"><span className="h-2 w-2 animate-pulse rounded-full bg-[#5ee3a1]" /> Jogando agora</div>
              <div className="font-display text-2xl font-semibold">{info?.name}</div>
              <div className="text-sm text-fg-muted">desde {hm(s.start)} · <b className="font-num text-fg">{fmtDur(now.getTime() - s.start)}</b></div>
            </div>
            {["cs2", "valorant", "lol"].includes(s.game) && (
              <div className="relative w-[380px] max-w-[45%]">
                {s.game === "cs2" && <CS2Live d={lv.cs2} />}
                {s.game === "valorant" && <ValorantLive d={lv.valorant} />}
                {s.game === "lol" && <LolLive d={lv.lol} />}
              </div>
            )}
          </motion.div>
        )
      })}

      {st.total === 0 ? (
        <Card className="py-10 text-center">
          <div className="text-4xl">🎮</div>
          <div className="font-display mt-2 text-lg">Nada jogado {p === "today" ? "hoje" : "neste período"}</div>
          <div className="mx-auto mt-1 max-w-md text-sm text-fg-muted">O Agenda reconhece sozinho quando você abre um jogo (Valorant, CS2, LoL, Fortnite e qualquer jogo da Steam, Epic ou Xbox) e registra o tempo aqui.</div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Clock size={14} />} label="Tempo jogado" value={fmtDur(st.total)} sub={p !== "today" ? `média ${fmtDur(st.total / Math.max(1, Math.min(st.perDay.size || 1, p === "7" ? 7 : p === "30" ? 30 : st.perDay.size || 1)))} por dia jogado` : undefined} />
            <Tile icon={<Layers size={14} />} label="Sessões" value={String(st.sessions)} sub={st.sessions ? `${fmtDur(st.total / st.sessions)} em média` : undefined} />
            <Tile icon={<Trophy size={14} />} label="Mais jogado" value={st.games[0]?.info.name ?? "—"} sub={st.games[0] ? `${Math.round((st.games[0].ms / st.total) * 100)}% do tempo` : undefined} />
            <Tile icon={<Timer size={14} />} label="Sessão mais longa" value={st.longest ? fmtDur((st.longest.open ? Date.now() : st.longest.end) - st.longest.start) : "—"} sub={st.longest ? `${g.games[st.longest.game]?.name} · ${new Date(st.longest.start).toLocaleDateString("pt-BR")}` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card>
              <div className="mb-2 flex items-center gap-1.5 font-semibold"><Gamepad2 size={15} /> Por jogo</div>
              <div className="space-y-1">
                {st.games.map((x) => (
                  <div key={x.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                    <GameIcon info={x.info} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2"><span className="truncate font-medium">{x.info.name}</span><span className="text-[11px] text-fg-muted">{x.sessions} sess{x.sessions === 1 ? "ão" : "ões"}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]"><div className="h-full rounded-full" style={{ width: `${(x.ms / maxGame) * 100}%`, background: "var(--viz-1)" }} /></div>
                    </div>
                    <span className="font-num w-24 text-right text-sm">{fmtDur(x.ms)}</span>
                    <button className="btn btn-ghost btn-icon !p-1 opacity-0 group-hover:opacity-70" title="Não é um jogo / parar de registrar" onClick={() => confirm(`Parar de registrar "${x.info.name}"? (o histórico dele continua)`) && setG((d) => ({ ...d, ignored: [...new Set([...d.ignored, x.id])] }))}><EyeOff size={13} /></button>
                  </div>
                ))}
              </div>
            </Card>
            <div className="space-y-4">
              <Card>
                <div className="mb-1 font-semibold">Tempo por dia</div>
                <DayBars perDay={st.perDay} days={p === "today" || p === "7" ? 7 : 30} />
              </Card>
              <Card>
                <div className="mb-1 font-semibold">Horário em que você mais joga</div>
                <HourBars hours={st.hours} />
              </Card>
            </div>
          </div>
        </>
      )}

      <Matches g={g} p={p} />
      <SessionLog g={g} />
      <GameSettings g={g} />
    </div>
  )
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="min-w-0 !p-3">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-fg-muted uppercase">{icon}{label}</div>
      <div className="font-num mt-1 truncate text-2xl font-semibold">{value}</div>
      {sub && <div className="truncate text-[11px] text-fg-muted">{sub}</div>}
    </Card>
  )
}

function DayBars({ perDay, days }: { perDay: Map<string, number>; days: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const list = Array.from({ length: days }, (_, i) => { const d = new Date(Date.now() - (days - 1 - i) * 86400000); const k = todayISO(d); return { d, v: perDay.get(k) ?? 0 } })
  const max = Math.max(30 * 60000, ...list.map((x) => x.v))
  return (
    <div className="relative">
      <div className="flex h-28 items-end gap-[3px] border-b border-line">
        {list.map((x, i) => (
          <div key={i} className="flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[4px]" style={{ height: `${(x.v / max) * 100}%`, minHeight: x.v ? 2 : 0, background: "var(--viz-1)", opacity: hover == null || hover === i ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-fg-muted"><span>{list[0].d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span><span>hoje</span></div>
      {hover != null && (
        <div className="pointer-events-none absolute -top-2 rounded-lg border border-line px-2 py-1 text-xs shadow-lg" style={{ background: "var(--field)", left: `${((hover + 0.5) / days) * 100}%`, transform: "translate(-50%, -100%)" }}>
          <b>{list[hover].d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</b> · <span className="font-num">{fmtDur(list[hover].v)}</span>
        </div>
      )}
    </div>
  )
}

function HourBars({ hours }: { hours: number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...hours)
  const top = hours.indexOf(Math.max(...hours))
  return (
    <div className="relative">
      <div className="flex h-24 items-end gap-[2px] border-b border-line">
        {hours.map((v, h) => (
          <div key={h} className="flex h-full flex-1 items-end" onPointerEnter={() => setHover(h)} onPointerLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[3px]" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, background: "var(--viz-1)", opacity: hover == null || hover === h ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-fg-muted"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
      {hours[top] > 0 && <div className="mt-0.5 text-xs text-fg-muted">Pico entre {top}h e {top + 1}h</div>}
      {hover != null && (
        <div className="pointer-events-none absolute -top-2 rounded-lg border border-line px-2 py-1 text-xs shadow-lg" style={{ background: "var(--field)", left: `${((hover + 0.5) / 24) * 100}%`, transform: "translate(-50%, -100%)" }}>
          <b>{hover}h–{hover + 1}h</b> · <span className="font-num">{fmtDur(hours[hover])}</span>
        </div>
      )}
    </div>
  )
}

/** registro geral: todas as sessões, por dia */
function SessionLog({ g }: { g: GamingData }) {
  const [limit, setLimit] = useState(40)
  const list = [...g.sessions].sort((a, b) => b.start - a.start)
  if (!list.length) return null
  const groups = new Map<string, typeof list>()
  for (const s of list.slice(0, limit)) {
    const d = new Date(s.start)
    const k = d.toDateString() === new Date().toDateString() ? "Hoje" : d.toDateString() === new Date(Date.now() - 86400000).toDateString() ? "Ontem" : d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  return (
    <Card>
      <div className="mb-2 flex items-center gap-1.5 font-semibold"><History size={15} /> Registro de sessões</div>
      <div className="space-y-3">
        {[...groups].map(([day, ss]) => (
          <div key={day}>
            <div className="mb-1 flex justify-between text-[10px] font-semibold tracking-wide text-fg-muted uppercase"><span>{day}</span><span className="font-num">{fmtDur(ss.reduce((a, s) => a + ((s.open ? Date.now() : s.end) - s.start), 0))}</span></div>
            {ss.map((s) => (
              <div key={s.id} className="group flex items-center gap-2.5 py-1 text-sm">
                <GameIcon info={g.games[s.game]} size={24} />
                <span className="min-w-0 flex-1 truncate">{g.games[s.game]?.name ?? s.game}</span>
                <span className="font-num text-xs text-fg-muted">{hm(s.start)} – {s.open ? "agora" : hm(s.end)}</span>
                <span className="font-num w-20 text-right">{fmtDur((s.open ? Date.now() : s.end) - s.start)}</span>
                <button className="btn btn-ghost btn-icon !p-1 opacity-0 group-hover:opacity-70" title="Apagar sessão" onClick={() => setG((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== s.id) }))}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {list.length > limit && <button className="mt-2 w-full text-sm text-fg-muted hover:text-fg" onClick={() => setLimit((l) => l + 60)}>Mostrar mais ({list.length - limit})</button>}
    </Card>
  )
}

/** jogo não reconhecido? adicione pelo nome do .exe */
function GameSettings({ g }: { g: GamingData }) {
  const [exe, setExe] = useState("")
  const [name, setName] = useState("")
  const add = () => {
    const e = exe.trim().replace(/^.*[\\/]/, "")
    if (!e) return
    setG((d) => ({ ...d, custom: [...d.custom.filter((c) => c.exe.toLowerCase() !== (e.toLowerCase().endsWith(".exe") ? e : e + ".exe").toLowerCase()), { exe: e.toLowerCase().endsWith(".exe") ? e : e + ".exe", name: name.trim() || e.replace(/\.exe$/i, "") }] }))
    setExe(""); setName("")
  }
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2 font-semibold"><span className="flex-1">Jogos reconhecidos</span><button className="btn !py-1 text-xs" onClick={() => bridge.games.scan()}><RefreshCw size={12} /> Verificar agora</button></div>
      <div className="mb-2 text-sm text-fg-muted">O Agenda olha os programas abertos a cada 30 segundos. Se algum jogo não aparecer, adicione pelo nome do arquivo .exe (no Gerenciador de Tarefas: botão direito no jogo → Detalhes).</div>
      <div className="flex flex-wrap gap-2">
        <input className="field !w-56" placeholder="ex.: MeuJogo.exe" value={exe} onChange={(e) => setExe(e.target.value)} />
        <input className="field !w-48" placeholder="Nome para mostrar" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" onClick={add}><Plus size={14} /> Adicionar</button>
      </div>
      {g.custom.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {g.custom.map((c) => <span key={c.exe} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs">{c.name} <span className="text-fg-muted">({c.exe})</span><button onClick={() => setG((d) => ({ ...d, custom: d.custom.filter((x) => x.exe !== c.exe) }))}><Trash2 size={11} /></button></span>)}
        </div>
      )}
      {g.ignored.length > 0 && (
        <div className="mt-2 text-xs text-fg-muted">
          Ignorados: {g.ignored.map((id) => <button key={id} className="mr-2 underline" title="Voltar a registrar" onClick={() => setG((d) => ({ ...d, ignored: d.ignored.filter((x) => x !== id) }))}>{g.games[id]?.name ?? id}</button>)}
        </div>
      )}
    </Card>
  )
}

/** partidas com KDA (CS2, Valorant, LoL) */
function Matches({ g, p }: { g: GamingData; p: GPeriod }) {
  const from = periodStart(p)
  const list = (g.matches ?? []).filter((m) => m.at >= from)
  const [limit, setLimit] = useState(15)
  if (!(g.matches ?? []).length) return null
  const by = new Map<string, typeof list>()
  for (const m of list) by.set(m.game, [...(by.get(m.game) ?? []), m])
  return (
    <Card>
      <div className="mb-2 flex items-center gap-1.5 font-semibold"><Trophy size={15} /> Partidas</div>
      {list.length === 0 ? <div className="text-sm text-fg-muted">Nenhuma partida registrada neste período.</div> : (
        <>
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            {[...by].map(([game, ms]) => {
              const w = ms.filter((m) => m.result === "win").length, l = ms.filter((m) => m.result === "loss").length
              const avg = (k: "k" | "d" | "a") => (ms.reduce((s, m) => s + (m[k] ?? 0), 0) / ms.length).toFixed(1)
              const kd = ms.reduce((s, m) => s + (m.k ?? 0), 0) / Math.max(1, ms.reduce((s, m) => s + (m.d ?? 0), 0))
              return (
                <div key={game} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                  <GameIcon info={g.games[game]} size={36} />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate text-sm font-semibold">{g.games[game]?.name ?? game}</div>
                    <div><span style={{ color: RESULT.win.c }}>{w}V</span> · <span style={{ color: RESULT.loss.c }}>{l}D</span>{w + l ? ` · ${Math.round((w / (w + l)) * 100)}% de vitórias` : ""}</div>
                    <div className="text-fg-muted">média {avg("k")}/{avg("d")}/{avg("a")} · K/D {kd.toFixed(2)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="space-y-1">
            {list.slice(0, limit).map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <GameIcon info={g.games[m.game]} size={22} />
                <span className="w-24 text-xs text-fg-muted">{new Date(m.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} {hm(m.at)}</span>
                <div className="min-w-0 flex-1"><LastMatch m={m} compact /></div>
              </div>
            ))}
          </div>
          {list.length > limit && <button className="mt-2 w-full text-sm text-fg-muted hover:text-fg" onClick={() => setLimit((l) => l + 30)}>Mostrar mais ({list.length - limit})</button>}
        </>
      )}
    </Card>
  )
}
