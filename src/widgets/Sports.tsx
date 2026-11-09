import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Pin, Plus, RefreshCw, Search, Star, Volleyball, X } from "lucide-react"
import { bridge, friendlyError, type FavTeam, type SportMatch, type SportTeam } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/controls"

type Sport = "cs2" | "valorant" | "football"

export const LEAGUES = [
  { id: "bra.1", label: "Brasileirão", group: "Brasil" },
  { id: "bra.2", label: "Série B", group: "Brasil" },
  { id: "bra.copa_do_brazil", label: "Copa do Brasil", group: "Brasil" },
  { id: "conmebol.libertadores", label: "Libertadores", group: "América do Sul" },
  { id: "conmebol.sudamericana", label: "Sul-Americana", group: "América do Sul" },
  { id: "arg.1", label: "Argentino", group: "América do Sul" },
  { id: "uefa.champions", label: "Champions League", group: "Europa" },
  { id: "uefa.europa", label: "Europa League", group: "Europa" },
  { id: "uefa.europa.conf", label: "Conference League", group: "Europa" },
  { id: "eng.1", label: "Premier League", group: "Inglaterra" },
  { id: "eng.2", label: "Championship", group: "Inglaterra" },
  { id: "eng.3", label: "League One", group: "Inglaterra" },
  { id: "esp.1", label: "La Liga", group: "Europa" },
  { id: "ita.1", label: "Série A (ITA)", group: "Europa" },
  { id: "ger.1", label: "Bundesliga", group: "Europa" },
  { id: "fra.1", label: "Ligue 1", group: "Europa" },
  { id: "por.1", label: "Liga Portugal", group: "Europa" },
  { id: "ned.1", label: "Eredivisie", group: "Europa" },
  { id: "usa.1", label: "MLS", group: "Outros" },
  { id: "fifa.world", label: "Copa do Mundo", group: "Outros" },
  { id: "fifa.friendly", label: "Amistosos", group: "Outros" },
]
const DEFAULT_LEAGUES = ["bra.1", "conmebol.libertadores", "uefa.champions", "uefa.europa", "eng.1", "esp.1", "eng.3"]

