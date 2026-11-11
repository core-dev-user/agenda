import { useEffect, useState, type ReactNode } from "react"
import { Glyph } from "@/components/Glyph"
import { AppWindow, Monitor, MonitorUp, CheckCircle2, Cloud, FolderOpen, Keyboard, Loader2, Moon, Plus, RefreshCw, Trash2, XCircle, AlertTriangle, Star } from "lucide-react"
import { useStore, DEFAULT_NOTIFY, DEFAULT_FOCUS } from "@/lib/store"
import { bridge, type DisplayInfo, type SysConfig, type UiMode } from "@/lib/bridge"
import { MODE_INFO, useUiMode } from "@/lib/uimode"
import { SOURCE_META, notify } from "@/lib/notify"
import { eventsFrom, feedUrl } from "@/lib/ical"
import { Card, Switch } from "@/components/ui/controls"
import { cn, uid } from "@/lib/utils"
import type { NotifySource, SportKind } from "@/lib/types"
import { SPORTS } from "@/lib/favs"
import { performanceBudget, type PerfPreset, type PreloadMode } from "@/lib/perf-policy"

function Section({ title, children, desc }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="font-display mb-1 text-lg font-semibold">{title}</div>
      {desc && <div className="mb-3 text-sm text-fg-muted">{desc}</div>}
      <div className="space-y-1">{children}</div>
    </Card>
  )
}

/* ============================================================ Rotina e avisos ============================================================ */
export function RoutineTab() {
  const s = useStore((x) => x.settings)
  const set = useStore((x) => x.setSettings)
  const np = { ...DEFAULT_NOTIFY, ...s.notify, on: { ...DEFAULT_NOTIFY.on, ...s.notify?.on }, toast: { ...DEFAULT_NOTIFY.toast, ...s.notify?.toast } }
  const fp = { ...DEFAULT_FOCUS, ...s.focus }
  const setN = (k: "on" | "toast", src: NotifySource, v: boolean) => set({ notify: { ...np, [k]: { ...np[k], [src]: v } } })
  return (
    <>
      <Section title="Avisos" desc="Tudo cai na central de avisos (o sininho na barra). Escolha também quais mostram o aviso do Windows.">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-xs text-fg-muted uppercase">Origem</span><span className="text-xs text-fg-muted uppercase">Ligado</span><span className="text-xs text-fg-muted uppercase">Aviso do Windows</span>
          {(Object.keys(SOURCE_META) as NotifySource[]).map((k) => (
            <Row key={k} label={<span className="flex items-center gap-2"><Glyph v={SOURCE_META[k].emoji} size={15} className="text-fg-muted" /> {SOURCE_META[k].label}</span>} on={np.on[k] !== false} toast={!!np.toast[k]} setOn={(v) => setN("on", k, v)} setToast={(v) => setN("toast", k, v)} />
          ))}
        </div>
        <Switch label="Som nos avisos" checked={np.sound} onChange={(v) => set({ notify: { ...np, sound: v } })} />
        <button className="btn mt-1 !py-1 text-xs" onClick={() => notify({ source: "system", title: "Teste de aviso", body: "Se você está vendo isso, os avisos estão funcionando." })}>Mandar um aviso de teste</button>
        <div className="pt-1 text-xs text-fg-muted">O WhatsApp e o Discord também mostram os avisos deles no Windows. Por isso o do WhatsApp vem desligado aqui, para não aparecer duas vezes.</div>
      </Section>

      <Section title="Times favoritos" desc="Cada esporte tem a sua lista: o time do futebol não aparece no CS2 e vice-versa. Avisa quando o jogo começa, quando o placar muda e no fim, e o próximo jogo fica fixado no topo do widget daquele esporte.">
        <div className="space-y-3">
          {SPORTS.map((sp) => <FavSport key={sp.id} sport={sp.id} />)}
        </div>
      </Section>

      <CalendarsSection />

      <Section title="Modo foco" desc="Para estudar ou trabalhar sem distração. Liga sozinho com o cronômetro de Estudos, ou pela busca (Ctrl+K → “foco”).">
        <Switch label="Ligar sozinho quando o cronômetro de Estudos começar" checked={fp.auto} onChange={(v) => set({ focus: { ...fp, auto: v } })} />
        <Switch label="Silenciar avisos (eles ficam guardados na central)" checked={fp.silence} onChange={(v) => set({ focus: { ...fp, silence: v } })} />
        <Switch label="Tirar o som do WhatsApp e do Discord (a call do Discord continua normal)" checked={fp.muteApps} onChange={(v) => set({ focus: { ...fp, muteApps: v } })} />
        <Switch label="Mostrar só o essencial na área de trabalho (relógio, música, tarefas, agenda)" checked={fp.hideWidgets} onChange={(v) => set({ focus: { ...fp, hideWidgets: v } })} />
        <div className="pt-1 text-sm">Playlist do foco (link do YouTube Music, opcional)</div>
        <input className="field" placeholder="https://music.youtube.com/playlist?list=…" value={fp.playlist} onChange={(e) => set({ focus: { ...fp, playlist: e.target.value } })} />
        <div className="pt-2"><button className="btn" onClick={() => useStore.setState((x) => ({ focusManual: !x.focusManual }))}>{useStore.getState().focusManual ? "Desligar" : "Ligar"} modo foco agora</button></div>
      </Section>

      <Section title="Tela Hoje">
        <Switch label="Abrir a tela Hoje quando o Widgy abrir" checked={!!s.todayOnStart} onChange={(v) => set({ todayOnStart: v })} />
      </Section>
    </>
  )
}

