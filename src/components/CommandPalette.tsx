import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { CornerDownLeft, Search } from "lucide-react"
import { useStore, THEME_PRESETS } from "@/lib/store"
import { bridge, type WhatsChat } from "@/lib/bridge"
import { useFinance } from "@/lib/financeStore"
import { SECTIONS } from "./sections-meta"
import { AppIcon } from "./AppIcon"
import { Glyph } from "./Glyph"
import { WIDGET_CHOICES } from "@/widgets/WidgetFrame"
import { brl, cn, todayISO } from "@/lib/utils"
import type { SectionId, ThemeId } from "@/lib/types"

interface Item { id: string; group: string; title: string; sub?: string; icon: React.ReactNode; run: () => void; words?: string }
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const THEME_NAMES: Record<ThemeId, string> = { glass: "Vidro líquido", metal: "Metal", retro: "Retrô 95", terminal: "Terminal CRT", minimal: "Minimal" }

/** Busca rápida (Ctrl+K): abas, tarefas, listas, estudos, serviços, hábitos, conversas, lançamentos, eventos e ações. */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const close = () => useStore.setState({ paletteOpen: false })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); useStore.setState((s) => ({ paletteOpen: !s.paletteOpen })) }
      else if (e.key === "Escape" && useStore.getState().paletteOpen) close()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div data-modal className="fixed inset-0 z-[6000] flex items-start justify-center bg-black/35 pt-[12vh] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onMouseDown={close}>
          <motion.div className="surface w-[640px] max-w-[92vw] overflow-hidden" initial={{ y: -12, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, scale: 0.98, opacity: 0 }} transition={{ type: "spring", stiffness: 520, damping: 36 }} onMouseDown={(e) => e.stopPropagation()}>
            <Palette close={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function Palette({ close }: { close: () => void }) {
  const [q, setQ] = useState("")
  const [sel, setSel] = useState(0)
  const [chats, setChats] = useState<WhatsChat[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const st = useStore.getState()
  const openW = (id: SectionId) => { useStore.getState().openWindow(id); close() }
  useEffect(() => {
    bridge.webapp.status().then((s) => { if (s?.whatsapp?.alive) bridge.webapp.whatsapp().then((r) => setChats(r.chats ?? [])).catch(() => {}) }).catch(() => {})
  }, [])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const s of SECTIONS) out.push({ id: "sec-" + s.id, group: "Abrir", title: s.label, icon: <AppIcon id={s.id} size={22} />, run: () => openW(s.id) })
    const today = todayISO()
    out.push({ id: "focus", group: "Ações", title: st.focusManual ? "Desligar modo foco" : "Ligar modo foco", icon: "i:Target", run: () => { useStore.setState((s) => ({ focusManual: !s.focusManual })); close() }, words: "foco concentrar estudar" })
    out.push({ id: "lock", group: "Ações", title: st.settings.widgetsLocked ? "Destravar widgets" : "Travar widgets", icon: "i:Lock", run: () => { st.setSettings({ widgetsLocked: !st.settings.widgetsLocked }); close() } })
    for (const t of Object.keys(THEME_PRESETS) as ThemeId[]) out.push({ id: "theme-" + t, group: "Ações", title: `Tema: ${THEME_NAMES[t]}`, icon: "i:Palette", run: () => { st.applyTheme(t); close() }, words: "tema aparencia" })
    for (const t of st.templates) out.push({ id: "tpl-" + t.id, group: "Ações", title: `Aplicar template: ${t.name}`, icon: "i:Sparkles", run: () => { st.applyTemplate(t.id); close() }, words: "template estilo" })
    for (const c of WIDGET_CHOICES.filter((c) => c.group === "widget")) out.push({ id: "w-" + c.type, group: "Adicionar widget", title: c.label, icon: <c.icon size={17} />, run: () => { st.addWidget(c.type, c.config); close() }, words: "widget adicionar" })
    for (const t of st.tasks.filter((t) => !t.done).slice(0, 200))
      out.push({ id: "task-" + t.id, group: "Tarefas", title: t.title, sub: t.date ? `${t.date === today ? "hoje" : new Date(t.date + "T12:00").toLocaleDateString("pt-BR")}${t.time ? " " + t.time : ""} · Enter conclui` : "Enter conclui", icon: "i:CircleCheck", run: () => { st.set("tasks", (ts) => ts.map((x) => (x.id === t.id ? { ...x, done: true, doneAt: Date.now() } : x))); close() } })
    for (const h of st.habits.filter((h) => !h.archived)) {
      const done = (st.habitLog[today] ?? []).includes(h.id)
      out.push({ id: "hab-" + h.id, group: "Hábitos de hoje", title: `${done ? "Desmarcar" : "Marcar"}: ${h.name}`, icon: h.emoji, run: () => { st.toggleHabit(h.id); close() }, words: "habito" })
    }
    for (const l of st.lists) {
      out.push({ id: "list-" + l.id, group: "Listas", title: l.name, sub: `${l.items.length} itens`, icon: l.emoji, run: () => openW("lists") })
      for (const it of l.items.slice(0, 200)) out.push({ id: "li-" + it.id, group: "Listas", title: it.name, sub: `${l.name}${it.price ? " · " + brl(it.price) : ""}`, icon: it.checked ? "i:CircleCheck" : l.emoji, run: () => openW("lists") })
    }
    for (const s of st.subjects) {
      out.push({ id: "sub-" + s.id, group: "Estudos", title: s.name, sub: s.subtitle, icon: s.emoji, run: () => openW("studies") })
      for (const t of s.topics) out.push({ id: "top-" + t.id, group: "Estudos", title: t.title, sub: `${s.name}${t.done ? " · aprendido" : ""}`, icon: t.done ? "i:CircleCheck" : "i:BookOpen", run: () => openW("studies") })
      for (const so of s.songs ?? []) out.push({ id: "song-" + so.id, group: "Estudos", title: so.title, sub: `${s.name} · ${so.progress}%`, icon: "i:Music", run: () => openW("studies") })
    }
    for (const s of st.services.slice(0, 300)) out.push({ id: "srv-" + s.id, group: "Serviços", title: s.client || s.description || "Serviço", sub: `${s.description || s.category} · ${brl(s.value)} · ${new Date(s.date + "T12:00").toLocaleDateString("pt-BR")}`, icon: "i:Briefcase", run: () => openW("services") })
    for (const c of chats) out.push({ id: "wa-" + c.name, group: "WhatsApp", title: c.name, sub: c.last, icon: "i:MessageCircle", run: () => { bridge.webapp.whatsappOpen(c.name); openW("whatsapp") } })
    const fin = useFinance.getState()
    if (fin.status === "open")
      for (const t of fin.data.txns.slice(0, 1500)) out.push({ id: "tx-" + t.id, group: "Finanças", title: t.desc, sub: `${new Date(t.date + "T12:00").toLocaleDateString("pt-BR")} · ${fin.hidden ? "R$ ••••" : brl(t.amount)}`, icon: "i:Wallet", run: () => openW("finance") })
    for (const e of st.calEvents.filter((e) => e.end > Date.now()).slice(0, 100)) out.push({ id: "ev-" + e.id, group: "Agenda", title: e.title, sub: new Date(e.start).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: e.allDay ? undefined : "2-digit", minute: e.allDay ? undefined : "2-digit" }), icon: "i:CalendarDays", run: () => openW("today") })
    return out
  }, [chats])

  const results = useMemo(() => {
    const n = norm(q.trim())
    if (!n) return items.filter((i) => i.group === "Abrir" || i.group === "Ações").slice(0, 30)
    const toks = n.split(/\s+/)
    const scored: { i: Item; s: number }[] = []
    for (const i of items) {
      const t = norm(i.title)
      const hay = `${t} ${norm(i.sub ?? "")} ${norm(i.group)} ${i.words ?? ""}`
      if (!toks.every((k) => hay.includes(k))) continue
      scored.push({ i, s: (t.startsWith(toks[0]) ? 0 : t.includes(toks[0]) ? 1 : 2) + (i.group === "Abrir" ? -0.5 : 0) })
    }
    return scored.sort((a, b) => a.s - b.s).slice(0, 60).map((x) => x.i)
  }, [q, items])

  useEffect(() => setSel(0), [q])
  useEffect(() => { listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }) }, [sel])
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); results[sel]?.run() }
  }

  let lastGroup = ""
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Search size={18} className="text-fg-muted" />
        <input autoFocus className="flex-1 bg-transparent text-lg outline-none placeholder:text-fg-muted" placeholder="Buscar ou fazer qualquer coisa…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} />
        <kbd className="rounded-md border border-line px-1.5 text-[10px] text-fg-muted">Esc</kbd>
      </div>
      <div ref={listRef} className="max-h-[56vh] overflow-auto p-2">
        {results.length === 0 && <div className="py-8 text-center text-sm text-fg-muted">Nada encontrado para &quot;{q}&quot;.</div>}
        {results.map((r, i) => {
          const head = r.group !== lastGroup
          lastGroup = r.group
          return (
            <div key={r.id}>
              {head && <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{r.group}</div>}
              <button data-i={i} className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", i === sel && "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]")} onMouseEnter={() => setSel(i)} onClick={r.run}>
                <span className="flex w-6 justify-center text-fg-muted">{typeof r.icon === "string" ? <Glyph v={r.icon} size={17} /> : r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.title}</span>
                  {r.sub && <span className="block truncate text-xs text-fg-muted">{r.sub}</span>}
                </span>
                {i === sel && <CornerDownLeft size={14} className="text-fg-muted" />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