const META: Record<Sport, { title: string; color: string; site: string; siteUrl: string }> = {
  cs2: { title: "Counter-Strike 2", color: "#f5a524", site: "HLTV", siteUrl: "https://www.hltv.org/matches" },
  valorant: { title: "Valorant", color: "#ff4655", site: "vlr.gg", siteUrl: "https://www.vlr.gg/matches" },
  football: { title: "Futebol", color: "#2fd27a", site: "ESPN", siteUrl: "https://www.espn.com.br/futebol/resultados" },
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
/** times favoritos do widget (lista escolhida; versões antigas guardavam um texto separado por vírgula) */
export function widgetFavs(w: Widget): FavTeam[] {
  if (Array.isArray(w.config.favs)) return w.config.favs
  return String(w.config.teams ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((name) => ({ name }))
}
const sameFav = (a: FavTeam, b: FavTeam) => (a.id && b.id ? a.id === b.id : norm(a.name) === norm(b.name))
/** o time da partida é esse favorito? (futebol compara pelo id da ESPN; e-sports pelo nome) */
function teamIs(t: SportTeam, f: FavTeam) {
  if (f.id && t.id) return f.id === t.id
  const n = norm(t.name), sh = norm(t.short || ""), fn = norm(f.name)
  if (!fn || n === norm("A definir")) return false
  if (n === fn || sh === fn || (!!f.short && sh === norm(f.short))) return true
  return fn.length >= 4 && n.length >= 4 && (n.includes(fn) || fn.includes(n))
}
const isFav = (m: SportMatch, favs: FavTeam[]) => favs.some((f) => teamIs(m.a, f) || teamIs(m.b, f))
const asTeam = (f: FavTeam): SportTeam => ({ ...f, short: f.short || f.name })

function when(ms: number) {
  if (!ms) return ""
  const d = new Date(ms)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = Math.round((new Date(d).setHours(0, 0, 0, 0) - +today) / 86400000)
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (day === 0) return hm
  if (day === 1) return "Amanhã " + hm
  if (day === -1) return "Ontem"
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "")
}

/* escudo / logo com reserva: bandeira (vlr) ou iniciais */
function Crest({ t, size, color }: { t: SportTeam; size: number; color: string }) {
  const [bad, setBad] = useState(false)
  if (t.logo && !bad)
    return <img src={t.logo} onError={() => setBad(true)} draggable={false} className="shrink-0 object-contain" style={{ width: size, height: size, filter: "drop-shadow(0 2px 4px rgb(0 0 0 / .35))" }} />
  // sem logo (vlr.gg): bandeira do país do time (o Windows não desenha emoji de bandeira)
  const flag = t.flag && /^[a-z]{2}$/.test(t.flag) && !["un", "eu"].includes(t.flag) && !bad ? `https://flagcdn.com/w80/${t.flag}.png` : ""
  if (flag)
    return (
      <div className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <img src={flag} onError={() => setBad(true)} draggable={false} className="w-full rounded-[3px] object-cover" style={{ aspectRatio: "4 / 3", boxShadow: "0 1px 3px rgb(0 0 0 / .45), inset 0 0 0 1px rgb(255 255 255 / .12)" }} />
      </div>
    )
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 40%, #000))` }}>
      {(t.short || t.name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "?"}
    </div>
  )
}

function LiveDot({ color = "#ff3b47" }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inset-0 animate-ping rounded-full opacity-70" style={{ background: color }} />
      <span className="relative h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  )
}

/** Partida em destaque (ao vivo): estilo placar grande. */
function Hero({ m, color, fav, crests }: { m: SportMatch; color: string; fav: boolean; crests: boolean }) {
  return (
    <button
      className="relative mb-2 w-full overflow-hidden rounded-[calc(var(--r)*0.6)] p-3 text-left"
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 30%, transparent), color-mix(in srgb, ${color} 6%, transparent))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)` }}
      onClick={() => bridge.app.openExternal(m.link)}
      title="Abrir a partida"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
        <LiveDot /> <span className="text-[#ff5a63]">Ao vivo</span>
        {m.detail && <span className="truncate text-fg-muted normal-case">· {m.detail}</span>}
        {fav && <Star size={12} className="ml-auto fill-current text-amber-300" />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          {crests && <Crest t={m.a} size={42} color={color} />}
          <div className="w-full truncate text-center text-xs font-medium">{m.a.name}</div>
        </div>
        <div className="font-num shrink-0 text-3xl font-bold tabular-nums">
          {m.a.score ?? 0}<span className="mx-1.5 text-fg-muted">:</span>{m.b.score ?? 0}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          {crests && <Crest t={m.b} size={42} color={color} />}
          <div className="w-full truncate text-center text-xs font-medium">{m.b.name}</div>
        </div>
      </div>
      <div className="mt-1.5 truncate text-center text-[11px] text-fg-muted">{m.event}</div>
    </button>
  )
}

function Row({ m, color, fav, crests, pinned }: { m: SportMatch; color: string; fav: boolean; crests: boolean; pinned?: boolean }) {
  const done = m.state === "done"
  const live = m.state === "live"
  const team = (t: SportTeam, other: SportTeam) => {
    const lost = done && (other.win || (!t.win && Number(other.score) > Number(t.score)))
    return (
      <div className={cn("flex items-center gap-2", lost && "opacity-55")}>
        {crests && <Crest t={t} size={18} color={color} />}
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", (t.win || (done && !lost)) && "font-semibold")}>{t.name}</span>
        {t.score != null && t.score !== "" && <span className={cn("font-num w-5 text-right text-[13px] tabular-nums", live && "text-[#ff5a63]", !lost && "font-semibold")}>{t.score}</span>}
      </div>
    )
  }
  return (
    <button
      className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]", fav && !pinned && "bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}
      style={pinned ? { background: `linear-gradient(90deg, color-mix(in srgb, ${color} 16%, transparent), color-mix(in srgb, ${color} 4%, transparent))`, boxShadow: `inset 2px 0 0 ${color}` } : undefined}
      onClick={() => bridge.app.openExternal(m.link)}
      title={`${m.event}${m.detail ? " · " + m.detail : ""}`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {team(m.a, m.b)}
        {team(m.b, m.a)}
      </div>
      <div className="w-[62px] shrink-0 text-right text-[11px] leading-tight">
        {live ? (
          <span className="inline-flex items-center gap-1 font-semibold text-[#ff5a63]"><LiveDot /> {m.league && m.detail ? m.detail : "AO VIVO"}</span>
        ) : done ? (
          <span className="text-fg-muted">{m.detail === "Pênaltis" ? "Pên." : when(m.start) || "Fim"}</span>
        ) : (
          <span className="font-num text-fg">{when(m.start)}</span>
        )}
        <div className="truncate text-[10px] text-fg-muted">{pinned ? m.event : <>{fav ? "★ " : ""}{m.detail && !live && m.detail !== "Encerrado" ? m.detail : ""}</>}</div>
      </div>
    </button>
  )
}

export function SportsWidget({ w }: { w: Widget }) {
  const sport = w.type as Sport
  const meta = META[sport]
  const leagues: string[] = w.config.leagues?.length ? w.config.leagues : DEFAULT_LEAGUES
  // favoritos gerais SÓ deste esporte (o Corinthians não aparece no widget de CS2)
  const globalFavs = useStore((x) => x.settings.favBySport?.[sport])
  const own = widgetFavs(w)
  // sem times escolhidos no widget: usa os favoritos gerais do esporte (Configurações › Rotina e avisos)
  const fav = useMemo<FavTeam[]>(() => (own.length ? own : (globalFavs ?? []).map((name) => ({ name }))), [JSON.stringify(own), (globalFavs ?? []).join(",")])
  const favKey = fav.map((f) => f.id || f.name).join(",")
  const onlyFav = !!w.config.onlyFav && fav.length > 0
  // dá para esconder o ícone do widget, os escudos/logos dos times e os logos dos campeonatos
  const showIcon = w.config.showIcon !== false
  const crests = w.config.crests !== false
  const leagueLogos = w.config.leagueLogos !== false
  const [tab, setTab] = useState<"next" | "results">("next")
  const [data, setData] = useState<SportMatch[] | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setBusy(true)
    bridge.sports.get(sport, { leagues, teams: fav.filter((f) => f.id && f.league).map((f) => ({ id: f.id, league: f.league })) })
      .then((d) => { if (alive) { setData(d); setErr("") } })
      .catch((e) => alive && setErr(friendlyError(e)))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [sport, leagues.join(","), favKey, tick])

  const hasLive = !!data?.some((m) => m.state === "live")
  // atualiza sozinho: mais rápido quando tem jogo ao vivo
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), hasLive ? 30_000 : 180_000)
    return () => clearInterval(id)
  }, [hasLive])

  const label = (m: SportMatch) => (m.league ? LEAGUES.find((l) => l.id === m.league)?.label ?? m.event : m.event)
  const { live, next, results } = useMemo(() => {
    let all = (data ?? []).map((m) => ({ ...m, event: label(m) }))
    if (onlyFav) all = all.filter((m) => isFav(m, fav))
    const byFav = (a: SportMatch, b: SportMatch) => Number(isFav(b, fav)) - Number(isFav(a, fav))
    return {
      live: all.filter((m) => m.state === "live").sort((a, b) => byFav(a, b) || a.start - b.start),
      next: all.filter((m) => m.state === "upcoming").sort((a, b) => a.start - b.start),
      results: all.filter((m) => m.state === "done").sort((a, b) => b.start - a.start),
    }
  }, [data, onlyFav, favKey])

  // fixados no topo: o próximo jogo (ou o que está ao vivo) de cada time favorito, na ordem escolhida
  const pins = useMemo(() => {
    const out: { f: FavTeam; m?: SportMatch }[] = []
    const used = new Set<string>()
    const soon = [...live, ...next]
    for (const f of fav) {
      const m = soon.find((x) => teamIs(x.a, f) || teamIs(x.b, f))
      if (m && used.has(m.id)) continue // os dois favoritos se enfrentam: um cartão só
      if (m) used.add(m.id)
      out.push({ f, m })
    }
    return out
  }, [live, next, favKey])
  const pinnedIds = new Set(pins.flatMap((p) => (p.m ? [p.m.id] : [])))
  const showPins = tab === "next" && pins.length > 0 && !!data
  const room = w.h >= 280
  const pinHero = showPins && room ? pins.find((p) => p.m?.state === "live")?.m ?? null : null
  const heroOn = tab === "next" && !pinHero && live.length > 0 && room
  const hero = heroOn ? live.find((m) => !pinnedIds.has(m.id)) ?? null : null
  const list = tab === "next" ? [...live, ...next].filter((m) => m !== hero && !(showPins && pinnedIds.has(m.id))) : results

  // agrupa por campeonato (como no widget do Google)
  const groups: { event: string; logo?: string; items: SportMatch[] }[] = []
  for (const m of list.slice(0, 40)) {
    const g = groups.at(-1)
    if (g && g.event === m.event) g.items.push(m)
    else groups.push({ event: m.event, logo: m.eventLogo, items: [m] })
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        {showIcon && <SportIcon sport={sport} color={meta.color} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm leading-tight font-semibold">{meta.title}</div>
          <button className="text-[10px] text-fg-muted hover:text-fg" onClick={() => bridge.app.openExternal(meta.siteUrl)}>abrir no {meta.site} ↗</button>
        </div>
        {live.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[#ff3b47]/15 px-2 py-0.5 text-[10px] font-bold text-[#ff5a63]"><LiveDot /> {live.length}</span>
        )}
        <div className="flex rounded-full p-0.5" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
          {(["next", "results"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cn("relative rounded-full px-2 py-0.5 text-[11px] transition-colors", tab === k ? "text-white" : "text-fg-muted hover:text-fg")}>
              {tab === k && <motion.span layoutId={`sp-tab-${w.id}`} className="absolute inset-0 rounded-full" style={{ background: meta.color }} transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
              <span className="relative">{k === "next" ? "Jogos" : "Resultados"}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-icon !p-1" title="Atualizar" onClick={() => setTick((t) => t + 1)}><RefreshCw size={12} className={cn(busy && "animate-spin")} /></button>
      </div>

      {showPins && (
        <div className="mb-1.5 max-h-[58%] shrink-0 overflow-auto border-b border-line pb-1.5" data-nodrag>
          <div className="flex items-center gap-1 px-2 pb-0.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
            <Pin size={10} style={{ color: meta.color }} /> {pins.length > 1 ? "Seus times" : "Seu time"}
          </div>
          {pinHero && <Hero m={pinHero} color={meta.color} fav crests={crests} />}
          <div className="space-y-1">
            {pins.filter((p) => p.m !== pinHero).map((p) =>
              p.m ? (
                <Row key={p.m.id} m={p.m} color={meta.color} fav crests={crests} pinned />
              ) : (
                <div key={p.f.id || p.f.name} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] text-fg-muted" style={{ boxShadow: `inset 2px 0 0 color-mix(in srgb, ${meta.color} 45%, transparent)` }}>
                  {crests && <Crest t={asTeam(p.f)} size={18} color={meta.color} />}
                  <span className="min-w-0 flex-1 truncate text-fg">{p.f.name}</span>
                  <span className="text-[11px]">sem jogo marcado</span>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto pr-0.5" data-nodrag>
        {err && !data && <div className="p-3 text-center text-sm text-fg-muted">Não consegui carregar agora.<div className="text-xs">{err}</div></div>}
        {!data && !err && (
          <div className="space-y-2 p-1">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-xl" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }} />)}</div>
        )}
        <AnimatePresence initial={false}>
          {hero && (
            <motion.div key={hero.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Hero m={hero} color={meta.color} fav={isFav(hero, fav)} crests={crests} />
            </motion.div>
          )}
        </AnimatePresence>
        {showPins && !onlyFav && list.length > 0 && <div className="px-2 pt-0.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Outros jogos</div>}
        {data && list.length === 0 && !hero && !(showPins && onlyFav) && (
          <div className="p-4 text-center text-sm text-fg-muted">
            {tab === "next" ? (onlyFav ? "Nenhum jogo dos seus times nos próximos dias." : "Nenhum jogo nos próximos dias.") : "Sem resultados recentes."}
          </div>
        )}
        {groups.map((g, i) => (
          <div key={g.event + i} className="mb-1.5">
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
              {g.logo && leagueLogos && <img src={g.logo} className="h-3.5 w-3.5 object-contain" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />}
              <span className="truncate">{g.event}</span>
            </div>
            {g.items.map((m) => <Row key={m.id} m={m} color={meta.color} fav={isFav(m, fav)} crests={crests} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

function SportIcon({ sport, color }: { sport: Sport; color: string }) {
  const box = "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
  const bg = { background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 45%, #000))`, boxShadow: `0 4px 12px -3px color-mix(in srgb, ${color} 60%, transparent), inset 0 1px 0 rgb(255 255 255 / .35)` }
  if (sport === "football") return <div className={box} style={bg}><Volleyball size={17} /></div>
  if (sport === "valorant")
    return (
      <div className={box} style={bg}>
        <svg viewBox="0 0 24 24" width="17" height="17"><path d="M2 4l11.5 14.5H8.3L2 10.6zM22 4v6.6l-4.7 5.9H12z" fill="#fff" /></svg>
      </div>
    )
  return (
    <div className={box} style={bg}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /><circle cx="12" cy="12" r="1.3" fill="#fff" stroke="none" /></svg>
    </div>
  )
}

