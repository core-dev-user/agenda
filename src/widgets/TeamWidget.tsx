/**
 * Widget "Time": um time só, com a cara dele — logo em destaque, cores do clube/organização,
 * último resultado e próximo jogo. Serve para futebol e qualquer e-sport de TEAM_GAMES.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, RefreshCw, Search, Shield } from "lucide-react"
import { bridge, friendlyError, type TeamCard, type TeamGame, type TeamHit } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ensureFont, fontFamily } from "@/lib/fonts"
import { logoPalette, teamTheme } from "@/lib/teamColors"
import { Switch } from "@/components/ui/controls"
import { FontPicker } from "@/components/FontPicker"
import { LEAGUES } from "./Sports"

/** jogos do widget. Para pôr outro: uma linha aqui + o provedor em electron/teams.cjs */
export const TEAM_GAMES: { id: string; label: string; short: string; color: string; hint: string }[] = [
  { id: "football", label: "Futebol", short: "Futebol", color: "#2fd27a", hint: "Corinthians, Real Madrid…" },
  { id: "cs2", label: "Counter-Strike 2", short: "CS2", color: "#f5a524", hint: "FURIA, MIBR, Vitality…" },
  { id: "valorant", label: "Valorant", short: "Valorant", color: "#ff4655", hint: "LOUD, Sentinels, FNATIC…" },
  { id: "lol", label: "League of Legends", short: "LoL", color: "#c8aa6e", hint: "paiN Gaming, T1, LOUD…" },
  { id: "dota2", label: "Dota 2", short: "Dota 2", color: "#e3412b", hint: "Team Spirit, Team Liquid…" },
  { id: "r6", label: "Rainbow Six Siege", short: "R6", color: "#4aa3ff", hint: "FaZe Clan, w7m, Team BDS…" },
  { id: "rl", label: "Rocket League", short: "Rocket League", color: "#1f8fff", hint: "Karmine Corp, FURIA…" },
  { id: "ow", label: "Overwatch 2", short: "OW2", color: "#f99e1a", hint: "Team Falcons, Crazy Raccoon…" },
]
const gameOf = (id?: string) => TEAM_GAMES.find((g) => g.id === id) ?? TEAM_GAMES[0]

const NAME_FONT = "gf-anton"
const NUM_FONT = "gf-bebas-neue"

/* ------------------------------ textos ------------------------------ */
const RESULT = { W: { t: "Vitória", c: "#38e08a" }, L: { t: "Derrota", c: "#ff5a63" }, D: { t: "Empate", c: "#f5c451" } } as const
const FORM = { W: "V", L: "D", D: "E" } as Record<string, string>

function dayLabel(ms: number) {
  const d = new Date(ms)
  const t0 = new Date(); t0.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(ms).setHours(0, 0, 0, 0) - +t0) / 86400000)
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (diff === 0) return `Hoje · ${hm}`
  if (diff === 1) return `Amanhã · ${hm}`
  if (diff === -1) return "Ontem"
  const wd = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  return diff > 0 ? `${wd[0].toUpperCase() + wd.slice(1)}, ${dm} · ${hm}` : `${wd[0].toUpperCase() + wd.slice(1)}, ${dm}`
}
function countdown(ms: number, now: number) {
  const s = Math.max(0, ms - now) / 1000
  if (s < 60) return "começando"
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d >= 2) return `em ${d} dias`
  if (d === 1) return `em 1 dia ${h}h`
  if (h) return `em ${h}h ${String(m).padStart(2, "0")}min`
  return `em ${m} min`
}
const eventName = (g: TeamGame) => (g.league ? LEAGUES.find((l) => l.id === g.league)?.label : "") || g.event

