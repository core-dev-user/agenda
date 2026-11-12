import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Clock, Disc3, Flame, Headphones, Music2, Sparkles, Trash2, Users } from "lucide-react"
import { useStore } from "@/lib/store"
import { aggregate, clearListening, emptyListen, fmtMin, type Period } from "@/lib/listening"
import { bridge } from "@/lib/bridge"
import { Card, Segmented } from "@/components/ui/controls"
import { cn, todayISO } from "@/lib/utils"

/** procura e abre a música no player */
const play = (q: string) => { useStore.setState({ musicTab: "player" }); bridge.music.cmd("search", q) }

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "year", label: "Este ano" }, { value: "all", label: "Tudo" },
]

/** Painel "o que eu mais ouço" do YouTube Music. */
export function MusicStats() {
  const L = useStore((s) => s.listening) ?? emptyListen()
  const [p, setP] = useState<Period>("30")
  const a = useMemo(() => aggregate(L, p), [L, p])
  const empty = a.total < 30

  return (
    <div className="h-full space-y-4 overflow-auto p-1 pr-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-display flex-1 text-xl font-semibold">O que você mais ouve</div>
        <Segmented value={p} onChange={setP} options={PERIODS} />
        <button className="btn btn-ghost !py-1 text-xs hover:!text-red-400" title="Apaga tudo o que o Widgy registrou do YouTube Music neste PC" onClick={() => confirm("Limpar todo o histórico de escuta do YouTube Music? Músicas, tempos, artistas e tocadas recentemente serão apagados.") && clearListening()}><Trash2 size={13} /> Limpar histórico</button>
      </div>
      {empty ? (
        <Card className="py-10 text-center">
          <Headphones size={38} strokeWidth={1.3} className="mx-auto text-fg-muted" />
          <div className="font-display mt-2 text-lg">Ainda juntando dados</div>
          <div className="mx-auto mt-1 max-w-md text-sm text-fg-muted">O Agenda registra o que toca no YouTube Music a partir de agora (o YT Music não entrega o histórico antigo). Ouça um pouco e volte aqui.</div>
          <div className="mt-2 text-xs text-fg-muted">Registrando desde {new Date(L.since).toLocaleDateString("pt-BR")}</div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Clock size={14} />} label="Tempo ouvindo" value={fmtMin(a.total)} sub={a.days > 1 ? `média ${fmtMin(a.total / Math.max(1, a.days))} por dia` : undefined} />
            <Tile icon={<Headphones size={14} />} label="Músicas ouvidas" value={String(a.plays)} sub={`${a.tracks.length} diferentes`} />
            <Tile icon={<Users size={14} />} label="Artistas" value={String(a.artists.length)} sub={a.artists[0] ? `top: ${a.artists[0].name}` : undefined} />
            <Tile icon={<Flame size={14} />} label="Dias seguidos" value={String(a.streak)} sub="ouvindo música" />
          </div>

          {/* destaque: música, artista e gênero do período */}
          <div className="grid gap-3 lg:grid-cols-3">
            {a.tracks[0] && (
              <Hero label="Música mais ouvida" img={a.tracks[0].meta?.art} title={a.tracks[0].meta?.title ?? "—"} sub={a.tracks[0].meta?.artist} stat={`${a.tracks[0].plays}× · ${fmtMin(a.tracks[0].sec)}`} onClick={() => a.tracks[0].meta && play(`${a.tracks[0].meta.title} ${a.tracks[0].meta.artist}`)} />
            )}
            {a.artists[0] && <Hero label="Artista mais ouvido" img={a.artists[0].art} round title={a.artists[0].name} stat={`${fmtMin(a.artists[0].sec)} · ${a.artists[0].plays} músicas`} />}
            <Hero label="Gênero mais ouvido" icon={<Sparkles size={34} />} title={a.genres[0]?.[0] ?? "Descobrindo…"} stat={a.genres[0] ? `${Math.round((a.genres[0][1] / Math.max(1, a.genres.reduce((s, g) => s + g[1], 0))) * 100)}% do tempo` : "buscando os gêneros dos artistas"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-2 flex items-center gap-1.5 font-semibold"><Music2 size={15} /> Top músicas</div>
              {a.tracks.slice(0, 10).map((t, i) => (
                <button key={t.k} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" title="Tocar no YouTube Music" onClick={() => t.meta && play(`${t.meta.title} ${t.meta.artist}`)}>
                  <span className="font-num w-5 text-right text-sm text-fg-muted">{i + 1}</span>
                  {t.meta?.art ? <img src={t.meta.art} className="h-9 w-9 rounded-md object-cover" draggable={false} /> : <div className="h-9 w-9 rounded-md bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.meta?.title ?? t.k}</span><span className="block truncate text-xs text-fg-muted">{t.meta?.artist}</span></span>
                  <span className="font-num text-right text-xs"><b>{t.plays}×</b><span className="block text-fg-muted">{fmtMin(t.sec)}</span></span>
                </button>
              ))}
            </Card>
            <div className="space-y-4">
              <Card>
                <div className="mb-2 flex items-center gap-1.5 font-semibold"><Users size={15} /> Top artistas</div>
                <Bars items={a.artists.slice(0, 7).map((x) => ({ label: x.name, value: x.sec, img: x.art }))} />
              </Card>
              <Card>
                <div className="mb-2 flex items-center gap-1.5 font-semibold"><Disc3 size={15} /> Gêneros</div>
                {a.genres.length ? <Bars items={[...a.genres.slice(0, 6), ...(a.genres.length > 6 ? [["Outros", a.genres.slice(6).reduce((s, g) => s + g[1], 0)] as [string, number]] : [])].map(([g, v]) => ({ label: g, value: v }))} pct /> : <div className="text-sm text-fg-muted">Buscando os gêneros dos seus artistas…</div>}
              </Card>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <div className="mb-1 font-semibold">Minutos por dia</div>
              <DaysChart perDay={a.perDay} days={p === "today" || p === "7" ? 7 : 30} />
            </Card>
            <Card>
              <div className="mb-1 font-semibold">Horário que você mais ouve</div>
              <HoursChart hours={L.hours} />
            </Card>
          </div>

          <Card>
            <div className="mb-2 font-semibold">Tocadas recentemente</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {L.recent.slice(0, 12).map((r, i) => {
                const m = L.meta[r.k]
                return (
                  <div key={r.k + r.at + i} className="flex items-center gap-2 text-sm">
                    {m?.art ? <img src={m.art} className="h-7 w-7 rounded object-cover" draggable={false} /> : <div className="h-7 w-7 rounded bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]" />}
                    <span className="min-w-0 flex-1 truncate">{m?.title} <span className="text-fg-muted">· {m?.artist}</span></span>
                    <span className="text-[11px] text-fg-muted">{new Date(r.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )
              })}
            </div>
          </Card>
          <div className="pb-2 text-center text-xs text-fg-muted">Registrando desde {new Date(L.since).toLocaleDateString("pt-BR")} · os dados ficam só neste PC</div>
        </>
      )}
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

function Hero({ label, img, icon, title, sub, stat, round, onClick }: { label: string; img?: string; icon?: React.ReactNode; title: string; sub?: string; stat: string; round?: boolean; onClick?: () => void }) {
  return (
    <motion.button whileHover={{ y: -2 }} onClick={onClick} className="relative flex items-center gap-3 overflow-hidden rounded-[calc(var(--r)*0.7)] border border-line p-3 text-left" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
      {img && <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `url("${img}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(28px) saturate(1.5)", transform: "scale(1.4)" }} />}
      {img ? <img src={img} className={cn("relative h-16 w-16 object-cover shadow-lg", round ? "rounded-full" : "rounded-xl")} draggable={false} /> : <div className="relative flex h-16 w-16 items-center justify-center rounded-xl bg-brand text-white shadow-lg">{icon}</div>}
      <div className="relative min-w-0 flex-1">
        <div className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{label}</div>
        <div className="font-display truncate text-lg font-semibold">{title}</div>
        {sub && <div className="truncate text-xs text-fg-muted">{sub}</div>}
        <div className="font-num mt-0.5 text-xs">{stat}</div>
      </div>
    </motion.button>
  )
}

function Bars({ items, pct }: { items: { label: string; value: number; img?: string }[]; pct?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[130px_1fr_70px] items-center gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">{i.img && <img src={i.img} className="h-5 w-5 rounded-full object-cover" draggable={false} />}<span className="truncate">{i.label}</span></span>
          <span className="h-3"><span className="block h-full rounded-r-[4px]" style={{ width: `${(i.value / max) * 100}%`, minWidth: 3, background: "var(--viz-1)" }} /></span>
          <span className="font-num text-right text-xs whitespace-nowrap">{pct ? `${Math.round((i.value / Math.max(1, total)) * 100)}%` : fmtMin(i.value)}</span>
        </div>
      ))}
    </div>
  )
}

function DaysChart({ perDay, days }: { perDay: Map<string, number>; days: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const list = Array.from({ length: days }, (_, i) => { const d = new Date(Date.now() - (days - 1 - i) * 86400000); const k = todayISO(d); return { k, d, v: perDay.get(k) ?? 0 } })
  const max = Math.max(60, ...list.map((x) => x.v))
  return (
    <div className="relative">
      <div className="flex h-32 items-end gap-[3px] border-b border-line">
        {list.map((x, i) => (
          <div key={x.k} className="relative flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[4px] transition-opacity" style={{ height: `${(x.v / max) * 100}%`, minHeight: x.v ? 2 : 0, background: "var(--viz-1)", opacity: hover == null || hover === i ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-fg-muted"><span>{list[0].d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span><span>hoje</span></div>
      {hover != null && (
        <div className="pointer-events-none absolute -top-2 rounded-lg border border-line px-2 py-1 text-xs shadow-lg" style={{ background: "var(--field)", left: `${((hover + 0.5) / days) * 100}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold">{list[hover].d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</div>
          <div className="font-num">{fmtMin(list[hover].v)}</div>
        </div>
      )}
    </div>
  )
}

function HoursChart({ hours }: { hours: number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...hours)
  const top = hours.indexOf(Math.max(...hours))
  return (
    <div className="relative">
      <div className="flex h-32 items-end gap-[2px] border-b border-line">
        {hours.map((v, h) => (
          <div key={h} className="flex h-full flex-1 items-end" onPointerEnter={() => setHover(h)} onPointerLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[3px]" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, background: "var(--viz-1)", opacity: hover == null || hover === h ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-fg-muted"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
      <div className="mt-1 text-xs text-fg-muted">{hours[top] > 0 ? `Pico entre ${top}h e ${top + 1}h` : ""}</div>
      {hover != null && (
        <div className="pointer-events-none absolute -top-2 rounded-lg border border-line px-2 py-1 text-xs shadow-lg" style={{ background: "var(--field)", left: `${((hover + 0.5) / 24) * 100}%`, transform: "translate(-50%, -100%)" }}>
          <b>{hover}h–{hover + 1}h</b> · <span className="font-num">{fmtMin(hours[hover])}</span>
        </div>
      )}
    </div>
  )
}
