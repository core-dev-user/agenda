import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search, Type, WifiOff } from "lucide-react"
import { Modal } from "@/components/ui/controls"
import { FONT_CATEGORIES, FONTS, ensureFont, fontCategory, getFont, type FontCategory } from "@/lib/fonts"
import { cn } from "@/lib/utils"

type Filter = "all" | "offline" | FontCategory
const ROW_HEIGHT = 56
const PADDING = ROW_HEIGHT * 2
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "offline", label: "Sem internet" },
  ...FONT_CATEGORIES,
]
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

interface FontPickerProps {
  value: string
  onChange: (id: string) => void
  label?: string
  sample?: string
  allowDefault?: boolean
  defaultLabel?: string
}

/** Seletor compacto em formato de roda com pesquisa e carregamento de previews sob demanda. */
export function FontPicker({ value, onChange, label = "Fonte", sample = "Widgy • 12:45", allowDefault = false, defaultLabel = "Do tema" }: FontPickerProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(value)
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const wheelRef = useRef<HTMLDivElement>(null)
  const chosen = getFont(value)
  const shown = useMemo(() => {
    const searched = normalize(query.trim())
    return FONTS.filter((font) =>
      (filter === "all" || (filter === "offline" ? !font.google : fontCategory(font) === filter)) &&
      (!searched || normalize(font.label).includes(searched))
    )
  }, [query, filter])
  const active = shown.find((font) => font.id === highlight)

  useEffect(() => {
    if (!open) return
    const activeIndex = shown.findIndex((font) => font.id === highlight)
    const valueIndex = shown.findIndex((font) => font.id === value)
    const index = activeIndex >= 0 ? activeIndex : Math.max(0, valueIndex)
    setHighlight(shown[index]?.id ?? "")
    const frame = requestAnimationFrame(() => {
      if (wheelRef.current) wheelRef.current.scrollTop = index * ROW_HEIGHT
    })
    return () => cancelAnimationFrame(frame)
  }, [open, shown])

  useEffect(() => {
    if (!open || !highlight) return
    let mounted = true
    setLoaded(null)
    void ensureFont(highlight).then((success) => { if (mounted) setLoaded(success) })
    return () => { mounted = false }
  }, [open, highlight])

  useEffect(() => {
    const root = wheelRef.current
    if (!open || !root || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = (entry.target as HTMLElement).dataset.fontId
          if (id) void ensureFont(id)
        }
      }
    }, { root, rootMargin: "48px 0px" })
    root.querySelectorAll("[data-font-id]").forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [open, shown])

  const launch = () => {
    setQuery("")
    setFilter("all")
    setHighlight(value || FONTS[0].id)
    setOpen(true)
  }
  const focusIndex = (index: number) => {
    if (!shown.length) return
    const safe = Math.max(0, Math.min(shown.length - 1, index))
    setHighlight(shown[safe].id)
    wheelRef.current?.scrollTo({ top: safe * ROW_HEIGHT, behavior: "smooth" })
  }
  const confirm = () => {
    if (active) { onChange(active.id); setOpen(false) }
  }
  const scroll = () => {
    const index = Math.max(0, Math.min(shown.length - 1, Math.round((wheelRef.current?.scrollTop ?? 0) / ROW_HEIGHT)))
    if (shown[index] && shown[index].id !== highlight) setHighlight(shown[index].id)
  }

  return (
    <>
      <button type="button" onClick={launch} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] px-3 py-3 text-left transition hover:border-brand/60 hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Type size={21} /></span>
          <span className="min-w-0">
            <span className="block text-xs text-fg-muted">{label}</span>
            <span className="block truncate text-sm font-semibold">{chosen?.label ?? defaultLabel}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="max-w-24 truncate text-xl" style={{ fontFamily: chosen?.family ?? "var(--font-ui)" }}>Aa</span>
          <ChevronDown size={16} className="shrink-0 text-fg-muted" />
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Biblioteca de fontes" width={600}>
        <div className="space-y-3" role="dialog" aria-label={"Escolher " + label.toLowerCase()} onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); setOpen(false) }
          if (event.key === "ArrowDown") { event.preventDefault(); focusIndex(shown.findIndex((font) => font.id === highlight) + 1) }
          if (event.key === "ArrowUp") { event.preventDefault(); focusIndex(shown.findIndex((font) => font.id === highlight) - 1) }
        }}>
          <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <Search size={17} className="shrink-0 text-fg-muted" />
            <input autoFocus type="search" placeholder="Buscar fonte: Montserrat, Caveat, pixel..." value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <span className="shrink-0 text-xs tabular-nums text-fg-muted">{shown.length}/{FONTS.length}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((category) => (
              <button key={category.id} type="button" onClick={() => setFilter(category.id)} aria-pressed={filter === category.id}
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs transition", filter === category.id ? "border-brand bg-brand/15 text-fg" : "border-line text-fg-muted hover:text-fg")}>
                {category.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] p-3">
            <div className="text-center text-[10px] font-semibold tracking-[0.2em] text-fg-muted uppercase">Prévia ao vivo</div>
            <div className="flex min-h-20 items-center justify-center px-2 text-center text-3xl leading-tight" style={{ fontFamily: active?.family ?? "var(--font-ui)" }}>{sample}</div>
            <div className="text-center text-xs text-fg-muted">{active?.label ?? "Nenhuma fonte"}{active?.google ? " · Catálogo online" : " · Disponível offline"}</div>
            {active?.google && loaded === false && (
              <div className="mt-2 flex justify-center gap-1.5 text-xs text-amber-400"><WifiOff size={14} /> Não foi possível baixar a fonte. Verifique a conexão.</div>
            )}
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-line">
            <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-14 -translate-y-1/2 rounded-xl border border-brand/60 bg-brand/10" />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-[var(--background)] to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-[var(--background)] to-transparent" />
            <div ref={wheelRef} onScroll={scroll} className="h-[280px] snap-y snap-mandatory overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Roda de seleção de fontes">
              {shown.length ? (
                <>
                  <div style={{ height: PADDING }} aria-hidden="true" />
                  {shown.map((font, index) => (
                    <button key={font.id} type="button" data-font-id={font.id} aria-pressed={highlight === font.id}
                      className={cn("relative flex w-full snap-center items-center justify-between gap-3 px-4 text-left transition-colors", highlight === font.id ? "text-fg" : "text-fg-muted hover:text-fg")}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => focusIndex(index)}
                      onDoubleClick={() => { onChange(font.id); setOpen(false) }}>
                      <span className="min-w-0 truncate text-[19px]" style={{ fontFamily: font.family }}>{font.label}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] opacity-70">{!font.google ? "offline" : ""}{highlight === font.id && <Check size={15} className="text-brand" />}</span>
                    </button>
                  ))}
                  <div style={{ height: PADDING }} aria-hidden="true" />
                </>
              ) : <div className="flex h-full items-center justify-center px-5 text-center text-sm text-fg-muted">Nenhuma fonte encontrada. Tente outro termo ou categoria.</div>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
            <span>Role o scroll ou use as setas ↑ ↓. Duplo clique para aplicar.</span>
            <span>{FONTS.filter((font) => !font.google).length} offline</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            {allowDefault && <button type="button" className="btn" onClick={() => { onChange(""); setOpen(false) }}>{defaultLabel}</button>}
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-accent" disabled={!active} onClick={confirm}><Check size={16} /> Aplicar fonte</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
