import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Ellipsis, RotateCcw, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveScreen } from "@/lib/screens"
import { useStore } from "@/lib/store"
import { GlyphTile } from "@/components/Glyph"

/**
 * Inspetor de widget: o painel de personalizar. Fica ao lado do widget, sem escurecer a tela, para a mudança
 * aparecer no próprio widget enquanto se mexe. As peças daqui (grupo, linha, interruptor, deslizante, amostras
 * de cor, opções com prévia) são usadas por todos os widgets, para o painel ter um jeito só.
 */

export const INSPECTOR_W = 372

/* ------------------------------------------------------------------ peças ------------------------------------------------------------------ */

/** Bloco com título pequeno e as linhas dentro de uma caixa só, separadas por um fio. */
export function Group({ title, action, note, children, flush }: { title?: string; action?: ReactNode; note?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="wi-group">
      {(title || action) && (
        <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2 px-1">
          {title && <h4 className="text-[11px] font-semibold tracking-[.07em] text-fg-muted uppercase">{title}</h4>}
          {action}
        </div>
      )}
      <div className={cn("wi-box overflow-hidden rounded-[12px] border border-line", !flush && "divide-y divide-[var(--line)]")} style={{ background: "color-mix(in srgb, var(--fg) 3.5%, transparent)" }}>
        {children}
      </div>
      {note && <p className="mt-1.5 px-1 text-[11.5px] leading-snug text-fg-muted">{note}</p>}
    </section>
  )
}

/** Linha: nome à esquerda, controle à direita. Com `stack` o controle vai para baixo e ocupa a largura toda. */
export function Row({ label, hint, children, stack, trailing }: { label?: ReactNode; hint?: ReactNode; children?: ReactNode; stack?: boolean; trailing?: ReactNode }) {
  if (stack) {
    return (
      <div className="px-3 py-2.5">
        {(label || trailing) && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px]">{label}</span>
            {trailing}
          </div>
        )}
        {children}
        {hint && <div className="mt-1.5 text-[11.5px] leading-snug text-fg-muted">{hint}</div>}
      </div>
    )
  }
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 px-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px] leading-tight">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-fg-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Interruptor numa linha. */
export function Toggle({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-[42px] cursor-pointer items-center justify-between gap-3 px-3 py-1.5", disabled && "pointer-events-none opacity-45")}>
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-muted">{hint}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150", checked ? "bg-brand" : "bg-[color-mix(in_srgb,var(--fg)_20%,transparent)]")}
      >
        <span className="absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/.35)] transition-transform duration-150" style={{ transform: checked ? "translateX(16px)" : "none" }} />
      </button>
    </label>
  )
}

/** Deslizante numa linha: nome, valor e (quando mudou) um botão para voltar ao padrão. */
export function Range({ label, value, min, max, step = 1, onChange, format, def, onReset }: {
  label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string
  /** valor padrão: se o atual for diferente, aparece o botão de voltar */
  def?: number; onReset?: () => void
}) {
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0
  const changed = def !== undefined && Math.abs(value - def) > 1e-6
  return (
    <div className="px-3 pt-2.5 pb-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px]">{label}</span>
        <span className="flex items-center gap-1.5">
          {changed && (
            <button type="button" className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg" title="Voltar ao padrão" aria-label="Voltar ao padrão" onClick={() => (onReset ? onReset() : onChange(def!))}>
              <RotateCcw size={12} />
            </button>
          )}
          <span className="font-num text-[12px] text-fg-muted tabular-nums">{format ? format(value) : value}</span>
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={typeof label === "string" ? label : undefined} aria-valuetext={format ? format(value) : undefined}
        onChange={(e) => onChange(Number(e.target.value))} className="agenda-range block w-full" style={{ ["--pct" as string]: pct + "%" } as CSSProperties}
      />
    </div>
  )
}