/** lista de favoritos de um esporte, com sugestões dos times conhecidos */
function FavSport({ sport }: { sport: SportKind }) {
  const meta = SPORTS.find((x) => x.id === sport)!
  const byS = useStore((x) => x.settings.favBySport)
  const set = useStore((x) => x.setSettings)
  const favs = byS?.[sport] ?? []
  const [team, setTeam] = useState("")
  const [known, setKnown] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    bridge.sports.teams(sport, sport === "football" ? { leagues: ["bra.1", "bra.2", "conmebol.libertadores", "uefa.champions", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "arg.1"] } : {})
      .then((t) => alive && setKnown([...new Set(t.map((x) => x.name))])).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const save = (next: string[]) => set((st) => ({ favBySport: { ...st.favBySport, [sport]: next } }))
  const add = () => {
    const v = team.trim()
    if (!v) return
    // usa o nome certinho da lista quando bate ("corinthians" → "Corinthians")
    const nice = known.find((k) => k.toLowerCase() === v.toLowerCase()) ?? v
    if (!favs.some((f) => f.toLowerCase() === nice.toLowerCase())) save([...favs, nice])
    setTeam("")
  }
  // mover para outro esporte (útil depois da separação automática das listas antigas)
  const moveTo = (f: string, to: SportKind) => set((st) => {
    const cur = st.favBySport ?? {}
    const dest = cur[to] ?? []
    return { favBySport: { ...cur, [sport]: (cur[sport] ?? []).filter((x) => x !== f), [to]: dest.includes(f) ? dest : [...dest, f] } }
  })
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} /> {meta.label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {favs.length === 0 && <span className="text-xs text-fg-muted">Nenhum time ainda (ex.: {meta.example}).</span>}
        {favs.map((f) => (
          <span key={f} className="group flex items-center gap-1 rounded-full border border-line py-0.5 pr-1.5 pl-2.5 text-sm">
            <Star size={11} className="fill-current" style={{ color: meta.color }} /> {f}
            <span className="hidden items-center gap-0.5 group-hover:flex">
              {SPORTS.filter((o) => o.id !== sport).map((o) => (
                <button key={o.id} className="rounded-full px-1 text-[10px] text-fg-muted hover:text-fg" style={{ boxShadow: `inset 0 0 0 1px ${o.color}66` }} title={`Mover para ${o.label}`} onClick={() => moveTo(f, o.id)}>
                  {o.id === "football" ? "fut" : o.id === "cs2" ? "cs2" : "val"}
                </button>
              ))}
            </span>
            <button className="opacity-60 hover:opacity-100" title="Tirar" onClick={() => save(favs.filter((x) => x !== f))}><XCircle size={13} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <input className="field flex-1 !py-1 text-sm" list={`fav-${sport}`} placeholder={`Time de ${meta.label.toLowerCase()}`} value={team} onChange={(e) => setTeam(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add() }} />
        <datalist id={`fav-${sport}`}>{known.map((k) => <option key={k} value={k} />)}</datalist>
        <button className="btn !py-1 text-sm" onClick={add}><Plus size={14} /> Adicionar</button>
      </div>
    </div>
  )
}

function Row({ label, on, toast, setOn, setToast }: { label: React.ReactNode; on: boolean; toast: boolean; setOn: (v: boolean) => void; setToast: (v: boolean) => void }) {
  return (
    <>
      <span>{label}</span>
      <input type="checkbox" className="justify-self-center" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <input type="checkbox" className="justify-self-center" disabled={!on} checked={on && toast} onChange={(e) => setToast(e.target.checked)} />
    </>
  )
}

const CAL_COLORS = ["#7cc8ff", "#ff8fb8", "#8cf0b0", "#ffd36e", "#c49bff", "#ffb38a"]
function CalendarsSection() {
  const feeds = useStore((x) => x.settings.calendars) ?? []
  const set = useStore((x) => x.setSettings)
  const events = useStore((x) => x.calEvents)
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!url.trim()) return
    setBusy(true); setTest(null)
    try {
      const txt = await bridge.net.text(feedUrl(url))
      if (!/BEGIN:VCALENDAR/i.test(txt)) throw new Error("Esse link não é de uma agenda iCal.")
      const feed = { id: uid(), name: name.trim() || "Minha agenda", url: url.trim(), color: CAL_COLORS[feeds.length % CAL_COLORS.length], on: true }
      const n = eventsFrom(txt, feed, Date.now(), Date.now() + 30 * 86400000).length
      set({ calendars: [...feeds, feed] })
      setTest({ ok: true, msg: `Conectada! ${n} evento${n === 1 ? "" : "s"} nos próximos 30 dias.` })
      setUrl(""); setName("")
    } catch (e: any) { setTest({ ok: false, msg: e?.message?.includes("iCal") ? e.message : "Não consegui baixar a agenda. Confira se copiou o endereço secreto completo." }) }
    setBusy(false)
  }
  return (
    <Section title="Agenda do Google" desc={<>Conecte só para leitura, sem login: no Google Agenda pelo computador, abra <b>Configurações → (sua agenda) → Integrar agenda</b> e copie o <b>Endereço secreto no formato iCal</b>. Os eventos aparecem na tela Hoje, no calendário, no widget de agenda e com aviso 10 min antes.</>}>
      {feeds.map((f) => (
        <div key={f.id} className="flex items-center gap-2 py-0.5">
          <input type="color" value={f.color} onChange={(e) => set({ calendars: feeds.map((x) => (x.id === f.id ? { ...x, color: e.target.value } : x)) })} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" />
          <input className="field !py-1" value={f.name} onChange={(e) => set({ calendars: feeds.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)) })} />
          <span className="w-24 text-right text-xs text-fg-muted">{events.filter((e) => e.feedId === f.id).length} eventos</span>
          <input type="checkbox" checked={f.on} title="Ligada" onChange={(e) => set({ calendars: feeds.map((x) => (x.id === f.id ? { ...x, on: e.target.checked } : x)) })} />
          <button className="btn btn-ghost btn-icon !p-1" onClick={() => set({ calendars: feeds.filter((x) => x.id !== f.id) })}><Trash2 size={13} /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <input className="field !w-40" placeholder="Nome (ex.: Pessoal)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field min-w-0 flex-1" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={busy || !url.trim()} onClick={add}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Conectar</button>
      </div>
      {test && <div className="text-sm" style={{ color: test.ok ? "#5ee3a1" : "#ff6b8b" }}>{test.msg}</div>}
      <div className="text-xs text-fg-muted">O endereço secreto dá acesso de leitura à sua agenda: ele fica salvo só neste PC.</div>
    </Section>
  )
}

/* ============================================================ Integrações ============================================================ */
type Check = { label: string; emoji: string; state: "ok" | "warn" | "err" | "wait"; msg: string; fix?: () => void; fixLabel?: string }

export function IntegrationsTab() {
  const [checks, setChecks] = useState<Check[]>([])
  const [running, setRunning] = useState(false)
  const open = useStore((x) => x.openWindow)
  const run = async () => {
    setRunning(true)
    const out: Check[] = []
    const push = (c: Check) => { out.push(c); setChecks([...out]) }
    const st = await bridge.webapp.status().catch(() => null)
    // YouTube Music
    await new Promise<void>((res) => {
      let done = false
      const off = bridge.music.onState((m) => {
        if (done) return
        done = true; off()
        push(m.open ? { label: "YouTube Music", emoji: "🎵", state: m.signedIn === false ? "warn" : "ok", msg: m.signedIn === false ? "Aberto, mas sem login" : m.title ? `Tocando: ${m.title}` : "Conectado" } : { label: "YouTube Music", emoji: "🎵", state: "warn", msg: "Fechado", fix: () => open("music"), fixLabel: "Abrir" })
        res()
      })
      setTimeout(() => { if (!done) { done = true; off(); push({ label: "YouTube Music", emoji: "🎵", state: "warn", msg: "Fechado no momento", fix: () => open("music"), fixLabel: "Abrir" }); res() } }, 2500)
    })
    // WhatsApp
    if (st?.whatsapp?.alive) {
      const r = await bridge.webapp.whatsapp().catch(() => null)
      push({ label: "WhatsApp", emoji: "💬", state: r?.loggedIn ? (r.chats.length ? "ok" : "warn") : "warn", msg: r?.loggedIn ? (r.chats.length ? `Lendo ${r.chats.length} conversas` : "Logado, mas não consegui ler a lista de conversas") : r?.qr ? "Precisa escanear o QR code" : "Sem login", fix: () => open("whatsapp"), fixLabel: "Abrir" })
    } else push({ label: "WhatsApp", emoji: "💬", state: "wait", msg: st?.whatsapp?.asleep ? "Dormindo (acorda quando você abrir)" : "Não aberto", fix: () => open("whatsapp"), fixLabel: "Abrir" })
    // Discord
    if (st?.discord?.alive) push({ label: "Discord", emoji: "🎧", state: /discord\.com\/(app|channels)/.test(st.discord.url) ? "ok" : "warn", msg: /login/.test(st.discord.url) ? "Sem login" : "Conectado", fix: () => open("discord"), fixLabel: "Abrir" })
    else push({ label: "Discord", emoji: "🎧", state: "wait", msg: st?.discord?.asleep ? "Dormindo (acorda quando você abrir)" : "Não aberto", fix: () => open("discord"), fixLabel: "Abrir" })
    // iFood
    if (st?.ifood?.alive) {
      const r = await bridge.webapp.ifoodOrders().catch(() => null)
      push({ label: "iFood", emoji: "🍔", state: r?.check ? "warn" : r?.loggedOut ? "warn" : "ok", msg: r?.check ? "Pedindo verificação de segurança" : r?.loggedOut ? "Sem login" : "Conectado", fix: () => open("ifood"), fixLabel: "Abrir" })
    } else push({ label: "iFood", emoji: "🍔", state: "wait", msg: st?.ifood?.asleep ? "Dormindo (acorda quando você abrir)" : "Não aberto", fix: () => open("ifood"), fixLabel: "Abrir" })
    // esportes
    const [fb, cs, va] = await Promise.all([
      bridge.sports.get("football", { leagues: ["bra.1"] }).then((l) => l.length).catch(() => -1),
      bridge.sports.get("cs2").then((l) => l.length).catch(() => -1),
      bridge.sports.get("valorant").then((l) => l.length).catch(() => -1),
    ])
    const sp = (n: number, label: string, emoji: string) => push({ label, emoji, state: n < 0 ? "err" : n === 0 ? "warn" : "ok", msg: n < 0 ? "Fonte fora do ar ou mudou" : n === 0 ? "Respondeu, mas sem jogos agora" : `${n} jogos encontrados` })
    sp(fb, "Futebol (ESPN)", "⚽"); sp(cs, "CS2 (Liquipedia)", "🎯"); sp(va, "Valorant (vlr.gg)", "🔺")
    // letras e clima
    const lr = await bridge.net.text("https://lrclib.net/api/search?q=hello").then(() => true).catch(() => false)
    push({ label: "Letras (LRCLIB)", emoji: "🎤", state: lr ? "ok" : "err", msg: lr ? "Respondendo" : "Fora do ar" })
    const wx = await bridge.net.text("https://api.open-meteo.com/v1/forecast?latitude=-23.5&longitude=-46.6&current=temperature_2m").then(() => true).catch(() => false)
    push({ label: "Clima (Open-Meteo)", emoji: "⛅", state: wx ? "ok" : "err", msg: wx ? "Respondendo" : "Fora do ar" })
    // agendas
    const feeds = useStore.getState().settings.calendars ?? []
    for (const f of feeds.filter((f) => f.on)) {
      const ok = await bridge.net.text(feedUrl(f.url)).then((t) => /BEGIN:VCALENDAR/i.test(t)).catch(() => false)
      push({ label: `Agenda: ${f.name}`, emoji: "🗓️", state: ok ? "ok" : "err", msg: ok ? "Sincronizando" : "Não consegui baixar (o link mudou?)" })
    }
    // backup na nuvem
    const sys = await bridge.sys.get().catch(() => null)
    if (sys) push({ label: "Backup na nuvem", emoji: "☁️", state: !sys.cloudOn ? "wait" : sys.cloudError ? "err" : "ok", msg: !sys.cloudOn ? "Desligado (Configurações → Sistema)" : sys.cloudError ? sys.cloudError : sys.lastCloud ? `Última cópia: ${new Date(sys.lastCloud).toLocaleString("pt-BR")}` : "Ligado, aguardando a primeira cópia" })
    setRunning(false)
  }
  useEffect(() => { run() }, [])
  const icon = (s: Check["state"]) => s === "ok" ? <CheckCircle2 size={16} color="#5ee3a1" /> : s === "warn" ? <AlertTriangle size={16} color="#ffd36e" /> : s === "err" ? <XCircle size={16} color="#ff6b8b" /> : <Moon size={16} className="text-fg-muted" />
  return (
    <Section title="Status das integrações" desc="O que está conectado e funcionando. Se algo ficar vermelho ou amarelo depois de uma atualização do site, me conte o nome que aparece aqui.">
      <div className="mb-2 flex justify-end"><button className="btn !py-1 text-xs" disabled={running} onClick={run}><RefreshCw size={12} className={cn(running && "animate-spin")} /> Verificar de novo</button></div>
      <div className="divide-y divide-[var(--line)]">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-3 py-2">
            <span className="flex w-6 justify-center text-fg-muted"><Glyph v={c.emoji} size={16} /></span>
            <span className="w-44 font-medium">{c.label}</span>
            {icon(c.state)}
            <span className="min-w-0 flex-1 truncate text-sm text-fg-muted" title={c.msg}>{c.msg}</span>
            {c.fix && <button className="btn !py-0.5 text-xs" onClick={c.fix}>{c.fixLabel}</button>}
          </div>
        ))}
        {running && <div className="flex items-center gap-2 py-2 text-sm text-fg-muted"><Loader2 size={14} className="animate-spin" /> Verificando…</div>}
      </div>
    </Section>
  )
}