/* ------------------------------ peças ------------------------------ */
function Logo({ src, alt, size, className, style }: { src?: string; alt: string; size: number; className?: string; style?: React.CSSProperties }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [src])
  if (!src || bad)
    return (
      <div className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", className)} style={{ width: size, height: size, fontSize: size * 0.34, background: "rgb(255 255 255 / .1)", ...style }}>
        {alt.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "?"}
      </div>
    )
  return <img src={src} alt={alt} draggable={false} onError={() => setBad(true)} className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size, ...style }} />
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inset-0 animate-ping rounded-full bg-[#ff3b47] opacity-70" />
      <span className="relative h-2 w-2 rounded-full bg-[#ff3b47]" />
    </span>
  )
}

/** cartão de jogo (último / próximo / ao vivo) */
function GameCard({ g, kind, now, accent, compact, grow }: { g: TeamGame; kind: "last" | "next" | "live"; now: number; accent: string; compact?: boolean; grow?: boolean }) {
  const narrow = !!grow
  const res = g.result ? RESULT[g.result as keyof typeof RESULT] : undefined
  const label = kind === "live" ? "Ao vivo" : kind === "last" ? (narrow ? "Último" : "Último jogo") : narrow ? "Próximo" : "Próximo jogo"
  const num = { fontFamily: fontFamily(NUM_FONT), letterSpacing: ".02em" }
  return (
    <button
      data-nodrag
      onClick={() => g.link && bridge.app.openExternal(g.link)}
      title={`${eventName(g)}${g.detail ? " · " + g.detail : ""}`}
      className={cn("tw-card group/card relative flex min-w-0 flex-col overflow-hidden rounded-[14px] px-3 py-2 text-left", grow && "flex-1 basis-0")} 
      style={{
        background: kind === "live" ? "linear-gradient(135deg, rgb(255 59 71 / .28), rgb(0 0 0 / .32))" : "linear-gradient(160deg, rgb(255 255 255 / .09), rgb(0 0 0 / .28))",
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / .12), inset 0 0 0 1px ${kind === "live" ? "rgb(255 90 99 / .45)" : "rgb(255 255 255 / .07)"}`,
      }}
    >
      {/* faixa de cor no topo: resultado ou destaque do time */}
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: kind === "last" && res ? res.c : kind === "live" ? "#ff3b47" : accent, opacity: 0.9 }} />
      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[.14em] text-white/60 uppercase">
        {kind === "live" && <LiveDot />}
        <span className={cn("truncate", kind === "live" && "text-[#ff8087]")}>{label}</span>
        {kind === "last" && res && <span className="ml-auto rounded-full px-1.5 py-px text-[9px] tracking-[.1em]" style={{ background: res.c + "26", color: res.c }}>{res.t}</span>}
        {kind === "next" && <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 py-px text-[9px] tracking-[.06em] whitespace-nowrap text-white/85 normal-case">{countdown(g.start, now)}</span>}
        {kind === "live" && g.detail && <span className="ml-auto truncate text-[9px] tracking-normal text-white/70 normal-case">{g.detail}</span>}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
        <Logo src={g.opp.logo} alt={g.opp.name} size={compact ? 26 : 32} style={{ filter: "drop-shadow(0 3px 6px rgb(0 0 0 / .45))" }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] text-white/55">{g.home === true ? "em casa contra" : g.home === false ? "fora contra" : "contra"}</div>
          <div className="truncate text-[13px] leading-tight font-semibold text-white">{g.opp.name}</div>
        </div>
        {kind !== "next" && (g.us.score != null || g.opp.score != null) && (
          <div className="flex shrink-0 items-baseline gap-1 tabular-nums" style={num}>
            <span className="text-[26px] leading-none" style={{ color: kind === "live" ? "#fff" : res?.c ?? "#fff" }}>{g.us.score ?? 0}</span>
            <span className="text-[16px] leading-none text-white/40">:</span>
            <span className="text-[26px] leading-none text-white/75">{g.opp.score ?? 0}</span>
          </div>
        )}
      </div>
      {!compact && (
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-white/60">
          {g.eventLogo && <img src={g.eventLogo} className="h-3.5 w-3.5 shrink-0 object-contain opacity-90" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />}
          <span className="truncate">{eventName(g)}</span>
          {kind !== "live" && <span className="ml-auto shrink-0 text-white/75">{dayLabel(g.start)}</span>}
        </div>
      )}
    </button>
  )
}

/** versão mini (widget pequeno): uma linha só */
function MiniLine({ g, kind, now }: { g: TeamGame; kind: "last" | "next" | "live"; now: number }) {
  const res = g.result ? RESULT[g.result as keyof typeof RESULT] : undefined
  return (
    <button data-nodrag onClick={() => g.link && bridge.app.openExternal(g.link)} className="flex min-w-0 items-center gap-2 rounded-[10px] bg-black/25 px-2 py-1.5 text-left" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / .08)" }}>
      {kind === "live" && <LiveDot />}
      <Logo src={g.opp.logo} alt={g.opp.name} size={18} />
      <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">{g.opp.name}</span>
      {kind === "next" ? (
        <span className="shrink-0 text-[10.5px] text-white/75">{countdown(g.start, now)}</span>
      ) : (
        <span className="shrink-0 text-[15px] leading-none tabular-nums" style={{ fontFamily: fontFamily(NUM_FONT), color: kind === "live" ? "#fff" : res?.c }}>{g.us.score ?? 0}:{g.opp.score ?? 0}</span>
      )}
    </button>
  )
}

/* ------------------------------ widget ------------------------------ */
export function TeamWidget({ w, onConfigure }: { w: Widget; onConfigure: () => void }) {
  const c = w.config
  const game = gameOf(c.game)
  const team: TeamHit | undefined = c.team
  const [card, setCard] = useState<TeamCard | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [pal, setPal] = useState<string[]>([])
  const hero = useRef<HTMLDivElement>(null)

  useEffect(() => { void ensureFont(c.nameFont ?? NAME_FONT); void ensureFont(NUM_FONT) }, [c.nameFont])

  // abre na hora com o que já estava guardado; depois busca o atual
  useEffect(() => {
    if (!team?.id) { setCard(null); return }
    let alive = true
    setErr("")
    bridge.team.card(game.id, team, { peek: true }).then((d) => alive && d && setCard((old) => old ?? d)).catch(() => {})
    return () => { alive = false }
  }, [game.id, team?.id])
  useEffect(() => {
    if (!team?.id) return
    let alive = true
    setBusy(true)
    bridge.team.card(game.id, team)
      .then((d) => { if (alive && d) { setCard(d); setErr(d.error ? friendlyError(d.error) : "") } })
      .catch((e) => alive && setErr(friendlyError(e)))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [game.id, team?.id, tick])

  const hot = !!card?.live || (!!card?.next && card.next.start - Date.now() < 30 * 60_000)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), hot ? 60_000 : 10 * 60_000)
    return () => clearInterval(id)
  }, [hot])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // cores: oficiais (futebol/ESPN) e/ou tiradas do logo
  const logoSrc = card?.team.logoData || card?.team.logo || team?.logo || ""
  useEffect(() => { let a = true; logoPalette(logoSrc).then((p) => a && setPal(p)); return () => { a = false } }, [logoSrc])
  const theme = useMemo(() => {
    const custom = [c.color1, c.color2].filter(Boolean) as string[]
    if (custom.length) return teamTheme([...custom, ...pal])
    const official = card?.team.colors ?? []
    // cores oficiais mandam (o Corinthians é preto e branco, mesmo com os remos vermelhos no escudo)
    return teamTheme(official.length ? official : pal)
  }, [pal, card?.team.colors?.join(), c.color1, c.color2])

  // tilt 3D do logo seguindo o mouse (só no hover — nada fica animando parado)
  useEffect(() => {
    const el = hero.current
    if (!el || c.tilt === false) return
    const host = el.closest("[data-widget]") as HTMLElement | null
    if (!host) return
    const move = (e: PointerEvent) => {
      if (e.buttons) return
      const r = host.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(700px) rotateY(${x * 22}deg) rotateX(${-y * 18}deg) translateZ(10px)`
    }
    const leave = () => { el.style.transform = "" }
    host.addEventListener("pointermove", move)
    host.addEventListener("pointerleave", leave)
    return () => { host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave) }
  }, [c.tilt, !!card])

  if (!team?.id)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(140deg, #ff4655, #7b2cff)", boxShadow: "0 10px 30px -8px #ff465599" }}><Shield size={26} className="text-white" /></div>
        <div>
          <div className="text-sm font-semibold">Seu time</div>
          <div className="text-xs text-fg-muted">Futebol, CS2, Valorant, LoL e outros</div>
        </div>
        <button className="btn btn-primary !py-1.5 text-sm" onClick={onConfigure}>Escolher time</button>
      </div>
    )

  const t = card?.team
  const name = t?.name || team.name
  const isDark = theme.darkBase || theme.mono
  // futebol: o escudo "para fundo escuro" quando o cartão é escuro (ex.: escudo preto do Corinthians)
  const shown = (isDark && t?.logoDark) || t?.logoData || t?.logo || team.logo || ""
  const W_ = w.w, H_ = w.h
  const tiny = H_ < 170 || W_ < 250
  const wide = W_ >= H_ * 1.2 && !tiny
  const logoSize = Math.round(tiny ? Math.min(H_ * 0.42, W_ * 0.26, 74) : wide ? Math.min(H_ * 0.5, W_ * 0.3, 150) : Math.min(W_ * 0.38, H_ * 0.27, 170))
  const nameFont = fontFamily(c.nameFont ?? NAME_FONT)
  const nameSize = Math.round(Math.max(18, Math.min(tiny ? 22 : 34, (wide ? W_ * 0.42 : W_ * 0.8) / Math.max(5, name.length) * 1.55)))
  const watermark = c.watermark !== false
  const stripes = c.stripes !== false

  const games: { g: TeamGame; kind: "last" | "next" | "live" }[] = []
  if (card?.live) games.push({ g: card.live, kind: "live" })
  if (card?.last && c.showLast !== false) games.push({ g: card.last, kind: "last" })
  if (card?.next && c.showNext !== false && !card.live) games.push({ g: card.next, kind: "next" })
  const shownGames = tiny ? games.filter((x) => x.kind !== "last" || games.length === 1).slice(0, 1) : games

  return (
    <div className="relative h-full w-full overflow-hidden text-white" style={{ borderRadius: "inherit", textShadow: "none" }}>
      {/* fundo com as cores do time */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: `radial-gradient(120% 95% at ${wide ? "18% 30%" : "50% 18%"}, ${theme.glow} 0%, ${theme.base} 38%, ${theme.deep} 100%)`,
      }} />
      {stripes && (
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(118deg, ${theme.accent} 0 2px, transparent 2px 15px)`,
          opacity: 0.09,
          maskImage: `linear-gradient(${wide ? "100deg" : "180deg"}, transparent 25%, #000 75%)`,
        }} />
      )}
      {watermark && shown && (
        <img src={shown} draggable={false} className="pointer-events-none absolute object-contain" style={{
          height: "165%", right: wide ? "-14%" : "-30%", top: wide ? "-32%" : "-20%", aspectRatio: "1",
          opacity: 0.1, transform: "rotate(-14deg)", filter: "saturate(1.2) blur(.5px)",
        }} />
      )}
      {/* brilho na borda de cima + sombra embaixo (dá volume) */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(255 255 255 / .1), transparent 22%, transparent 60%, rgb(0 0 0 / .35))" }} />
      <div className="pointer-events-none absolute inset-0" style={{ opacity: 0.12, mixBlendMode: "overlay", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />

      <div className={cn("relative flex h-full gap-3 p-3.5", wide ? "flex-row items-stretch" : "flex-col justify-center")}>
        {/* herói: logo + nome */}
        <div className={cn("flex min-w-0 shrink-0", wide ? "w-[42%] flex-col items-start justify-center" : tiny ? "flex-row items-center gap-3" : "flex-col items-center text-center")}>
          <div ref={hero} className="relative transition-transform duration-300 ease-out will-change-transform" style={{ transformStyle: "preserve-3d" }}>
            {/* palco de luz atrás do logo */}
            <div className="absolute rounded-full" style={{
              inset: -logoSize * 0.22,
              background: `radial-gradient(circle, ${theme.accent}55 0%, ${theme.accent}18 40%, transparent 70%)`,
            }} />
            <Logo src={shown} alt={name} size={logoSize} className="relative" style={{ filter: `drop-shadow(0 10px 18px rgb(0 0 0 / .5)) drop-shadow(0 0 1px rgb(255 255 255 / .25))` }} />
          </div>
          <div className={cn("min-w-0", wide ? "mt-2.5 w-full" : tiny ? "flex-1" : "mt-2 w-full")}>
            <div className="truncate leading-[0.95] uppercase" style={{ fontFamily: nameFont, fontSize: nameSize, letterSpacing: ".015em", textShadow: `0 2px 14px ${theme.deep}` }} title={t?.full || name}>{name}</div>
            <div className={cn("mt-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[.16em] text-white/65 uppercase", !wide && !tiny && "justify-center")}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} />
              {game.short}
              {busy && <RefreshCw size={9} className="animate-spin opacity-70" />}
            </div>
            {!tiny && card && card.form.length > 0 && c.showForm !== false && (
              <div className={cn("mt-2 flex gap-1", !wide && "justify-center")} title="Últimos resultados (mais recente à esquerda)">
                {card.form.map((r, i) => {
                  const k = RESULT[r as keyof typeof RESULT]
                  return (
                    <span key={i} className="flex h-[17px] w-[17px] items-center justify-center rounded-[5px] text-[9.5px] font-bold" style={{ background: k ? k.c + "30" : "rgb(255 255 255 / .1)", color: k?.c ?? "#fff", boxShadow: `inset 0 0 0 1px ${k ? k.c + "55" : "transparent"}` }}>
                      {FORM[r] ?? "?"}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* jogos */}
        <div className={cn("flex min-h-0 min-w-0 gap-2", wide ? "flex-1 flex-col justify-center" : W_ >= 340 ? "flex-row items-start" : "flex-col")}>
          {!card && !err && [0, 1].slice(0, tiny ? 1 : 2).map((i) => <div key={i} className="min-h-[58px] flex-1 animate-pulse rounded-[14px] bg-white/[.07]" />)}
          {!card && err && <div className="m-auto text-center text-xs text-white/70">Não consegui carregar agora.<div className="text-[10px] text-white/50">{err}</div></div>}
          {card && shownGames.length === 0 && <div className="m-auto text-center text-xs text-white/65">Sem jogos marcados ou recentes.</div>}
          {tiny
            ? shownGames.map(({ g, kind }) => <MiniLine key={kind} g={g} kind={kind} now={now} />)
            : shownGames.map(({ g, kind }) => <GameCard key={kind} g={g} kind={kind} now={now} accent={theme.accent} compact={wide ? H_ < 230 : H_ < 470 || W_ >= 340} grow={!wide && W_ >= 340} />)}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ configurações ------------------------------ */
export function TeamSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const c = w.config
  const game = gameOf(c.game)
  const [q, setQ] = useState("")
  const [list, setList] = useState<TeamHit[] | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    let alive = true
    setList(null); setErr("")
    const t = setTimeout(() => {
      bridge.team.search(game.id, q)
        .then((r) => alive && setList(r))
        .catch((e) => { if (alive) { setList([]); setErr(friendlyError(e)) } })
    }, q ? 450 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [game.id, q])

  const pick = (t: TeamHit) => set({ team: { id: t.id, name: t.name, short: t.short, logo: t.logo, league: t.league }, color1: undefined, color2: undefined })
  const sel: TeamHit | undefined = c.team

  return (
    <>
      <div className="text-sm text-fg-muted">Jogo / esporte</div>
      <div className="flex flex-wrap gap-1.5">
        {TEAM_GAMES.map((g) => (
          <button key={g.id} onClick={() => { if (g.id !== game.id) { set({ game: g.id, team: undefined, color1: undefined, color2: undefined }); setQ("") } }}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", g.id === game.id ? "border-transparent text-white" : "border-line text-fg-muted hover:text-fg")}
            style={g.id === game.id ? { background: g.color } : undefined}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="text-sm">Time {sel && <span className="text-fg-muted">— {sel.name}</span>}</div>
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted" />
        <input className="field w-full !pl-8" placeholder={`Buscar time (ex.: ${game.hint})`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-60 overflow-auto rounded-xl border border-line p-1">
        {!list && <div className="p-3 text-center text-xs text-fg-muted">Buscando…</div>}
        {list && list.length === 0 && (
          <div className="p-3 text-center text-xs text-fg-muted">{err || (q.trim().length < 2 ? "Digite o nome do time para buscar." : "Nenhum time com esse nome.")}</div>
        )}
        <div className="grid grid-cols-2 gap-0.5">
          {(list ?? []).slice(0, 120).map((t) => {
            const on = sel?.id === t.id
            return (
              <button key={t.id + (t.league ?? "")} onClick={() => pick(t)}
                className={cn("flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors", on ? "text-fg" : "text-fg-muted hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg", t.inactive && "opacity-50")}
                style={on ? { background: `color-mix(in srgb, ${game.color} 20%, transparent)` } : undefined}
                title={t.inactive ? "Time inativo" : t.league ? LEAGUES.find((l) => l.id === t.league)?.label : undefined}>
                <Logo src={t.logo} alt={t.name} size={20} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {on && <Check size={13} style={{ color: game.color }} />}
              </button>
            )
          })}
        </div>
      </div>
      {game.id !== "football" && game.id !== "valorant" && (
        <div className="text-xs text-fg-muted">Dados da Liquipedia. Ela só deixa uma consulta a cada 30 s, então o primeiro carregamento pode demorar um pouco; depois fica guardado.</div>
      )}

      <div className="text-sm text-fg-muted">Visual</div>
      <Switch label="Logo gigante ao fundo" checked={c.watermark !== false} onChange={(v) => set({ watermark: v })} />
      <Switch label="Listras na cor do time" checked={c.stripes !== false} onChange={(v) => set({ stripes: v })} />
      <Switch label="Logo acompanha o mouse (3D)" checked={c.tilt !== false} onChange={(v) => set({ tilt: v })} />
      <Switch label="Últimos 5 resultados (V/E/D)" checked={c.showForm !== false} onChange={(v) => set({ showForm: v })} />
      <Switch label="Último jogo" checked={c.showLast !== false} onChange={(v) => set({ showLast: v })} />
      <Switch label="Próximo jogo" checked={c.showNext !== false} onChange={(v) => set({ showNext: v })} />
      <div className="text-sm text-fg-muted">Cores <span className="text-xs">(automáticas: do clube ou do logo)</span></div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">Principal <input type="color" value={c.color1 ?? "#202436"} onChange={(e) => set({ color1: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent" /></label>
        <label className="flex items-center gap-2 text-xs">Destaque <input type="color" value={c.color2 ?? "#ffffff"} onChange={(e) => set({ color2: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent" /></label>
        {(c.color1 || c.color2) && <button className="btn btn-ghost !py-1 text-xs" onClick={() => set({ color1: undefined, color2: undefined })}>Automáticas</button>}
      </div>
      <div className="text-sm text-fg-muted">Fonte do nome</div>
      <FontPicker value={c.nameFont ?? NAME_FONT} onChange={(v: string) => set({ nameFont: v })} />
      <div className="text-xs text-fg-muted">Clique num jogo para abrir a partida. Deixe o widget mais largo para o logo ficar ao lado dos jogos, ou mais alto para ele ficar em cima.</div>
    </>
  )
}