/** Escolha entre poucas opções, ocupando a largura toda. */
export function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  const id = useId()
  return (
    <div role="group" aria-label={label} className="flex w-full gap-0.5 rounded-[9px] p-[3px]" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" aria-pressed={on} title={o.title} onClick={() => onChange(o.value)}
            className={cn("relative min-w-0 flex-1 rounded-[7px] px-1.5 py-[5px] text-[12px] leading-tight transition-colors", on ? "font-medium text-fg" : "text-fg-muted hover:text-fg")}>
            {on && <motion.span layoutId={id} className="absolute inset-0 rounded-[7px] shadow-[0_1px_2px_rgb(0_0_0/.25)]" style={{ background: "color-mix(in srgb, var(--fg) 16%, transparent)" }} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
            <span className="relative block truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Opções com uma prévia desenhada em cima do nome. */
export function Tiles<T extends string>({ value, options, onChange, cols = 4, label }: {
  value: T; options: { value: T; label: string; preview: ReactNode }[]; onChange: (v: T) => void; cols?: number; label?: string
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={cn("group/t flex min-w-0 flex-col items-stretch gap-1 rounded-[10px] border p-1 text-center transition-colors", on ? "border-brand bg-brand/12" : "border-transparent hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
            <span className="flex h-10 items-center justify-center overflow-hidden rounded-[7px]" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>{o.preview}</span>
            <span className={cn("truncate px-0.5 pb-0.5 text-[11px] leading-tight", on ? "text-fg" : "text-fg-muted group-hover/t:text-fg")}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Amostras de cor. Com `auto`, a primeira bolinha significa "seguir o tema" (valor vazio); a última abre o seletor livre.
 */
export function Swatches({ value, onChange, colors, auto, label }: { value?: string; onChange: (v: string | undefined) => void; colors: string[]; auto?: string; label?: string }) {
  const v = (value ?? "").toLowerCase()
  const custom = !!v && !colors.some((c) => c.toLowerCase() === v)
  const dot = "relative size-[22px] shrink-0 rounded-full transition-transform hover:scale-110"
  const ring = "ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-transparent"
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-[7px]">
      {auto && (
        <button type="button" aria-pressed={!v} title={auto} aria-label={auto} onClick={() => onChange(undefined)}
          className={cn(dot, "flex items-center justify-center border border-line text-fg-muted", !v && ring)} style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
          <span className="block h-px w-3 rotate-[-45deg] bg-current" />
        </button>
      )}
      {colors.map((c) => (
        <button key={c} type="button" aria-pressed={v === c.toLowerCase()} aria-label={"Cor " + c} title={c} onClick={() => onChange(c)}
          className={cn(dot, "border border-[rgb(255_255_255/.18)]", v === c.toLowerCase() && ring)} style={{ background: c }} />
      ))}
      <label title="Outra cor" className={cn(dot, "cursor-pointer overflow-hidden border border-[rgb(255_255_255/.18)]", custom && ring)}
        style={{ background: custom ? value : "conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)" }}>
        <input type="color" aria-label={(label ? label + ": " : "") + "outra cor"} className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

/** Campo de texto que grava ao sair (ou no Enter), para não refazer o widget a cada tecla. */
export function TextField({ value, onCommit, placeholder, label }: { value: string; onCommit: (v: string) => void; placeholder?: string; label?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input className="wi-input" aria-label={label} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
  )
}

/** Lista de opções (select) no visual do painel. */
export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string }) {
  return (
    <select className="wi-input max-w-[190px] cursor-pointer" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** Botão pequeno do painel. */
export function MiniButton({ children, onClick, disabled, title, danger }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-[5px] text-[12px] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] disabled:pointer-events-none disabled:opacity-40", danger && "hover:!text-red-400")}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ miniaturas ------------------------------------------------------------------ */

/** Miniaturas desenhadas para as opções de estilo (não dependem de símbolos da fonte, que mudam de tamanho de PC para PC). */
const T = "font-num leading-none"
export const CLOCK_PREVIEWS: Record<string, ReactNode> = {
  digital: <span className={cn(T, "text-[14px] font-bold")}>12:34</span>,
  analog: (
    <svg viewBox="0 0 24 24" className="size-[26px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.2" /><path d="M12 12V6.6M12 12l3.6 2.2" /><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  flip: (
    <span className="flex gap-[3px]">
      {["12", "34"].map((d) => (
        <span key={d} className={cn(T, "relative rounded-[4px] px-[4px] py-[5px] text-[12px] font-bold")} style={{ background: "color-mix(in srgb, var(--fg) 16%, transparent)" }}>
          {d}<span className="absolute inset-x-0 top-1/2 h-px bg-black/45" />
        </span>
      ))}
    </span>
  ),
  lcd: <span className="rounded-[4px] px-[5px] py-[4px] font-mono text-[12px] leading-none font-semibold tracking-[.06em]" style={{ background: "#9fb59a", color: "#16241a" }}>12:34</span>,
  minimal: <span className={cn(T, "text-[15px] font-light tracking-[.02em]")}>12.34</span>,
  stacked: <span className={cn(T, "flex flex-col items-center text-[13px] leading-[.95] font-extrabold")}><span>12</span><span className="opacity-60">34</span></span>,
  neon: <span className={cn(T, "rounded-[5px] px-[6px] py-[5px] text-[13px] font-semibold")} style={{ background: "#17111f", color: "#ff8fd0", textShadow: "0 0 6px #ff4fa3, 0 0 12px #ff4fa3" }}>12:34</span>,
  nixie: (
    <span className="flex gap-[2px] rounded-[5px] px-[4px] py-[3px]" style={{ background: "#17111f" }}>
      {["1", "2", "3", "4"].map((d) => (
        <span key={d} className={cn(T, "rounded-t-full rounded-b-[3px] border px-[3px] pt-[5px] pb-[3px] text-[11px] font-medium")} style={{ borderColor: "rgb(255 170 90 / .45)", color: "#ffb066", textShadow: "0 0 5px #ff7a1a" }}>{d}</span>
      ))}
    </span>
  ),
  words: <span className="text-center text-[10px] leading-[1.1] font-semibold">doze e<br />trinta</span>,
  rings: (
    <svg viewBox="0 0 24 24" className="size-[26px]" fill="none" strokeLinecap="round" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" opacity=".18" /><path d="M12 2.5a9.5 9.5 0 1 1-8.2 4.7" stroke="currentColor" />
      <circle cx="12" cy="12" r="5.6" stroke="currentColor" opacity=".18" /><path d="M12 6.4a5.6 5.6 0 0 1 4.8 8.5" stroke="var(--accent)" />
    </svg>
  ),
  gradient: <span className={cn(T, "bg-clip-text text-[14px] font-bold text-transparent")} style={{ backgroundImage: "linear-gradient(90deg, #ff8fb8, #7cc8ff)" }}>12:34</span>,
}

export const COUNTDOWN_PREVIEWS: Record<string, ReactNode> = {
  big: <span className="flex items-baseline gap-[3px]"><span className={cn(T, "text-[19px] font-bold")}>15</span><span className="text-[9px] text-fg-muted">dias</span></span>,
  message: <span className="text-center text-[10px] leading-[1.15]">Faltam <b>15 dias</b><br />para…</span>,
  units: <span className={cn(T, "text-[12.5px] font-semibold tabular-nums")}>15:08:42</span>,
  ring: (
    <span className="relative flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="size-[32px]" fill="none" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="9.4" stroke="currentColor" opacity=".18" /><path d="M12 2.6a9.4 9.4 0 1 1-9.1 11.8" stroke="var(--accent)" />
      </svg>
      <span className={cn(T, "absolute text-[10px] font-bold")}>15</span>
    </span>
  ),
  calendar: (
    <span className="flex w-[28px] flex-col overflow-hidden rounded-[5px]" style={{ background: "color-mix(in srgb, var(--fg) 14%, transparent)" }}>
      <span className="h-[7px]" style={{ background: "#ff6b6b" }} /><span className={cn(T, "py-[4px] text-center text-[13px] font-bold")}>24</span>
    </span>
  ),
  minimal: <span className="flex items-center gap-1.5 text-[11px]"><span className="h-px w-3 bg-current opacity-40" /><b className="font-num">15 dias</b><span className="h-px w-3 bg-current opacity-40" /></span>,
}

/* ------------------------------------------------------------------ painel ------------------------------------------------------------------ */

export interface MenuItem { label: string; icon?: LucideIcon; onClick: () => void; disabled?: boolean; danger?: boolean; hint?: string; checked?: boolean; sep?: boolean }

function Menu({ items, close }: { items: MenuItem[]; close: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onPointerDown={close} />
      <motion.div role="menu" initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
        className="surface absolute top-11 right-2 z-20 w-[236px] overflow-hidden p-1" style={{ borderRadius: 12 }}>
        {items.map((it) => (
          <div key={it.label}>
            {it.sep && <div className="my-1 h-px bg-[var(--line)]" />}
            <button type="button" role="menuitem" disabled={it.disabled} title={it.hint} onClick={() => { close(); it.onClick() }}
              className={cn("flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left text-[13px] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_9%,transparent)] disabled:pointer-events-none disabled:opacity-40", it.danger && "hover:text-red-400")}>
              {it.icon ? <it.icon size={14} className="shrink-0 text-fg-muted" /> : <span className="w-[14px]" />}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.checked && <Check size={13} className="shrink-0" />}
            </button>
          </div>
        ))}
      </motion.div>
    </>
  )
}

/**
 * O painel em si. `anchor` é o retângulo do widget: o painel abre ao lado dele (à direita se couber, senão à
 * esquerda) e não muda de lugar enquanto o widget é redimensionado. Dá para arrastar pelo cabeçalho.
 */
export function InspectorPanel<T extends string>({ open, onClose, title, icon, color, tabs, tab, onTab, menu, anchor, children }: {
  open: boolean; onClose: () => void; title: string; icon: LucideIcon; color: string
  tabs: { id: T; label: string }[]; tab: T; onTab: (t: T) => void
  menu: MenuItem[]; anchor: { x: number; y: number; w: number; h: number }; children: ReactNode
}) {
  const sc = useActiveScreen()
  const ref = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const tabsId = useId()
  // espaço da barra do Widgy (quando ela fica sempre visível): o painel não abre por cima dela
  const tb = useStore((s) => s.settings.taskbar)
  const band = tb.autoHide ? 0 : (tb.size ?? 56) + 30
  const inset = { top: tb.position === "top" ? band : 0, bottom: tb.position === "bottom" ? band : 0, left: tb.position === "left" ? band : 0, right: tb.position === "right" ? band : 0 }
  const area = { x: sc.x + inset.left, y: sc.y + inset.top, w: sc.w - inset.left - inset.right, h: sc.h - inset.top - inset.bottom }
  const H = Math.max(320, Math.min(680, area.h - 24))

  // lugar: calculado ao abrir (ao lado do widget) e depois só muda se o usuário arrastar
  useEffect(() => {
    if (!open) { setPos(null); setMenuOpen(false); return }
    const gap = 14
    const right = anchor.x + anchor.w + gap
    const left = anchor.x - INSPECTOR_W - gap
    const x = right + INSPECTOR_W <= area.x + area.w - 12 ? right : left >= area.x + 12 ? left : area.x + area.w - INSPECTOR_W - 12
    const y = Math.max(area.y + 12, Math.min(anchor.y, area.y + area.h - H - 12))
    setPos({ x, y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // troca de aba volta a rolagem para o topo
  useEffect(() => { if (body.current) body.current.scrollTop = 0 }, [tab])

  // teclado: Esc fecha (o menu primeiro), e o foco volta para onde estava
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const menuRef = useRef(menuOpen)
  menuRef.current = menuOpen
  const before = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) before.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const prev = before.current
    const raf = requestAnimationFrame(() => { if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true }) })
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      const all = document.querySelectorAll("[data-modal]")
      if (all[all.length - 1] !== ref.current) return // há um diálogo aberto por cima: ele fecha primeiro
      e.preventDefault()
      if (menuRef.current) setMenuOpen(false)
      else closeRef.current()
    }
    window.addEventListener("keydown", key)
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", key); if (prev?.isConnected) prev.focus({ preventScroll: true }) }
  }, [open])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !pos || (e.target as HTMLElement).closest("button, input, select, a")) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX, sy = e.clientY, base = pos
    const move = (ev: PointerEvent) => setPos({
      x: Math.max(sc.x - INSPECTOR_W + 80, Math.min(sc.x + sc.w - 80, base.x + ev.clientX - sx)),
      y: Math.max(sc.y, Math.min(sc.y + sc.h - 48, base.y + ev.clientY - sy)),
    })
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up) }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
  }

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={ref} data-modal data-inspector role="dialog" aria-label={"Personalizar " + title} tabIndex={-1}
          className="surface wi fixed z-[5000] flex flex-col overflow-hidden outline-none"
          style={{ left: pos.x, top: pos.y, width: INSPECTOR_W, maxHeight: H, borderRadius: 16, boxShadow: "0 28px 70px -18px rgb(0 0 0 / .65), 0 0 0 1px rgb(255 255 255 / .04)" }}
          initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.7 }}
        >
          <div className="relative flex shrink-0 cursor-grab touch-none items-center gap-2.5 px-3 pt-3 pb-2 select-none active:cursor-grabbing" onPointerDown={startDrag}>
            <GlyphTile icon={icon} color={color} size={26} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] leading-tight font-semibold">{title}</div>
              <div className="text-[11px] leading-tight text-fg-muted">Personalizar</div>
            </div>
            <button type="button" className="wi-icon" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuOpen} title="Mais ações" onClick={() => setMenuOpen((v) => !v)}><Ellipsis size={16} /></button>
            <button type="button" className="wi-icon" aria-label="Fechar" title="Fechar (Esc)" onClick={onClose}><X size={16} /></button>
            <AnimatePresence>{menuOpen && <Menu items={menu} close={() => setMenuOpen(false)} />}</AnimatePresence>
          </div>
          {tabs.length > 1 && (
            <div role="tablist" className="flex shrink-0 gap-4 border-b border-line px-4">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} onClick={() => onTab(t.id)}
                  className={cn("relative pt-1 pb-2 text-[13px] transition-colors", t.id === tab ? "font-medium text-fg" : "text-fg-muted hover:text-fg")}>
                  {t.label}
                  {t.id === tab && <motion.span layoutId={tabsId} className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                </button>
              ))}
            </div>
          )}
          <div ref={body} role="tabpanel" className="wi-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pt-3.5 pb-4">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