/* ============================================================ Sistema (extras) ============================================================ */
const HOTKEYS = ["Control+Alt+Space", "Alt+Shift+A", "Control+Shift+Space", "Control+Alt+A", "Super+Alt+A", ""]
const hotkeyLabel = (k: string) => (k ? k.replace("Control", "Ctrl").replace("Super", "Win").replace("Space", "Espaço").replace(/\+/g, " + ") : "Desligado")

const MODE_ICON: Record<UiMode, typeof Monitor> = { desktop: Monitor, app: AppWindow, screen: MonitorUp }

/** aba "Modo de uso": Área de trabalho / Aplicativo / Tela própria + em qual monitor (o app reabre ao aplicar) */
export function ModeTab() {
  const cur = useUiMode((s) => s.mode) || "screen"
  const [mode, setMode] = useState<UiMode>(cur)
  const [shows, setShows] = useState<DisplayInfo[] | null>(null)
  const [disp, setDisp] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [span, setSpan] = useState(true)
  useEffect(() => { bridge.mode.span().then(setSpan).catch(() => {}) }, [])
  useEffect(() => {
    bridge.mode.displays().then((d) => { setShows(d); setDisp(d.find((x) => x.current)?.id ?? null) }).catch(() => setShows([]))
  }, [])
  const curDisp = shows?.find((x) => x.current)?.id ?? null
  const changed = mode !== cur || (disp != null && disp !== curDisp)
  const chosen = shows?.find((x) => x.id === disp)
  const apply = async () => {
    setBusy(true)
    bridge.store.flush?.()
    await bridge.mode.set(mode, disp ?? undefined)
    setTimeout(() => setBusy(false), 4000)
  }

  return (
    <>
      <Section title="Modo de uso" desc="Escolha como o Widgy aparece no seu PC. Seus dados, widgets e abas continuam iguais em qualquer modo.">
        <div className="grid gap-2 sm:grid-cols-3">
          {(["desktop", "app", "screen"] as UiMode[]).map((m) => {
            const Icon = MODE_ICON[m]
            const on = m === mode
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn("rounded-xl border p-3 text-left transition-colors", on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon size={16} className={on ? "text-[var(--accent)]" : "text-fg-muted"} />
                  {MODE_INFO[m].label}
                  {m === cur && <span className="text-xs font-normal text-fg-muted">(atual)</span>}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-fg-muted">{MODE_INFO[m].desc}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Monitor" desc={mode === "app" ? "Em qual monitor a janela abre." : mode === "desktop" ? (span && (shows?.length ?? 0) > 1 ? "O Widgy ocupa todos os monitores. O monitor escolhido aqui é o principal do Widgy (onde abrem as coisas na primeira vez)." : "Em qual monitor ficam os widgets do Widgy.") : "Em qual monitor fica a tela própria do Widgy — por exemplo, o segundo monitor."}>
        {!shows && <div className="flex items-center gap-2 py-2 text-sm text-fg-muted"><Loader2 size={14} className="animate-spin" /> Procurando monitores…</div>}
        {shows && shows.length <= 1 && <div className="py-1 text-sm text-fg-muted">Só um monitor ligado agora. Se ligar outro, ele aparece aqui.</div>}
        {shows && shows.length > 1 && <MonitorMap list={shows} value={disp} onPick={setDisp} />}
        {mode === "desktop" && cur === "desktop" && shows && shows.length > 1 && (
          <>
            <Switch
              label="Usar todos os monitores como uma área de trabalho só"
              checked={span}
              onChange={async (v) => { bridge.store.flush?.(); setSpan(v); await bridge.mode.span(v) }}
            />
            <div className="text-xs text-fg-muted">Arraste widgets e abas de um monitor para o outro livremente. Cada monitor tem o papel de parede inteiro, e a busca, os avisos e as abas abrem no monitor onde você clicou por último. Mudar isso reabre o Widgy.</div>
          </>
        )}
      </Section>

      <div className="flex items-center justify-end gap-3">
        {changed && <span className="text-sm text-fg-muted">O Widgy vai fechar e abrir de novo já no modo novo.</span>}
        <button className="btn btn-accent disabled:opacity-40" disabled={!changed || busy} onClick={apply}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Aplicar e reabrir
        </button>
      </div>

      {cur === "desktop" && (
        <Section title="Barra de tarefas">
          <MainBarSwitch />
        </Section>
      )}
    </>
  )
}

/** desenho dos monitores na posição real (como em Configurações de tela do Windows) */
function MonitorMap({ list, value, onPick }: { list: DisplayInfo[]; value: number | null; onPick: (id: number) => void }) {
  const minX = Math.min(...list.map((d) => d.bounds.x)), minY = Math.min(...list.map((d) => d.bounds.y))
  const maxX = Math.max(...list.map((d) => d.bounds.x + d.bounds.width)), maxY = Math.max(...list.map((d) => d.bounds.y + d.bounds.height))
  const W = maxX - minX, H = maxY - minY
  const scale = Math.min(520 / W, 170 / H)
  return (
    <div className="flex justify-center py-3">
      <div className="relative" style={{ width: W * scale, height: H * scale }}>
        {list.map((d) => {
          const on = d.id === value
          return (
            <button
              key={d.id}
              onClick={() => onPick(d.id)}
              className={cn("absolute flex flex-col items-center justify-center rounded-lg border-2 transition-all", on ? "border-[var(--accent)]" : "border-line hover:border-[color-mix(in_srgb,var(--fg)_40%,transparent)]")}
              style={{
                left: (d.bounds.x - minX) * scale + 3, top: (d.bounds.y - minY) * scale + 3,
                width: d.bounds.width * scale - 6, height: d.bounds.height * scale - 6,
                background: on ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "color-mix(in srgb, var(--fg) 6%, transparent)",
              }}
              title={d.label}
            >
              <span className="font-display text-2xl leading-none font-semibold">{d.n}</span>
              <span className="mt-1 text-[10px] text-fg-muted">{d.w}×{d.h}{d.hz ? ` · ${Math.round(d.hz)} Hz` : ""}</span>
              {d.primary && <span className="text-[10px] text-fg-muted">principal</span>}
              {d.current && <span className="absolute top-1 right-1.5 text-[9px] text-fg-muted">atual</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MainBarSwitch() {
  const on = useUiMode((s) => s.mainBar)
  const [keys, setKeys] = useState(true)
  const [winKey, setWinKey] = useState<"windows" | "agenda">("windows")
  useEffect(() => { bridge.bar.get().then((c) => { setKeys(c.keys); setWinKey(c.winKey) }) }, [])
  return (
    <div className="mt-3 border-t border-line pt-3">
      <Switch
        label="Substituir a barra do Windows pela do Widgy (em todos os monitores)"
        checked={on}
        onChange={async (v) => { bridge.store.flush?.(); await bridge.bar.set({ on: v }); location.reload() }}
      />
      <div className="text-xs text-fg-muted">Esconde a barra do Windows e põe a do Widgy no lugar em cada monitor, com as abas do Widgy e também os programas do Windows abertos e fixados. Ela segue o jeito escolhido em Configurações › Barra e ícones (Dock, Pílula ou Barra, posição, tamanho, lupa, nomes, ocultar sozinha). Se o Widgy fechar, a barra do Windows volta sozinha. A seta perto do relógio mostra os ícones da bandeja do Windows.</div>
      {on && (
        <>
          <Switch
            label="Win+S abre a pesquisa do Widgy"
            checked={keys}
            onChange={async (v) => setKeys((await bridge.bar.set({ keys: v })).keys)}
          />
          {keys && (
            <Switch
              label="Tecla Windows sozinha abre o Iniciar do Widgy (desligado: abre o Iniciar do Windows)"
              checked={winKey === "agenda"}
              onChange={async (v) => setWinKey((await bridge.bar.set({ winKey: v ? "agenda" : "windows" })).winKey)}
            />
          )}
          <div className="text-xs text-fg-muted">Os programas fixados na barra do Windows aparecem também na do Widgy. Os atalhos Win+D e Win+S funcionam em outros aplicativos, mesmo com jogos abertos em segundo plano. Em jogos protegidos por anti-cheat, o Widgy não instala um capturador de teclado sobre o jogo: use Win+D nativo ou Ctrl+Alt+D para mostrar a área de trabalho (caso a combinação esteja disponível). Jogos em tela cheia exclusiva podem limitar atalhos globais.</div>
        </>
      )}
    </div>
  )
}

export function SystemExtra() {
  const [cfg, setCfg] = useState<SysConfig | null>(null)
  const s = useStore((x) => x.settings)
  const set = useStore((x) => x.setSettings)
  const [copying, setCopying] = useState(false)
  useEffect(() => { bridge.sys.get().then(setCfg) }, [])
  if (!cfg) return null
  const upd = async (p: Parameters<typeof bridge.sys.set>[0]) => setCfg(await bridge.sys.set(p))
  const hib = s.hibernateMin ?? 15
  const profile = s.perfPreset ?? "auto"
  const budget = performanceBudget(s, useStore.getState().gamesRunning.length > 0)
  return (
    <>
      <Section title="Bandeja e atalho" desc="O Widgy pode ficar rodando perto do relógio do Windows: o YouTube Music, as calls e os avisos continuam funcionando.">
        <Switch label="Fechar no X manda para a bandeja (em vez de encerrar)" checked={cfg.closeToTray} onChange={(v) => upd({ closeToTray: v })} />
        <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
          <span className="flex items-center gap-2"><Keyboard size={15} /> Atalho para mostrar/esconder o Widgy de qualquer lugar</span>
          <select className="field !w-auto" value={cfg.hotkey} onChange={(e) => upd({ hotkey: e.target.value })}>
            {HOTKEYS.map((k) => <option key={k} value={k}>{hotkeyLabel(k)}</option>)}
          </select>
        </div>
        {cfg.hotkey && cfg.hotkeyOk === false && <div className="text-xs" style={{ color: "#ffd36e" }}>Esse atalho já está sendo usado por outro programa. Escolha outro.</div>}
        <div className="text-xs text-fg-muted">Para sair de vez: botão direito no ícone da bandeja → Sair, ou Início → Sair.</div>
      </Section>

      <Section title="Backup na nuvem" desc="Além das cópias locais automáticas, guarda uma cópia por dia numa pasta do OneDrive, Google Drive ou Dropbox (últimos 30 dias).">
        <Switch label="Fazer backup na nuvem" checked={cfg.cloudOn} onChange={(v) => upd({ cloudOn: v, cloudDir: cfg.cloudDir || cfg.guesses[0]?.path || "" })} />
        <div className="flex items-center gap-2">
          <Cloud size={15} className="shrink-0" />
          <input className="field min-w-0 flex-1 !py-1 text-sm" readOnly value={cfg.cloudDir || "Nenhuma pasta escolhida"} />
          <button className="btn !py-1 text-xs" onClick={async () => { const d = await bridge.sys.pickCloud(); if (d) upd({ cloudDir: d }) }}><FolderOpen size={13} /> Escolher</button>
        </div>
        {cfg.guesses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {cfg.guesses.map((g) => <button key={g.path} className={cn("btn !py-0.5 text-xs", cfg.cloudDir === g.path && "btn-accent")} onClick={() => upd({ cloudDir: g.path })}>{g.label}</button>)}
          </div>
        )}
        <div className="flex items-center gap-3 pt-1">
          <button className="btn !py-1 text-xs" disabled={!cfg.cloudOn || !cfg.cloudDir || copying} onClick={async () => { setCopying(true); setCfg({ ...(await bridge.sys.cloudNow()), guesses: cfg.guesses }); setCopying(false) }}>{copying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Copiar agora</button>
          <span className="text-xs text-fg-muted">{cfg.cloudError ? <span style={{ color: "#ff6b8b" }}>{cfg.cloudError}</span> : cfg.lastCloud ? `Última cópia: ${new Date(cfg.lastCloud).toLocaleString("pt-BR")}` : ""}</span>
        </div>
        <div className="text-xs text-fg-muted">Vai para a pasta “Agenda backup”. As Finanças vão criptografadas: só abrem nesta conta do Windows.</div>
      </Section>

      <Section title="Desempenho e consumo" desc="Defina quanto CPU as animações e a posição dos painéis web podem usar. Música, notificações e relógios continuam funcionando.">
        <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
          <label htmlFor="perf-profile">Perfil de desempenho</label>
          <select id="perf-profile" className="field !w-auto" value={profile} onChange={(e) => set({ perfPreset: e.target.value as PerfPreset })}>
            <option value="auto">Automático (recomendado)</option>
            <option value="quality">Qualidade máxima / referência pura</option>
            <option value="balanced">Equilibrado — 30 FPS</option>
            <option value="economy">Economia de recursos — 15 FPS</option>
            <option value="gaming">Jogos / Valorant — 12 FPS</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-fg-muted">
          Limite atual: <strong className="text-fg">{budget.fps} FPS</strong> nas animações do Widgy, <strong className="text-fg">{budget.embedHz} verificações/s</strong> para posicionar Discord, WhatsApp e iFood.
          Pré-carregamento: <strong className="text-fg">{budget.preload === "all" ? "todas as abas" : budget.preload === "none" ? "somente quando abrir" : "somente essenciais"}</strong>.
          {profile === "auto" && <div className="mt-1">Detecta jogo aberto e reduz o trabalho visual automaticamente; ao interagir com o Widgy, ele continua responsivo.</div>}
          {profile === "quality" && <div className="mt-1">Mantém limites semelhantes aos anteriores. O benchmark A/B puro continua usando separadamente a versão original 0.3.12.</div>}
        </div>
        {profile === "custom" && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 text-xs">Animações
              <select className="field !w-auto" value={s.perfFps ?? 30} onChange={(e) => set({ perfFps: Number(e.target.value) })}>
                {[5, 10, 12, 15, 20, 24, 30, 45, 60].map((v) => <option key={v} value={v}>{v} FPS</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">Painéis web
              <select className="field !w-auto" value={s.perfEmbedHz ?? 12} onChange={(e) => set({ perfEmbedHz: Number(e.target.value) })}>
                {[2, 4, 6, 8, 12, 15, 20, 30].map((v) => <option key={v} value={v}>{v} vezes/s</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs sm:col-span-2">Pré-carregar abas
              <select className="field !w-auto" value={s.perfPreload ?? "essential"} onChange={(e) => set({ perfPreload: e.target.value as PreloadMode })}>
                <option value="all">Todas (mais RAM)</option><option value="essential">Só essenciais</option><option value="none">Não pré-carregar</option>
              </select>
            </label>
          </div>
        )}
        <div className="mt-2">
          <Switch label="Pausar animações do Widgy quando um jogo estiver em primeiro plano" checked={s.perfPauseInGame ?? true} onChange={(v) => set({ perfPauseInGame: v })} />
          <Switch label="Modo leve: sem desfoques, pétalas e partículas de cursor" checked={!!s.perfLite} onChange={(v) => set({ perfLite: v })} />
        </div>
        <p className="mt-2 text-xs text-fg-muted">O pré-carregamento é aplicado na próxima inicialização. Limites de animação e painéis funcionam imediatamente. Estes controles não limitam o FPS do Valorant ou do Discord.</p>
      </Section>

      <Section title="Economia de memória" desc="Discord, WhatsApp e iFood são, cada um, um navegador inteiro. Os que você não usa por um tempo “dormem” e acordam sozinhos quando você abre ou um widget precisa. O Discord numa call nunca dorme.">
        <div className="flex items-center justify-between gap-3 py-1 text-sm">
          <span>Dormir depois de</span>
          <select className="field !w-auto" value={hib} onChange={(e) => set({ hibernateMin: Number(e.target.value) })}>
            {[5, 10, 15, 30, 60, 0].map((m) => <option key={m} value={m}>{m ? `${m} minutos sem uso` : "Nunca"}</option>)}
          </select>
        </div>
      </Section>
    </>
  )
}
