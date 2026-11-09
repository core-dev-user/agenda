import { useMemo } from "react"
import { CalendarHeart, RotateCcw } from "lucide-react"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"
import { FONTS } from "@/lib/fonts"
import { cn } from "@/lib/utils"
import { Glyph } from "@/components/Glyph"
import { IconPicker } from "@/components/IconPicker"
import { ColorPicker, Segmented, Slider, Switch } from "@/components/ui/controls"

/* ============================================================ contas ============================================================ */

type Repeat = "none" | "yearly" | "monthly"
type Unit = "auto" | "days" | "weeks" | "hours"
export type CountStyle = "big" | "message" | "units" | "ring" | "calendar" | "minimal"

const DAY = 86_400_000
const z = (n: number) => String(n).padStart(2, "0")
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const isoDay = (d: Date) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`

function parse(date: string, time?: string) {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = (time || "00:00").split(":").map(Number)
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0)
}
/** soma meses/anos sem pular para o mês seguinte (31/01 + 1 mês = 28/02) */
function shift(d: Date, months: number) {
  const day = d.getDate()
  const r = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes())
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()
  r.setDate(Math.min(day, last))
  return r
}

export interface CountState {
  target: Date
  /** começo da contagem (para a barra/anel de progresso) */
  start: Date
  /** é hoje (ou já passou do horário hoje) */
  today: boolean
  /** já passou e não repete */
  past: boolean
  ms: number
  /** dias de calendário até a data (amanhã = 1, mesmo faltando 2 horas) */
  days: number
}

export function countdown(c: Record<string, any>, now: Date): CountState | null {
  if (!c.date) return null
  const repeat: Repeat = c.repeat ?? "none"
  const step = repeat === "yearly" ? 12 : repeat === "monthly" ? 1 : 0
  let target = parse(c.date, c.time)
  // repete: pula para a próxima vez, mas o dia em si continua valendo como "é hoje"
  if (step) {
    let guard = 0
    while (midnight(target) < midnight(now) && guard++ < 2000) target = shift(target, step)
  }
  const sameDay = midnight(target).getTime() === midnight(now).getTime()
  const ms = target.getTime() - now.getTime()
  const today = sameDay && (!c.time || ms <= 0)
  const past = !step && !sameDay && ms < 0
  const days = Math.round((midnight(target).getTime() - midnight(now).getTime()) / DAY)
  // começo: a vez anterior (quando repete) ou o dia em que a contagem foi criada
  let start = step ? shift(target, -step) : c.from ? parse(c.from) : new Date(target.getTime() - 30 * DAY)
  if (start > now) start = midnight(now)
  return { target, start, today, past, ms, days }
}

const plural = (n: number, one: string, many: string) => (Math.abs(n) === 1 ? one : many)

/** número + unidade que aparecem no widget */
export function amount(st: CountState, unit: Unit): { n: number; unit: string } {
  const h = Math.max(0, Math.ceil(st.ms / 3_600_000))
  if (unit === "hours") return { n: h, unit: plural(h, "hora", "horas") }
  if (unit === "weeks" && st.days >= 7) {
    const w = Math.floor(st.days / 7)
    return { n: w, unit: plural(w, "semana", "semanas") }
  }
  if (unit === "auto" && st.days <= 0) {
    if (h >= 1) return { n: h, unit: plural(h, "hora", "horas") }
    const m = Math.max(1, Math.ceil(st.ms / 60_000))
    return { n: m, unit: plural(m, "minuto", "minutos") }
  }
  const d = Math.abs(st.days)
  return { n: d, unit: plural(d, "dia", "dias") }
}

const fmtDate = (d: Date, time: boolean) =>
  d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" }).replace(".", "") + (time ? ` · ${z(d.getHours())}:${z(d.getMinutes())}` : "")

/** troca {n}, {unidade}, {titulo}, {data} na mensagem */
function fill(tpl: string, v: { n: number | string; unit: string; title: string; date: string }) {
  return tpl
    .replace(/\{n\}/gi, String(v.n))
    .replace(/\{unidade\}/gi, v.unit)
    .replace(/\{t[ií]tulo\}/gi, v.title)
    .replace(/\{data\}/gi, v.date)
}

export const DEFAULT_MSG = "{n} {unidade} para {titulo}"
export const DEFAULT_DONE = "É hoje: {titulo}!"
const MSG_PRESETS = ["{n} {unidade} para {titulo}", "Faltam {n} {unidade}", "{titulo} em {n} {unidade}", "Só mais {n} {unidade}!"]

/* ============================================================ widget ============================================================ */

export function CountdownWidget({ w }: { w: Widget }) {
  const c = w.config
  const style: CountStyle = c.style ?? "big"
  // os segundos só importam no estilo com as casas (dias/horas/min/seg)
  const now = useNow(style === "units" && c.seconds !== false ? 1000 : 20_000)
  const st = useMemo(() => countdown(c, now), [c.date, c.time, c.repeat, c.from, now])
  const color: string = c.color || "var(--accent)"
  const font = c.font ? FONTS.find((f) => f.id === c.font)?.family : undefined
  const title: string = c.title?.trim() || "o grande dia"
  const align = c.align ?? "center"

  if (!st)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-fg-muted">
        <CalendarHeart size={26} style={{ color }} />
        Abra a configuração do widget (engrenagem) e escolha a data.
      </div>
    )

  const a = amount(st, c.unit ?? "auto")
  const vars = { n: a.n, unit: a.unit, title, date: fmtDate(st.target, !!c.time) }
  const done = st.today
  const message = done ? fill(c.doneMessage?.trim() || DEFAULT_DONE, vars) : st.past ? `${title}: já passou` : fill(c.message?.trim() || DEFAULT_MSG, vars)
  const progress = Math.min(1, Math.max(0, (now.getTime() - st.start.getTime()) / Math.max(1, st.target.getTime() - st.start.getTime())))
  const scale: number = c.size ?? 1
  const icon = c.icon ? <Glyph v={c.icon} size={Math.round(16 * scale)} style={{ color }} /> : null
  const dateLine = c.showDate !== false && <div className="truncate text-[11px] text-fg-muted">{fmtDate(st.target, !!c.time)}{c.repeat === "yearly" ? " · todo ano" : c.repeat === "monthly" ? " · todo mês" : ""}</div>
  const bar = c.bar && !done && !st.past && (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 10%, transparent)" }}>
      <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: color, transition: "width .6s" }} />
    </div>
  )
  const num = (size: number) => ({ fontFamily: font ?? "var(--font-num)", fontSize: size * scale, color: done ? color : c.numColor || undefined, lineHeight: 1 })
  const box = cn("flex h-full w-full flex-col justify-center gap-1.5 p-4", align === "center" ? "items-center text-center" : "items-start text-left")
  // texto da mensagem com o número em destaque
  const rich = (size: number) => {
    const parts = message.split(String(a.n))
    if (done || st.past || parts.length < 2) return <span>{message}</span>
    return <>{parts[0]}<span className="font-bold" style={{ color, fontFamily: font ?? "var(--font-num)", fontSize: size * 1.35 }}>{a.n}</span>{parts.slice(1).join(String(a.n))}</>
  }

  if (style === "minimal")
    return (
      <div className={cn(box, "flex-row !justify-start gap-2")}>
        {icon}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" style={{ fontSize: 15 * scale }}>{rich(15 * scale)}</div>
          {dateLine}
        </div>
      </div>
    )

  if (style === "message")
    return (
      <div className={box}>
        {icon}
        <div className="font-display leading-tight font-semibold" style={{ fontSize: 22 * scale }}>{rich(22 * scale)}</div>
        {dateLine}
        {bar}
      </div>
    )

  if (style === "units") {
    const left = Math.max(0, st.ms)
    const parts: [number, string][] = [[Math.floor(left / DAY), "dias"], [Math.floor(left / 3_600_000) % 24, "horas"], [Math.floor(left / 60_000) % 60, "min"]]
    if (c.seconds !== false) parts.push([Math.floor(left / 1000) % 60, "seg"])
    return (
      <div className={box}>
        <div className="flex max-w-full items-center gap-1.5 truncate text-sm font-medium">{icon}{done ? message : title}</div>
        {!done && (
          <div className="flex gap-1.5">
            {parts.map(([v, l]) => (
              <div key={l} className="flex flex-col items-center rounded-xl px-2 py-1.5" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .08)", minWidth: 44 * scale }}>
                <span className="font-semibold tabular-nums" style={num(26)}>{z(v)}</span>
                <span className="mt-1 text-[10px] text-fg-muted uppercase">{l}</span>
              </div>
            ))}
          </div>
        )}
        {dateLine}
        {bar}
      </div>
    )
  }

  if (style === "ring") {
    const R = 44, C = 2 * Math.PI * R
    const ring = Math.min(w.w - 32, w.h - 64, 150 * scale)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center">
        <div className="relative" style={{ width: ring, height: ring }}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="color-mix(in srgb, var(--fg) 10%, transparent)" strokeWidth="6" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (done ? 1 : progress))} style={{ transition: "stroke-dashoffset .8s" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {done ? <span className="px-3 text-sm font-semibold" style={{ color }}>É hoje!</span> : <>
              <span className="font-bold tabular-nums" style={num(ring * 0.3 / scale)}>{a.n}</span>
              <span className="text-[11px] text-fg-muted">{a.unit}</span>
            </>}
          </div>
        </div>
        <div className="flex max-w-full items-center gap-1.5 truncate text-sm font-medium">{icon}{done ? message : title}</div>
      </div>
    )
  }

  if (style === "calendar") {
    const t = st.target
    const month = t.toLocaleDateString("pt-BR", { month: "long" })
    return (
      <div className="flex h-full w-full items-center justify-center gap-4 p-4">
        <div className="flex shrink-0 flex-col overflow-hidden rounded-[14px] text-center" style={{ width: 92 * scale, background: "color-mix(in srgb, var(--fg) 92%, transparent)", color: "#1b1b22", boxShadow: "0 10px 24px -10px rgb(0 0 0 / .5)" }}>
          <div className="py-1 text-[11px] font-bold tracking-wider text-white uppercase" style={{ background: color }}>{month}</div>
          <div className="font-bold" style={{ fontFamily: font ?? "var(--font-num)", fontSize: 40 * scale, lineHeight: 1.15 }}>{t.getDate()}</div>
          <div className="pb-1.5 text-[10px] font-medium uppercase opacity-60">{t.toLocaleDateString("pt-BR", { weekday: "long" })}</div>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 truncate text-sm font-semibold">{icon}{title}</div>
          <div className="leading-tight" style={{ fontSize: 15 * scale }}>{done ? <b style={{ color }}>{message}</b> : st.past ? "Já passou" : <>{a.n === 1 && a.unit === "dia" ? "É amanhã" : <><span className="font-bold" style={{ color, fontFamily: font ?? "var(--font-num)", fontSize: 22 * scale }}>{a.n}</span> {a.unit}</>}</>}</div>
          {bar}
        </div>
      </div>
    )
  }

  // "big": número grande, unidade e a mensagem embaixo
  return (
    <div className={box}>
      {icon}
      {done ? (
        <div className="font-display font-bold" style={{ fontSize: 26 * scale, color }}>{message}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={cn("font-bold tabular-nums", c.glow && "drop-shadow-[0_0_14px_currentColor]")} style={num(Math.min(64, w.h * 0.34))}>{a.n}</span>
            <span className="text-lg text-fg-muted" style={{ fontSize: 17 * scale }}>{a.unit}</span>
          </div>
          <div className="max-w-full truncate text-sm font-medium">{st.past ? `${title}: já passou` : message.replace(new RegExp(`^${a.n}\\s+${a.unit}\\s*`), "") || title}</div>
        </>
      )}
      {dateLine}
      {bar}
    </div>
  )
}

/* ============================================================ configurar ============================================================ */

export function CountdownSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const c = w.config
  const now = new Date()
  const st = countdown(c, now)
  const preview = st ? fill(c.message?.trim() || DEFAULT_MSG, { ...amount(st, c.unit ?? "auto"), title: c.title?.trim() || "o grande dia", date: fmtDate(st.target, !!c.time) }) : ""
  return (
    <>
      <label className="block text-sm">Título
        <input className="field mt-1 w-full" defaultValue={c.title ?? ""} placeholder="Ex.: o meu aniversário" onBlur={(e) => set({ title: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Data
          <input type="date" className="field mt-1 w-full" value={c.date ?? ""} onChange={(e) => set({ date: e.target.value || undefined, from: isoDay(now) })} />
        </label>
        <label className="block text-sm">Horário (opcional)
          <div className="mt-1 flex gap-1">
            <input type="time" className="field w-full" value={c.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined })} />
            {c.time && <button className="btn btn-icon !p-1.5" title="Sem horário" onClick={() => set({ time: undefined })}><RotateCcw size={13} /></button>}
          </div>
        </label>
      </div>
      <div className="text-sm text-fg-muted">Repetir</div>
      <Segmented value={c.repeat ?? "none"} onChange={(v) => set({ repeat: v })} options={[{ value: "none", label: "Uma vez" }, { value: "yearly", label: "Todo ano" }, { value: "monthly", label: "Todo mês" }]} />
      <div className="text-xs text-fg-muted">Aniversários e datas comemorativas: “Todo ano” — depois do dia, a contagem recomeça sozinha.</div>

      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className="text-sm font-semibold">Mensagem</div>
        <input className="field w-full" defaultValue={c.message ?? ""} key={"m" + (c.message ?? "")} placeholder={DEFAULT_MSG} onBlur={(e) => set({ message: e.target.value })} />
        <div className="flex flex-wrap gap-1">
          {MSG_PRESETS.map((p) => (
            <button key={p} className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", (c.message || DEFAULT_MSG) === p ? "border-transparent bg-brand text-white" : "border-line text-fg-muted hover:text-fg")} onClick={() => set({ message: p })}>{p}</button>
          ))}
        </div>
        <div className="text-[11px] text-fg-muted">Use <b>{"{n}"}</b> (o número), <b>{"{unidade}"}</b> (dias, horas…), <b>{"{titulo}"}</b> e <b>{"{data}"}</b>.</div>
        {preview && <div className="rounded-lg px-2 py-1.5 text-sm" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>{preview}</div>}
        <div className="pt-1 text-sm">No dia</div>
        <input className="field w-full" defaultValue={c.doneMessage ?? ""} placeholder={DEFAULT_DONE} onBlur={(e) => set({ doneMessage: e.target.value })} />
      </div>

      <div className="text-sm text-fg-muted">Como mostrar</div>
      <div className="grid grid-cols-3 gap-1.5">
        {([
          ["big", "Número grande", "15"], ["message", "Frase", "Aa 15"], ["units", "Dias · horas · min", "15:08:42"],
          ["ring", "Anel de progresso", "◔"], ["calendar", "Folhinha", "▤ 24"], ["minimal", "Uma linha", "— 15 —"],
        ] as const).map(([v, label, ico]) => (
          <button key={v} onClick={() => set({ style: v })} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px]", (c.style ?? "big") === v ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
            <span className="font-num text-sm leading-none">{ico}</span>{label}
          </button>
        ))}
      </div>
      {(c.style ?? "big") !== "units" && (
        <>
          <div className="text-sm text-fg-muted">Contar em</div>
          <Segmented value={c.unit ?? "auto"} onChange={(v) => set({ unit: v })} options={[{ value: "auto", label: "Dias (horas no último)" }, { value: "days", label: "Dias" }, { value: "weeks", label: "Semanas" }, { value: "hours", label: "Horas" }]} />
        </>
      )}
      {c.style === "units" && <Switch label="Mostrar os segundos" checked={c.seconds !== false} onChange={(v) => set({ seconds: v })} />}

      <div className="text-sm">Cor de destaque</div>
      <div className="flex items-center gap-3">
        <ColorPicker value={c.color ?? "#ff8fb8"} onChange={(v) => set({ color: v })} swatches={["#ff8fb8", "#ff6b8b", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff", "#ffffff"]} />
        {c.color && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ color: undefined })}>cor do tema</button>}
      </div>
      <Slider label="Tamanho" value={c.size ?? 1} min={0.6} max={1.8} step={0.05} onChange={(v) => set({ size: v })} format={(v) => Math.round(v * 100) + "%"} />
      <label className="block text-sm">Fonte dos números
        <select className="field mt-1 w-full" value={c.font ?? ""} onChange={(e) => set({ font: e.target.value || undefined })}>
          <option value="">Padrão do tema</option>
          {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>)}
        </select>
      </label>
      {["big", "message", "units"].includes(c.style ?? "big") && (
        <>
          <div className="text-sm text-fg-muted">Alinhamento</div>
          <Segmented value={c.align ?? "center"} onChange={(v) => set({ align: v })} options={[{ value: "center", label: "Centro" }, { value: "left", label: "Esquerda" }]} />
        </>
      )}
      <Switch label="Mostrar a data embaixo" checked={c.showDate !== false} onChange={(v) => set({ showDate: v })} />
      <Switch label="Barra de progresso (quanto já passou)" checked={!!c.bar} onChange={(v) => set({ bar: v })} />
      {(c.style ?? "big") === "big" && <Switch label="Brilho no número" checked={!!c.glow} onChange={(v) => set({ glow: v })} />}
      <div className="flex items-center gap-2 text-sm">
        Ícone
        <IconPicker value={c.icon} onPick={(v) => set({ icon: v })} color={c.color} />
        {c.icon && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ icon: undefined })}>sem ícone</button>}
      </div>
    </>
  )
}