/** Opções no painel de configurar o widget. */
export function SportsSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const c = w.config
  const leagues: string[] = c.leagues?.length ? c.leagues : DEFAULT_LEAGUES
  return (
    <>
      {w.type === "football" && (
        <>
          <div className="text-sm text-fg-muted">Campeonatos</div>
          {[...new Set(LEAGUES.map((l) => l.group))].map((g) => (
          <div key={g}>
          <div className="mt-1 mb-1 text-[11px] tracking-wide text-fg-muted uppercase">{g}</div>
          <div className="flex flex-wrap gap-1.5">
            {LEAGUES.filter((l) => l.group === g).map((l) => {
              const on = leagues.includes(l.id)
              return (
                <button
                  key={l.id}
                  className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-transparent bg-brand text-white" : "border-line text-fg-muted hover:text-fg")}
                  onClick={() => {
                    const next = on ? leagues.filter((x) => x !== l.id) : [...leagues, l.id]
                    set({ leagues: next.length ? next : [l.id] })
                  }}
                >
                  {l.label}
                </button>
              )
            })}
          </div>
          </div>
          ))}
        </>
      )}
      <TeamPicker w={w} set={set} leagues={leagues} />
      <Switch label="Mostrar só os jogos dos meus times" checked={!!c.onlyFav} onChange={(v) => set({ onlyFav: v })} />
      <div className="text-sm text-fg-muted">Ícones</div>
      <Switch label="Ícone do widget (no canto de cima)" checked={c.showIcon !== false} onChange={(v) => set({ showIcon: v })} />
      <Switch label={w.type === "football" ? "Escudos dos times" : "Logos e bandeiras dos times"} checked={c.crests !== false} onChange={(v) => set({ crests: v })} />
      <Switch label="Logos dos campeonatos" checked={c.leagueLogos !== false} onChange={(v) => set({ leagueLogos: v })} />
      <div className="text-xs text-fg-muted">
        O próximo jogo de cada time escolhido fica fixado no topo do widget; embaixo vêm os outros jogos. Clique numa partida para abrir no {META[w.type as Sport].site}.
        {w.type === "cs2" && " Dados de jogos via Liquipedia (a HLTV não permite leitura automática)."}
      </div>
    </>
  )
}

