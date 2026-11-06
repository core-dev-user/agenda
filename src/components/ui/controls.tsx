import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/store"
import { LiquidButton, MetalButton } from "./liquid-glass-button"

/** Botão de ação principal que se adapta ao tema: vidro líquido, metal, retrô ou terminal. */
export function ThemedButton({
  children, className, onClick, disabled, title, size = "md",
}: { children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean; title?: string; size?: "sm" | "md" | "lg" }) {
  const theme = useSettings().theme
  if (theme === "glass")
    return (
      <LiquidButton
        size={size === "lg" ? "xl" : size === "sm" ? "sm" : "lg"}
        className={cn("rounded-full text-fg", className)}
        onClick={onClick}
        disabled={disabled}
        title={title}
        type="button"
      >
        <span className="flex items-center gap-2">{children}</span>
      </LiquidButton>
    )
  if (theme === "metal")
    return (
      <MetalButton type="button" variant="primary" onClick={onClick} disabled={disabled} title={title} className={cn(size === "sm" && "h-8 px-3 text-xs", className)}>
        <span className="flex items-center gap-2">{children}</span>
      </MetalButton>
    )
  return (
    <button type="button" className={cn("btn btn-accent", size === "lg" && "px-5 py-2.5 text-base", size === "sm" && "px-2.5 py-1 text-xs", className)} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode }) {
  const theme = useSettings().theme
  const retro = theme === "retro"
  return (
    <label className="clickable flex cursor-pointer items-center justify-between gap-4 py-1.5">
      {label && <span className="text-sm">{label}</span>}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 transition-colors",
          retro ? "rounded-none" : "rounded-full",
          checked ? "bg-brand" : "bg-[color-mix(in_srgb,var(--fg)_18%,transparent)]"
        )}
        style={
          retro
            ? { boxShadow: "inset 1px 1px #808080, inset -1px -1px #fff" }
            : { boxShadow: "inset 0 1px 3px rgb(0 0 0 / .35), inset 0 0 0 1px rgb(255 255 255 / .08)" }
        }
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn("absolute top-0.5 h-5 w-5 bg-white", retro ? "rounded-none" : "rounded-full")}
          style={{
            left: checked ? 22 : 2,
            boxShadow: retro ? "inset -1px -1px #808080, inset 1px 1px #fff" : "0 2px 6px rgb(0 0 0 / .35), inset 0 -2px 3px rgb(0 0 0 / .08)",
          }}
        />
      </button>
    </label>
  )
}

export function Slider({
  label, value, min, max, step = 1, onChange, format,
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="py-1.5">
      <div className="mb-1.5 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-num text-fg-muted">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="agenda-range w-full"
        style={{ ["--pct" as any]: pct + "%" }}
      />
    </div>
  )
}

export function Segmented<T extends string>({
  value, options, onChange, className,
}: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  const id = React.useId()
  return (
    <div className={cn("inline-flex rounded-[calc(var(--r)*0.5)] border border-line p-1", className)} style={{ background: "var(--field)" }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative px-3 py-1 text-sm transition-colors", value === o.value ? "text-white" : "text-fg-muted hover:text-fg")}
        >
          {value === o.value && (
            <motion.span layoutId={id} className="absolute inset-0 rounded-[calc(var(--r)*0.4)] bg-brand" transition={{ type: "spring", stiffness: 400, damping: 32 }} style={{ boxShadow: "inset 0 1px 0 rgb(255 255 255 / .35)" }} />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; width?: number }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div data-modal className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onMouseDown={onClose}>
          <motion.div
            className="surface max-h-[85vh] overflow-hidden"
            style={{ width }}
            initial={{ y: 14, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, scale: 0.97, opacity: 0, transition: { duration: 0.12 } }}
            transition={{ default: { type: "spring", stiffness: 520, damping: 38, mass: 0.7 }, opacity: { duration: 0.12 } }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="titlebar flex items-center justify-between px-5 py-3">
                <div className="font-display text-lg font-semibold">{title}</div>
                <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
              </div>
            )}
            <div className="max-h-[calc(85vh-60px)] overflow-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function Card({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={cn("rounded-[calc(var(--r)*0.7)] border border-line p-4", className)} style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)", ...style }}>
      {children}
    </div>
  )
}

export function Stat({ label, value, tone, sub }: { label: string; value: React.ReactNode; tone?: string; sub?: React.ReactNode }) {
  return (
    <Card className="min-w-0 flex-1">
      <div className="text-xs tracking-wide text-fg-muted uppercase">{label}</div>
      <div className="font-num mt-1 truncate text-2xl font-semibold" style={{ color: tone }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-muted">{sub}</div>}
    </Card>
  )
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-fg-muted">
      <div className="text-4xl opacity-70">{icon}</div>
      <div className="font-display text-lg text-fg">{title}</div>
      {children}
    </div>
  )
}

export const COLOR_SWATCHES = ["#ff8fb8", "#ff6b8b", "#ffb38a", "#ffd36e", "#8cf0b0", "#5ee3c1", "#7cc8ff", "#8f9bff", "#c49bff", "#f0f0f0"]

export function ColorPicker({ value, onChange, swatches = COLOR_SWATCHES }: { value: string; onChange: (v: string) => void; swatches?: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {swatches.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn("h-7 w-7 rounded-full transition-transform hover:scale-110", value.toLowerCase() === c && "ring-2 ring-white ring-offset-2 ring-offset-transparent")}
          style={{ background: `radial-gradient(circle at 30% 30%, #fff8, transparent 50%), ${c}`, boxShadow: "0 2px 6px rgb(0 0 0 / .3)" }}
        />
      ))}
      <label className="clickable relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line" title="Cor personalizada" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}