/** escolher os times favoritos: busca + lista com escudos (futebol: times dos campeonatos marcados) */
function TeamPicker({ w, set, leagues }: { w: Widget; set: (p: Record<string, any>) => void; leagues: string[] }) {
  const sport = w.type as Sport
  const color = META[sport].color
  const favs = widgetFavs(w)
  const [all, setAll] = useState<FavTeam[] | null>(null)
  const [q, setQ] = useState("")
  const [lg, setLg] = useState("")
  useEffect(() => {
    let alive = true
    setAll(null)
    bridge.sports.teams(sport, { leagues }).then((t) => alive && setAll(t)).catch(() => alive && setAll([]))
    return () => { alive = false }
  }, [sport, leagues.join(",")])

  const has = (t: FavTeam) => favs.some((f) => sameFav(f, t))
  const save = (next: FavTeam[]) => set({ favs: next })
  const toggle = (t: FavTeam) => save(has(t) ? favs.filter((f) => !sameFav(f, t)) : [...favs, t])
  const move = (i: number, d: number) => {
    const next = [...favs]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }

  const nq = norm(q)
  const shown = (all ?? []).filter((t) => (!lg || t.league === lg) && (!nq || norm(t.name).includes(nq) || norm(t.short || "").includes(nq)))
  const exact = (all ?? []).some((t) => norm(t.name) === nq) || favs.some((f) => norm(f.name) === nq)
  const leagueLabel = (id?: string) => LEAGUES.find((l) => l.id === id)?.label ?? id ?? ""
  const leagueIds = sport === "football" ? [...new Set((all ?? []).map((t) => t.league).filter(Boolean) as string[])] : []

  return (
    <div className="space-y-2">
      <div className="text-sm">Seus times <span className="text-fg-muted">— ficam fixados no topo</span></div>
      {favs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {favs.map((f, i) => (
            <span key={f.id || f.name} className="group flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-1 pl-1 text-sm">
              <Crest t={asTeam(f)} size={18} color={color} />
              <span className="max-w-[9rem] truncate">{f.name}</span>
              {favs.length > 1 && (
                <span className="hidden items-center group-hover:flex">
                  <button className="px-0.5 text-xs text-fg-muted hover:text-fg disabled:opacity-30" disabled={i === 0} title="Mais para cima" onClick={() => move(i, -1)}>◀</button>
                  <button className="px-0.5 text-xs text-fg-muted hover:text-fg disabled:opacity-30" disabled={i === favs.length - 1} title="Mais para baixo" onClick={() => move(i, 1)}>▶</button>
                </span>
              )}
              <button className="rounded-full p-0.5 text-fg-muted hover:text-fg" title="Tirar" onClick={() => toggle(f)}><X size={12} /></button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-fg-muted">Nenhum time escolhido ainda. Toque nos times abaixo.</div>
      )}

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted" />
        <input className="field w-full !pl-8" placeholder={sport === "football" ? "Buscar time (ex.: Palmeiras)" : sport === "cs2" ? "Buscar time (ex.: FURIA)" : "Buscar time (ex.: LOUD)"} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {leagueIds.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {["", ...leagueIds].map((id) => (
            <button key={id || "all"} onClick={() => setLg(id)} className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", lg === id ? "border-transparent bg-brand text-white" : "border-line text-fg-muted hover:text-fg")}>
              {id ? leagueLabel(id) : "Todos"}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-60 overflow-auto rounded-xl border border-line p-1">
        {!all && <div className="p-3 text-center text-xs text-fg-muted">Carregando times…</div>}
        {all && shown.length === 0 && !q && <div className="p-3 text-center text-xs text-fg-muted">Não consegui carregar a lista agora. Dá para buscar pelo nome e adicionar.</div>}
        <div className="grid grid-cols-2 gap-0.5">
          {shown.slice(0, 160).map((t) => {
            const on = has(t)
            return (
              <button
                key={(t.id || t.name) + (t.league ?? "")}
                onClick={() => toggle(t)}
                className={cn("flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors", on ? "text-fg" : "text-fg-muted hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg")}
                style={on ? { background: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined}
                title={t.league ? leagueLabel(t.league) : undefined}
              >
                <Crest t={asTeam(t)} size={20} color={color} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {on && <Check size={13} style={{ color }} />}
              </button>
            )
          })}
        </div>
        {q.trim() && !exact && (
          <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg-muted hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg" onClick={() => { save([...favs, { name: q.trim() }]); setQ("") }}>
            <Plus size={14} /> Adicionar “{q.trim()}” mesmo assim
          </button>
        )}
      </div>
    </div>
  )
}
