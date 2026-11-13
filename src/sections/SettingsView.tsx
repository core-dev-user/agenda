import { useScreenList } from "@/lib/screens"
import { useUiMode } from "@/lib/uimode"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { SettingsSection } from "@/components/ui/SettingsSection"
import { SETTINGS_GROUPS, SETTINGS_TABS, searchSettings, type SettingsTabId } from "./settingsIndex"
import { motion } from "framer-motion"
import { Download, Upload, RotateCcw, Ban, Bell, Boxes, Circle, CircleDashed, CircleDot, Crosshair, Droplets, Flame, Flashlight, Flower2, Gem, Grid3x3, HardDrive, Heart, Image, LayoutGrid, LayoutTemplate, Leaf, MonitorSmartphone, MousePointer, MousePointer2, Navigation, Orbit, Palette, PanelBottom, PartyPopper, PawPrint, Plug, Rainbow, Scissors, Snowflake, Sparkles, Spline, Star, Type, Wand2, WandSparkles, Waves, type LucideIcon, Search } from "lucide-react"
import { useStore, THEME_PRESETS, DEFAULT_SETTINGS, WIDGET_SIZES } from "@/lib/store"
import { buildBackup, parseBackup } from "@/lib/backup"
import { bridge, isDesktop, mediaUrl } from "@/lib/bridge"
import { FONTS } from "@/lib/fonts"
import { FontPicker } from "@/components/FontPicker"
import type { CursorEffect, CursorStyle, LockClock as LockClockT, Settings, ThemeId } from "@/lib/types"
import { LOCK_DEFAULT } from "@/components/LockClock"
import { cn } from "@/lib/utils"
import { Card, ColorPicker, Segmented, Slider, Switch, ThemedButton } from "@/components/ui/controls"
import { LiquidButton, MetalButton } from "@/components/ui/liquid-glass-button"
import { GRADIENTS } from "@/components/Wallpaper"
import { MediaPicker } from "@/components/MediaPicker"
import { LivingStudio } from "@/components/LivingStudio"
import { FEEDS } from "@/widgets/News"
import { AppIcon, ICON_STYLES, sectionColor } from "@/components/AppIcon"
import { IconPackSettings } from "@/components/IconPackSettings"
import { SECTIONS } from "@/components/sections-meta"
import { TemplatesTab } from "./Templates"
import { peekShareLink } from "@/lib/templateShare"
import { PetTab } from "@/pet/PetSettings"
import { UpdatesSection } from "@/components/Updates"
import { IntegrationsTab, ModeTab, RoutineTab, SystemExtra } from "./SettingsExtra"
import { PacksTab } from "@/shell/PackSettings"
import { iconSupport } from "@/lib/iconSupport"

const TABS = [
  { id: "mode", label: "Modo de uso", e: MonitorSmartphone, c: "#6ea8ff" },
  { id: "templates", label: "Templates", e: LayoutTemplate, c: "#a78bfa" },
  { id: "packs", label: "Pacotes", e: Boxes, c: "#e6a3b4" },
  { id: "look", label: "Aparência", e: Palette, c: "#329FFD" },
  { id: "fonts", label: "Fontes", e: Type, c: "#8f9bff" },
  { id: "cursor", label: "Cursor", e: MousePointer2, c: "#7cc8ff" },
  { id: "taskbar", label: "Barra e ícones", e: PanelBottom, c: "#9aa3b5" },
  { id: "wallpaper", label: "Papel de parede", e: Image, c: "#3ccfcf" },
  { id: "fx", label: "Sakura e efeitos", e: Flower2, c: "#70C6FF" },
  { id: "widgets", label: "Widgets", e: LayoutGrid, c: "#ffb36e" },
  { id: "pet", label: "Bichinho", e: PawPrint, c: "#f2a65a" },
  { id: "routine", label: "Rotina e avisos", e: Bell, c: "#ff6b6b" },
  { id: "integrations", label: "Integrações", e: Plug, c: "#5ee3a1" },
  { id: "system", label: "Sistema", e: HardDrive, c: "#8a8a9a" },
] as const

const THEMES: { id: ThemeId; label: string; desc: string }[] = [
  { id: "glass", label: "Vidro líquido", desc: "Translúcido estilo iPhone" },
  { id: "metal", label: "Metal", desc: "Alumínio escovado, botões metálicos" },
  { id: "retro", label: "Retrô 95", desc: "Computador antigo, bordas chanfradas" },
  { id: "terminal", label: "Terminal CRT", desc: "Fósforo verde, linhas de varredura" },
  { id: "minimal", label: "Minimal", desc: "Limpo e discreto" },
]

const TAB_ICON = Object.fromEntries(TABS.map((t) => [t.id, t.e])) as Record<SettingsTabId, LucideIcon>

/**
 * Navegação das Configurações: categorias agrupadas, ícones de linha (a cor fica só no item ativo)
 * e busca por aba, seção ou palavra-chave. Setas sobem/descem; Ctrl+F foca a busca; Enter abre o resultado.
 */
function SettingsNav({ tab, onPick }: { tab: SettingsTabId; onPick: (id: SettingsTabId, section?: string) => void }) {
  const [q, setQ] = useState("")
  const [sel, setSel] = useState(0)
  const hits = useMemo(() => searchSettings(q), [q])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLElement>(null)
  useEffect(() => { setSel(0) }, [q])
  const open = (i: number) => { const h = hits[i]; if (!h) return; onPick(h.tab, h.section); setQ("") }
  const searchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(hits.length - 1, v + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(0, v - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); open(sel) }
    else if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ("") }
  }
  // setas na lista: anda entre as categorias
  const navKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const i = SETTINGS_TABS.findIndex((t) => t.id === tab)
    const next = SETTINGS_TABS[Math.max(0, Math.min(SETTINGS_TABS.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]
    if (!next || next.id === tab) return
    e.preventDefault()
    onPick(next.id)
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus())
  }
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line" data-settings>
      <div className="p-3 pb-1.5">
        <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px] transition-colors focus-within:border-[var(--accent)]">
          <Search size={14} className="shrink-0 text-fg-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={searchKey} placeholder="Buscar ajuste" aria-label="Buscar nas configurações"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-muted" spellCheck={false} />
          {!q && <kbd className="shrink-0 rounded border border-line px-1 text-[10px] text-fg-muted">Ctrl F</kbd>}
        </label>
      </div>
      <nav ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Categorias das configurações" onKeyDown={navKey}>
        {q ? (
          hits.length ? hits.map((h, i) => (
            <button key={h.tab + (h.section ?? "")} type="button" onMouseEnter={() => setSel(i)} onClick={() => open(i)}
              className={cn("block w-full rounded-lg px-2.5 py-1.5 text-left", i === sel && "bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]")}>
              <span className="block truncate text-[13px]">{h.section ?? h.tabLabel}</span>
              {h.section && <span className="block truncate text-[11px] text-fg-muted">{h.tabLabel}</span>}
            </button>
          )) : <div className="px-2.5 py-4 text-[12.5px] text-fg-muted">Nenhum ajuste com esse nome.</div>
        ) : SETTINGS_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[.08em] text-fg-muted">{g.label}</div>
            {g.tabs.map((t) => {
              const Icon = TAB_ICON[t.id]
              const on = tab === t.id
              return (
                <button key={t.id} type="button" data-tab={t.id} aria-current={on ? "page" : undefined} onClick={() => onPick(t.id)}
                  className={cn("relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors", on ? "text-fg" : "text-fg-muted hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] hover:text-fg")}>
                  {on && <motion.span layoutId="settab" className="absolute inset-0 rounded-lg bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                  {on && <motion.span layoutId="settab-bar" className="absolute bottom-[7px] left-0 top-[7px] w-[3px] rounded-full bg-[var(--accent)]" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                  <Icon size={15} strokeWidth={1.75} className="relative shrink-0" />
                  <span className="relative truncate">{t.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export default function SettingsView() {
  const [tab, setTab] = useState<SettingsTabId>(() => peekShareLink() ? "templates" : "look")
  useEffect(() => {
    const selectTemplates = () => setTab("templates")
    window.addEventListener("widgy:template-link", selectTemplates)
    return () => window.removeEventListener("widgy:template-link", selectTemplates)
  }, [])
  const scroller = useRef<HTMLDivElement>(null)
  const pick = (id: SettingsTabId, section?: string) => {
    setTab(id)
    // depois de a aba desenhar: rola até a seção encontrada na busca e a destaca por um instante
    setTimeout(() => {
      const box = scroller.current
      if (!box) return
      if (!section) { box.scrollTo({ top: 0 }); return }
      const el = [...box.querySelectorAll<HTMLElement>("[data-section]")].find((x) => x.dataset.section === section)
      if (!el) return
      el.scrollIntoView({ block: "start", behavior: "smooth" })
      el.classList.add("settings-found")
      setTimeout(() => el.classList.remove("settings-found"), 1600)
    }, 60)
  }
  // Ctrl+F dentro das Configurações foca a busca
  const findKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return
    const box = e.currentTarget.querySelector<HTMLInputElement>('input[aria-label="Buscar nas configurações"]')
    if (!box) return
    e.preventDefault()
    box.focus(); box.select()
  }
  return (
    <div className="flex h-full" onKeyDown={findKey}>
      <SettingsNav tab={tab} onPick={pick} />
      <div ref={scroller} className="min-w-0 flex-1 overflow-auto">
        {/* coluna alinhada à esquerda, largura de leitura: sem conteúdo "flutuando" no meio da janela */}
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14, ease: "easeOut" }} className="max-w-[820px] space-y-8 px-8 py-6">
          <h2 className="text-[19px] font-semibold tracking-[-.01em]">{SETTINGS_TABS.find((t) => t.id === tab)?.label}</h2>
          {tab === "mode" && <ModeTab />}
          {tab === "templates" && <TemplatesTab />}
          {tab === "packs" && <PacksTab />}
          {tab === "look" && <Look />}
          {tab === "fonts" && <Fonts />}
          {tab === "cursor" && <Cursor />}
          {tab === "taskbar" && <TaskbarTab />}
          {tab === "wallpaper" && <WallpaperTab />}
          {tab === "fx" && <Fx />}
          {tab === "widgets" && <WidgetsTab />}
          {tab === "pet" && <PetTab />}
          {tab === "routine" && <RoutineTab />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "system" && <System />}
        </motion.div>
      </div>
    </div>
  )
}

function useS() {
  const s = useStore((x) => x.settings)
  const set = useStore((x) => x.setSettings)
  return [s, set] as const
}

function Section({ title, children, desc }: { title: string; desc?: string; children: ReactNode }) {
  return <SettingsSection title={title} desc={desc}>{children}</SettingsSection>
}

/* ------------------------- Aparência ------------------------- */
function Look() {
  const [s, set] = useS()
  const apply = useStore((x) => x.applyTheme)
  return (
    <>
      <Section title="Tema" desc="Escolher um tema aplica fontes, cursor e formas combinando. Depois você pode mudar tudo individualmente.">
        <div className="grid grid-cols-5 gap-3">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => apply(t.id)} className={cn("group rounded-2xl p-1.5 text-left transition", s.theme === t.id ? "ring-2 ring-brand" : "hover:ring-1 hover:ring-line")}>
              <ThemePreview id={t.id} accent={s.accent} />
              <div className="mt-2 px-1 text-sm font-medium">{t.label}</div>
              <div className="px-1 text-[11px] leading-tight text-fg-muted">{t.desc}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Cores">
        {/* o Terminal é sempre escuro: o ajuste fica desativado em vez de parecer que faz algo */}
        <div className={cn(s.theme === "terminal" && "pointer-events-none opacity-45")} aria-disabled={s.theme === "terminal"} {...(s.theme === "terminal" ? INERT : {})}>
          <Switch label="Modo escuro" checked={s.theme === "terminal" ? true : s.dark} onChange={(v) => set({ dark: v })} />
        </div>
        {s.theme === "terminal" && <div className="text-xs text-fg-muted">O tema Terminal é sempre escuro.</div>}
        <div className="pt-2 text-sm">Cor de destaque</div>
        <ColorPicker value={s.accent} onChange={(v) => set({ accent: v })} />
      </Section>
      <Section title="Forma e profundidade 3D">
        <Slider label="Arredondamento" value={s.radius} min={0} max={36} onChange={(v) => set({ radius: v })} format={(v) => v + "px"} />
        <Slider label="Desfoque do vidro" value={s.blur} min={0} max={60} onChange={(v) => set({ blur: v })} format={(v) => v + "px"} />
        <Slider label="Opacidade das superfícies" value={s.surfaceOpacity} min={0} max={1} step={0.01} onChange={(v) => set({ surfaceOpacity: v })} format={(v) => Math.round(v * 100) + "%"} />
        <Slider label="Inclinação 3D ao passar o mouse" value={s.tilt} min={0} max={25} onChange={(v) => set({ tilt: v })} format={(v) => (v ? v + "°" : "desligado")} />
        <Switch label="Animações" checked={s.animations} onChange={(v) => set({ animations: v })} />
      </Section>
      <Section title="Prévia dos botões">
        <div className="flex flex-wrap items-center gap-4 py-2">
          <LiquidButton size="lg" className="rounded-full text-fg">Vidro líquido</LiquidButton>
          <MetalButton>Metal</MetalButton>
          <MetalButton variant="gold">Ouro</MetalButton>
          <MetalButton variant="bronze">Bronze</MetalButton>
          <ThemedButton>Botão do tema</ThemedButton>
          <button className="btn">Secundário</button>
        </div>
      </Section>
    </>
  )
}

function ThemePreview({ id, accent }: { id: ThemeId; accent: string }) {
  const bg = { glass: GRADIENTS.dusk.css, metal: GRADIENTS.mono.css, retro: "#008080", terminal: GRADIENTS.crt.css, minimal: "linear-gradient(160deg,#1b1b1f,#2a2a30)" }[id]
  const panel: Record<ThemeId, React.CSSProperties> = {
    glass: { background: "rgb(255 255 255 / .18)", border: "1px solid rgb(255 255 255 / .35)", borderRadius: 10, backdropFilter: "blur(6px)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .5)" },
    metal: { background: "linear-gradient(#5a5e66,#2a2c31)", border: "1px solid #000", borderRadius: 5, boxShadow: "inset 0 1px 0 rgb(255 255 255 / .3)" },
    retro: { background: "#c0c0c0", boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080" },
    terminal: { background: "rgb(0 10 4 / .9)", border: `1px solid ${accent}`, boxShadow: `0 0 10px ${accent}66` },
    minimal: { background: "rgb(30 28 34 / .8)", border: "1px solid rgb(255 255 255 / .1)", borderRadius: 8 },
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl" style={{ background: bg }}>
      <div className="absolute inset-x-3 top-3 bottom-6" style={panel[id]}>
        {id === "retro" && <div className="m-[3px] h-2.5" style={{ background: "linear-gradient(90deg,#000080,#1084d0)" }} />}
        <div className="m-2 h-1.5 w-1/2 rounded-full" style={{ background: id === "terminal" ? accent : id === "retro" ? "#000" : "rgb(255 255 255 / .6)" }} />
        <div className="mx-2 h-1.5 w-1/3 rounded-full" style={{ background: accent, opacity: 0.9 }} />
      </div>
      <div className="absolute bottom-1.5 left-1/2 h-3 w-1/2 -translate-x-1/2" style={{ ...panel[id], borderRadius: id === "glass" ? 99 : panel[id].borderRadius }} />
    </div>
  )
}

/* ------------------------- Fontes ------------------------- */
function FontRow({ k, label, sample }: { k: "uiFont" | "numFont" | "displayFont"; label: string; sample: string }) {
  const [s, set] = useS()
  return (
    <Section title={label}>
      <FontPicker label="Escolher fonte" value={s[k]} onChange={(id) => set({ [k]: id } as Partial<Settings>)} sample={sample} />
    </Section>
  )
}

function Fonts() {
  const [s, set] = useS()
  return (
    <>
      <div className="text-sm text-fg-muted">
        {FONTS.length} fontes para personalizar sua área de trabalho. As fontes originais funcionam offline;
        as extras são carregadas sob demanda quando há internet.
      </div>
      <Slider label="Tamanho geral do texto" value={s.fontScale} min={0.8} max={1.3} step={0.05} onChange={(v) => set({ fontScale: v })} format={(v) => Math.round(v * 100) + "%"} />
      <FontRow k="uiFont" label="Letras (interface)" sample="Widgy · Meu dia" />
      <FontRow k="numFont" label="Números (relógios, valores)" sample="12:45 R$ 980" />
      <FontRow k="displayFont" label="Títulos" sample="Hábitos e lembretes" />
    </>
  )
}

/* ------------------------- Cursor ------------------------- */
const CURSORS: { id: CursorStyle; label: string; e: LucideIcon }[] = [
  { id: "system", label: "Padrão do Windows", e: MousePointer },
  { id: "dot", label: "Ponto", e: CircleDot },
  { id: "ring", label: "Anel elástico", e: Circle },
  { id: "sakura", label: "Flor de sakura", e: Flower2 },
  { id: "pixel", label: "Seta pixelada", e: MousePointer2 },
  { id: "crosshair", label: "Mira", e: Crosshair },
  { id: "arrow", label: "Seta de vidro", e: Navigation },
  { id: "heart", label: "Coração", e: Heart },
  { id: "star", label: "Estrela", e: Star },
  { id: "neon", label: "Anel neon", e: CircleDashed },
  { id: "diamond", label: "Diamante", e: Gem },
  { id: "bubble", label: "Bolha líquida", e: Droplets },
  { id: "paw", label: "Patinha", e: PawPrint },
]
const EFFECTS: { id: CursorEffect; label: string; e: LucideIcon }[] = [
  { id: "none", label: "Nenhum", e: Ban },
  { id: "sakura", label: "Pétalas caindo", e: Flower2 },
  { id: "trail", label: "Rastro de luz", e: Spline },
  { id: "sparkle", label: "Brilhos", e: Sparkles },
  { id: "glow", label: "Holofote", e: Flashlight },
  { id: "ripple", label: "Ondas no clique", e: Waves },
  { id: "pixels", label: "Pixels retrô", e: Grid3x3 },
  { id: "hearts", label: "Corações", e: Heart },
  { id: "stars", label: "Estrelas", e: Star },
  { id: "bubbles", label: "Bolhas", e: Droplets },
  { id: "confetti", label: "Confete", e: PartyPopper },
  { id: "fire", label: "Fogo", e: Flame },
  { id: "snow", label: "Neve", e: Snowflake },
  { id: "rainbow", label: "Rastro arco-íris", e: Rainbow },
  { id: "comet", label: "Cometa", e: Orbit },
  { id: "leaves", label: "Folhas de outono", e: Leaf },
  { id: "magic", label: "Pó mágico", e: WandSparkles },
]
const CLICKS = [
  { id: "auto", label: "Combina com o efeito" }, { id: "ripple", label: "Onda" }, { id: "burst", label: "Explosão de brilho" },
  { id: "hearts", label: "Corações" }, { id: "confetti", label: "Confete" }, { id: "shock", label: "Onda de choque" }, { id: "none", label: "Nenhum" },
] as const
function Cursor() {
  const [s, set] = useS()
  return (
    <>
      <Section title="Formato do cursor">
        <div className="grid grid-cols-3 gap-2">
          {CURSORS.map((c) => (
            <button key={c.id} onClick={() => set({ cursorStyle: c.id })} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left text-sm", s.cursorStyle === c.id ? "border-brand bg-brand/15" : "border-line")}>
              <c.e size={20} strokeWidth={1.7} className="shrink-0 text-fg-muted" />{c.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Efeito ao mover" desc="Mova o mouse aqui para testar.">
        <div className="grid grid-cols-4 gap-2">
          {EFFECTS.map((c) => (
            <button key={c.id} onClick={() => set({ cursorEffect: c.id })} className={cn("flex flex-col items-center gap-1 rounded-xl border p-3 text-sm", s.cursorEffect === c.id ? "border-brand bg-brand/15" : "border-line")}>
              <c.e size={20} strokeWidth={1.7} className="shrink-0 text-fg-muted" />{c.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Cor e tamanho">
        <ColorPicker value={s.cursorColor} onChange={(v) => set({ cursorColor: v })} swatches={["#ffc4dc", "#ff8fb8", "#ffffff", "#7cc8ff", "#8cf0b0", "#ffd36e", "#c49bff", "#33ff77"]} />
        <Slider label="Tamanho" value={s.cursorSize} min={0.6} max={2} step={0.1} onChange={(v) => set({ cursorSize: v })} format={(v) => Math.round(v * 100) + "%"} />
        <Slider label="Intensidade do efeito" value={s.cursorDensity ?? 1} min={0.3} max={2.5} step={0.1} onChange={(v) => set({ cursorDensity: v })} format={(v) => Math.round(v * 100) + "%"} />
      </Section>
      <Section title="Efeito ao clicar">
        <div className="flex flex-wrap gap-2">
          {CLICKS.map((c) => (
            <button key={c.id} onClick={() => set({ clickEffect: c.id })} className={cn("rounded-full border px-3 py-1.5 text-sm", (s.clickEffect ?? "auto") === c.id ? "border-brand bg-brand/15" : "border-line")}>{c.label}</button>
          ))}
        </div>
      </Section>
    </>
  )
}

/* ------------------------- Barra de tarefas ------------------------- */
/** tira o controle também do teclado e dos leitores de tela (o React 18 só aceita `inert` como texto) */
const INERT = { inert: "" } as unknown as Record<string, never>

function IconsSection() {
  const [s, set] = useS()
  const support = iconSupport({ iconStyle: s.iconStyle, theme: s.theme, iconPackStyle: s.iconPackStyle })
  return (
    <Section title="Ícones dos apps" desc="Muda o visual dos ícones na barra de tarefas, no menu Início, nas janelas e nos atalhos.">
      <IconPackSettings value={s.iconPackStyle ?? "original"} onChange={(value) => set({ iconPackStyle: value })} />
      <div className="pt-4 text-xs font-semibold text-fg-muted">Estilos originais do Widgy (usados ao escolher Originais acima)</div>
      <div className="grid grid-cols-4 gap-2">
        {ICON_STYLES.map((st) => (
          <button key={st.id} onClick={() => set({ iconStyle: st.id })} className={cn("flex flex-col items-center gap-2 rounded-xl border p-3 text-xs", s.iconStyle === st.id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
            <div className="flex gap-1.5">
              {(["habits", "music", "gallery"] as const).map((id) => (
                <AppIcon key={id} id={id} size={30} styleOverride={st.id === "auto" ? undefined : st.id} />
              ))}
            </div>
            {st.label}
          </button>
        ))}
      </div>
      {/* formato e cor só aparecem ativos quando o estilo escolhido realmente os usa (ver lib/iconSupport) */}
      <div className="flex flex-wrap items-center gap-4 pt-3">
        <div className={cn(!support.shape && "pointer-events-none opacity-45")} aria-disabled={!support.shape} {...(support.shape ? {} : INERT)}><div className="mb-1 text-sm">Formato</div>
          <Segmented value={s.iconShape} onChange={(v) => set({ iconShape: v })} options={[{ value: "squircle", label: "Arredondado" }, { value: "circle", label: "Círculo" }, { value: "square", label: "Quadrado" }]} />
        </div>
      </div>
      {support.why && <div className="pt-2 text-xs text-fg-muted">{support.why}</div>}
      <div className="pt-3 text-sm">Cada app: {support.color ? "cor e " : ""}se aparece na barra de tarefas</div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {SECTIONS.map((sec) => (
          <div key={sec.id} className={cn("flex items-center gap-3 rounded-xl border border-line p-2 transition-opacity", s.taskbar.hide?.includes(sec.id) && "opacity-60")}>
            <AppIcon id={sec.id} size={30} />
            <span className="flex-1 text-sm">{sec.label}</span>
            <MiniSwitch
              on={!s.taskbar.hide?.includes(sec.id)}
              title={s.taskbar.hide?.includes(sec.id) ? "Fora da barra de tarefas (clique para mostrar)" : "Na barra de tarefas (clique para tirar)"}
              onChange={(v) => { const h = new Set(s.taskbar.hide ?? []); if (v) h.delete(sec.id); else h.add(sec.id); set({ taskbar: { ...s.taskbar, hide: [...h] } }) }}
            />
            {support.color && (
              <label className="clickable relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line" style={{ background: sectionColor(s, sec.id) }} title="Escolher cor">
                <input type="color" className="absolute inset-0 opacity-0" value={sectionColor(s, sec.id)} onChange={(e) => set({ iconColors: { ...s.iconColors, [sec.id]: e.target.value } })} />
              </label>
            )}
            {support.color && s.iconColors?.[sec.id] && (
              <button className="text-xs text-fg-muted hover:text-fg" onClick={() => { const c = { ...s.iconColors }; delete c[sec.id]; set({ iconColors: c }) }}>padrão</button>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function TaskbarTab() {
  const [s, set] = useS()
  const tb = s.taskbar
  const p = (patch: Partial<Settings["taskbar"]>) => set({ taskbar: { ...tb, ...patch } })
  // a barra do Widgy está no lugar da do Windows? (só aí "esconder com programa maximizado" tem efeito)
  const pcBar = useUiMode((x) => x.mainBar)
  return (
    <>
    <PcBarChoice />
    <Section title="Barra de tarefas">
      <div className="flex flex-wrap gap-4 py-2">
        <div><div className="mb-1 text-sm">Posição</div><Segmented value={tb.position} onChange={(v) => p({ position: v })} options={[{ value: "bottom", label: "Embaixo" }, { value: "top", label: "Em cima" }, { value: "left", label: "Esquerda" }, { value: "right", label: "Direita" }]} /></div>
        <div><div className="mb-1 text-sm">Estilo</div><Segmented value={tb.style} onChange={(v) => p({ style: v })} options={[{ value: "dock", label: "Dock" }, { value: "floating", label: "Pílula" }, { value: "bar", label: "Barra Windows" }]} /></div>
      </div>
      <div className="py-2">
        <div className="mb-1 text-sm">Visibilidade</div>
        <Segmented
          value={tb.autoHide ? "hide" : "show"}
          onChange={(v) => p({ autoHide: v === "hide" })}
          options={[{ value: "show", label: "Sempre visível" }, { value: "hide", label: "Escondida (aparece ao passar o mouse na borda)" }]}
        />
        {tb.autoHide && <div className="mt-1.5 text-xs text-fg-muted">Leve o mouse até a borda da tela (onde está a linha brilhante) para a barra subir. Ela se esconde sozinha quando o mouse sai.</div>}
        {!tb.autoHide && pcBar && <Switch label="Esconder a barra do PC quando um programa estiver maximizado (ele usa a tela toda; a barra volta ao encostar o mouse na borda)" checked={tb.smartHide !== false} onChange={(v) => p({ smartHide: v })} />}
      </div>
      <Slider label="Tamanho dos ícones" value={tb.size} min={36} max={84} onChange={(v) => p({ size: v })} format={(v) => v + "px"} />
      <Switch label="Ampliar ícones ao passar o mouse (efeito Mac)" checked={tb.magnify} onChange={(v) => p({ magnify: v })} />
      <Switch label="Mostrar o nome dos apps na barra" checked={tb.showLabels} onChange={(v) => p({ showLabels: v })} />
    </Section>
    <BarItemsSection />
    <IconsSection />
    </>
  )
}

/** qual barra o PC usa: a do próprio Windows ou a do Agenda (só no modo área de trabalho) */
function PcBarChoice() {
  const mode = useUiMode((x) => x.mode)
  const on = useUiMode((x) => x.mainBar)
  if (mode !== "desktop") return null
  return (
    <Section title="Barra de tarefas do PC" desc="A barra de baixo do computador, em todos os monitores.">
      <Segmented
        value={on ? "agenda" : "windows"}
        onChange={async (v) => { bridge.store.flush?.(); await bridge.bar.set({ on: v === "agenda" }); location.reload() }}
        options={[{ value: "windows", label: "Do Windows (a normal)" }, { value: "agenda", label: "Do Widgy (personalizada)" }]}
      />
      <div className="mt-1.5 text-xs text-fg-muted">
        {on
          ? "A barra do Widgy está no lugar da do Windows, com o jeito escolhido aqui embaixo. Ela tem o botão do Windows para abrir o Iniciar normal."
          : "O Windows continua com a barra dele. As opções aqui embaixo valem para a barra de dentro do Widgy."}
      </div>
    </Section>
  )
}

/** interruptor pequeno (cabe na linha de cada app) */
function MiniSwitch({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={title}
      onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-[color-mix(in_srgb,var(--fg)_18%,transparent)]")}
    >
      <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  )
}

/** o que aparece na barra: abas do Agenda, botões e programas do Windows — cada um liga/desliga */
const BAR_BUTTONS: { id: string; label: string; pcOnly?: boolean }[] = [
  { id: "winstart", label: "Botão do Windows (abre o Iniciar do Windows)", pcOnly: true },
  { id: "widgets", label: "Adicionar widget" },
  { id: "lock", label: "Travar widgets" },
  { id: "hibernate", label: "Hibernar widgets (todos em descanso, para jogar)" },
  { id: "bell", label: "Avisos" },
  { id: "clock", label: "Relógio" },
  { id: "tray", label: "Ícones do Windows (perto do relógio)", pcOnly: true },
  { id: "corner", label: "Botão na ponta da barra que mostra a área de trabalho", pcOnly: true },
]
function BarItemsSection() {
  const [s, set] = useS()
  const tb = s.taskbar
  const hide = new Set(tb.hide ?? [])
  const pcBar = useUiMode((x) => x.mainBar)
  const toggle = (id: string, on: boolean) => {
    const h = new Set(hide)
    if (on) h.delete(id); else h.add(id)
    set({ taskbar: { ...tb, hide: [...h] } })
  }
  const pins = s.pcPins ?? []
  return (
    <Section title="O que aparece na barra" desc="Ligue ou desligue cada item. Vale para a barra do Widgy e, com ela no lugar da barra do Windows, para a barra do PC.">
      <div className="mb-1 text-xs text-fg-muted">As abas do Widgy ligam e desligam mais abaixo, em Ícones dos apps.</div>
      <div className="mt-2 mb-1 text-sm">Botões</div>
      {BAR_BUTTONS.filter((b) => !b.pcOnly || pcBar).map((b) => (
        <Switch key={b.id} label={b.label} checked={!hide.has(b.id)} onChange={(v) => toggle(b.id, v)} />
      ))}
      {pcBar && (
        <>
          <div className="mt-4 mb-1 text-sm">Programas do Windows</div>
          <Switch label="Mostrar os programas abertos" checked={tb.pcOpen !== false} onChange={(v) => set({ taskbar: { ...tb, pcOpen: v } })} />
          <div className="mt-1 text-xs text-fg-muted">Fixados na barra (para fixar outro, clique com o botão direito nele no Iniciar ou na barra):</div>
          {!pins.length && <div className="py-1 text-sm text-fg-muted">Nenhum programa fixado.</div>}
          <div className="mt-1 flex flex-col gap-1">
            {pins.map((a) => (
              <div key={a.path} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ pcPins: pins.filter((x) => x.path !== a.path) })}>Tirar da barra</button>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

/* ------------------------- Papel de parede ------------------------- */

const hasEngineWallpaper = (settings: Settings) =>
  settings.wallpaper.type === "engine" ||
  Object.values(settings.wallpaperBy ?? {}).some((item) => item.type === "engine")

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** papel de parede de vídeo: toca o vídeo inteiro, do começo ao fim, e recomeça */
function VideoWallPanel({ file, onPick }: { file?: string | null; onPick: (file: string) => void }) {
  const [info, setInfo] = useState<{ dur: number; w: number; h: number } | null>(null)
  const [bad, setBad] = useState(false)
  useEffect(() => { setInfo(null); setBad(false) }, [file])
  return (
    <div className="flex items-center gap-4">
      {file
        ? <video
            key={file}
            src={mediaUrl(file)}
            autoPlay loop muted playsInline preload="metadata"
            className="h-28 w-48 rounded-xl bg-black object-cover"
            onLoadedMetadata={(e) => { const v = e.currentTarget; setInfo({ dur: v.duration, w: v.videoWidth, h: v.videoHeight }) }}
            onError={() => setBad(true)}
          />
        : <div className="flex h-28 w-48 items-center justify-center rounded-xl border border-dashed border-line text-sm text-fg-muted">Nenhum</div>}
      <div className="flex flex-col gap-2">
        <ThemedButton size="sm" onClick={async () => { const r = await bridge.media.wallAnim("video"); if (r) onPick(r.file) }}>Escolher vídeo</ThemedButton>
        {info && Number.isFinite(info.dur) && <span className="font-num text-xs">{fmtDur(info.dur)} · {info.w}×{info.h}</span>}
        {bad && <span className="max-w-[260px] text-xs text-[var(--danger,#f87171)]">Esse vídeo não abre aqui (formato não suportado, como HEVC/H.265). Converta para MP4 H.264 ou WebM.</span>}
        <span className="max-w-[260px] text-xs text-fg-muted">MP4, WebM, MOV ou MKV. Toca o vídeo inteiro sem som e recomeça no fim. Pausa durante jogos para não pesar.</span>
      </div>
    </div>
  )
}

/** O Wallpaper Engine renderiza no Windows; a janela transparente do Widgy só sobrepõe widgets. */
function WallpaperEnginePanel() {
  const mode = useUiMode((x) => x.mode)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof bridge.wallpaperEngine.status>> | null>(null)
  const [error, setError] = useState("")
  const [opening, setOpening] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [resumeMessage, setResumeMessage] = useState("")

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void bridge.wallpaperEngine.status().then((state) => {
        if (alive) setStatus(state)
      }).catch(() => { if (alive) setStatus(null) })
    }
    refresh()
    // Cada consulta dispara processos Windows; evitar uma consulta a cada 10 s.
    const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center gap-2">
        <span className={cn("size-2.5 rounded-full", status?.running ? "bg-[#55d99e]" : "bg-[#f0ad63]")} />
        <span className="text-sm font-semibold">
          {status?.running ? "Wallpaper Engine em execução" : status?.installed ? "Wallpaper Engine não está aberto" : "Wallpaper Engine não detectado"}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">
        O Widgy mostra o wallpaper animado que o Wallpaper Engine já está desenhando no Windows.
        Se você trocar o wallpaper lá, o fundo muda automaticamente aqui, sem copiar vídeos nem rodar uma segunda reprodução.
      </p>
      {status?.wallpaper && <p className="text-xs text-fg-muted">Papel de parede ativo (monitor principal): <span className="font-medium text-fg">{status.wallpaper}</span></p>}
      {mode !== "desktop" ? (
        <div className="space-y-2">
          <div className="text-xs text-[#f2b978]">É necessário usar o modo Área de trabalho do Widgy. No modo Aplicativo ou Tela própria o Wallpaper Engine não pode aparecer atrás da janela.</div>
          {isDesktop && <ThemedButton size="sm" onClick={() => { void (async () => { const saved = await bridge.store.drain?.(); if (saved !== false) await bridge.mode.set("desktop") })() }}>Ativar modo Área de trabalho</ThemedButton>}
        </div>
      ) : (
        <div className="text-xs text-fg-muted">
          Modo Área de trabalho ativo. A primeira ativação ou desativação desta opção reinicia o Widgy para configurar a transparência nativa.
        </div>
      )}
      {isDesktop && (
        <div className="flex items-center gap-2">
          <ThemedButton size="sm" disabled={opening} onClick={async () => {
            setOpening(true); setError("")
            try {
              const ok = await bridge.wallpaperEngine.open()
              if (!ok) setError("Não foi possível abrir o Wallpaper Engine pelo Steam.")
              else window.setTimeout(() => { void bridge.wallpaperEngine.status().then(setStatus).catch(() => {}) }, 2500)
            } catch { setError("Falha ao iniciar o Wallpaper Engine.") }
            setOpening(false)
          }}>Abrir no Steam</ThemedButton>
          {mode === "desktop" && status?.running && (
            <button className="btn text-xs" disabled={resuming} onClick={async () => {
              setResuming(true); setResumeMessage("")
              try {
                const ok = await bridge.wallpaperEngine.resume()
                setResumeMessage(ok ? "Comando de reprodução enviado ao Wallpaper Engine." : "Não foi possível retomar. Confira se o Widgy está com o fundo Wallpaper Engine ativo.")
              } catch { setResumeMessage("Falha ao enviar comando ao Wallpaper Engine.") }
              setResuming(false)
            }}>Retomar animação</button>
          )}
          <button className="btn text-xs" onClick={() => { void bridge.wallpaperEngine.status().then(setStatus).catch(() => setStatus(null)) }}>Atualizar status</button>
        </div>
      )}
      {resumeMessage && <div className="text-xs text-fg-muted">{resumeMessage}</div>}
      {mode === "desktop" && (
        <div className="text-xs leading-relaxed text-fg-muted">
          Se a animação parar ao abrir o Widgy, no Wallpaper Engine vá a <strong>Configurações → Desempenho → Regras de aplicativos</strong>
          e adicione <strong>Widgy.exe</strong> com reprodução <strong>Continuar</strong>.
          O Wallpaper Engine pode pausar wallpapers quando detecta uma janela sobre a área de trabalho.
          Prefira essa regra específica a desativar globalmente as pausas durante jogos.
        </div>
      )}
      {error && <div className="text-xs text-[#ff8f8f]">{error}</div>}
      <div className="text-[11px] leading-relaxed text-fg-muted">
        Não precisa exportar seus wallpapers do Workshop. O Wallpaper Engine deve continuar aberto, e a interação direta com o fundo depende do Windows e do próprio Wallpaper Engine.
      </div>
    </div>
  )
}

function WallpaperTab() {
  const [s, set] = useS()
  const media = useStore((x) => x.media)
  // com dois ou mais monitores: escolher qual está editando (cada um pode ter o seu)
  const screens = useScreenList()
  const multi = screens.length > 1 && screens[0].id !== 0
  const [target, setTarget] = useState<number | null>(null)
  const by = s.wallpaperBy ?? {}
  const own = target != null ? by[String(target)] : undefined
  const wp = own ? { ...s.wallpaper, ...own } : s.wallpaper
  const applyWallpaper = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch }
    const needsRestart = hasEngineWallpaper(s) !== hasEngineWallpaper(next) && useUiMode.getState().mode === "desktop" && isDesktop
    set(patch)
    // Persistence is sent to Electron synchronously before the native relaunch.
    if (needsRestart) {
      void (async () => {
        const saved = await bridge.store.drain?.()
        if (saved !== false) await bridge.wallpaperEngine.restart()
      })()
    }
  }
  const p = (patch: Partial<Settings["wallpaper"]>) =>
    target == null
      ? applyWallpaper({ wallpaper: { ...s.wallpaper, ...patch } })
      : applyWallpaper({ wallpaperBy: { ...by, [String(target)]: { ...(by[String(target)] ?? {}), ...patch } } })
  const sameAsAll = (id: number) => {
    const n = { ...by }; delete n[String(id)]
    applyWallpaper({ wallpaperBy: n })
  }
  const [pick, setPick] = useState(false)
  const [living, setLiving] = useState(false)
  const current = media.find((x) => x.file === wp.image) ?? null
  return (
    <>
      {multi && (
        <Section title="Monitor" desc="Cada monitor pode ter o seu papel de parede. Escolha qual está mudando.">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTarget(null)} className={cn("rounded-xl border px-3 py-2 text-sm", target == null ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>Todos os monitores</button>
            {screens.map((sc, i) => (
              <button key={sc.id} onClick={() => setTarget(sc.id)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", target === sc.id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
                Monitor {i + 1}{sc.primary ? " (principal)" : i === 0 ? " (esquerda)" : ""}
                {by[String(sc.id)] && <span className="rounded-full bg-brand/25 px-1.5 text-[10px]">próprio</span>}
              </button>
            ))}
          </div>
          {target != null && (
            <div className="mt-2 flex items-center gap-3 text-xs text-fg-muted">
              {own ? <>Este monitor tem papel de parede próprio. <button className="underline hover:text-fg" onClick={() => sameAsAll(target)}>Usar o mesmo de todos</button></> : "Mudando qualquer coisa aqui, este monitor passa a ter o papel de parede dele."}
            </div>
          )}
        </Section>
      )}
      <Section title="Fundo">
        <p className="mb-2 text-xs text-fg-muted">Os 17 fundos do pacote visual já estão incluídos offline em forma de degradês adaptáveis à resolução.</p>
        <Segmented value={wp.type} onChange={(v) => p({ type: v })} options={[{ value: "gradient", label: "Degradê" }, { value: "image", label: "Imagem" }, { value: "color", label: "Cor sólida" }, { value: "video", label: "Vídeo" }, { value: "gif", label: "GIF" }, { value: "engine", label: "Wallpaper Engine" }]} />
        <div className="pt-3">
          {wp.type === "gradient" && (
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(GRADIENTS).map(([k, g]) => (
                <button key={k} onClick={() => p({ gradient: k })} className={cn("overflow-hidden rounded-xl text-left", wp.gradient === k ? "ring-2 ring-brand" : "")}>
                  <div className="h-20" style={{ background: g.css }} />
                  <div className="px-2 py-1 text-xs">{g.label}</div>
                </button>
              ))}
            </div>
          )}
          {wp.type === "image" && (
            <div className="flex items-center gap-4">
              {wp.image ? <img src={mediaUrl(wp.image)} className="h-28 w-48 rounded-xl object-cover" /> : <div className="flex h-28 w-48 items-center justify-center rounded-xl border border-dashed border-line text-sm text-fg-muted">Nenhuma</div>}
              <div className="space-y-2">
                <ThemedButton size="sm" onClick={() => setPick(true)}>Escolher imagem</ThemedButton>
                {current && !current.animated && (
                  <button className="btn" onClick={() => setLiving(true)}><Wand2 size={14} /> Transformar em imagem viva (GIF)</button>
                )}
                <div className="text-xs text-fg-muted">GIFs animados funcionam como papel de parede. Dica: melhore fotos para 8K na aba Imagens.</div>
              </div>
              <LivingStudio m={living ? current : null} onClose={() => setLiving(false)} />
              <MediaPicker open={pick} onClose={() => setPick(false)} onPick={([id]) => { const m = media.find((x) => x.id === id); if (m) p({ image: m.file }) }} />
            </div>
          )}
          {wp.type === "video" && <VideoWallPanel file={wp.video} onPick={(f) => p({ video: f, type: "video" })} />}
          {wp.type === "gif" && (
            <div className="flex items-center gap-4">
              {wp.gif
                ? <img src={mediaUrl(wp.gif)} className="h-28 w-48 rounded-xl object-cover" />
                : <div className="flex h-28 w-48 items-center justify-center rounded-xl border border-dashed border-line text-sm text-fg-muted">Nenhum</div>}
              <div className="flex flex-col gap-2">
                <ThemedButton size="sm" onClick={async () => { const r = await bridge.media.wallAnim("gif"); if (r) p({ gif: r.file, type: "gif" }) }}>Escolher GIF</ThemedButton>
                <span className="max-w-[260px] text-xs text-fg-muted">GIF animado, repetindo sem parar.</span>
              </div>
            </div>
          )}
          {wp.type === "engine" && <WallpaperEnginePanel />}
          {wp.type === "color" && <ColorPicker value={wp.color} onChange={(v) => p({ color: v })} swatches={["#1a1020", "#0b0710", "#008080", "#202830", "#2b1055", "#f6e8ee", "#000000"]} />}
        </div>
      </Section>
      <Section title="Personalizar pela foto" desc="Uma IA olha o papel de parede e ajusta tudo para combinar: cores, fontes, cursor, efeitos, o relógio da tela e os widgets (onde ficam e como ficam). Roda no seu PC.">
        <div className="flex items-center gap-3">
          <ThemedButton size="sm" disabled={wp.type !== "image" || !wp.image} onClick={() => window.dispatchEvent(new Event("agenda:autostyle"))}><WandSparkles size={15} /> Personalizar automaticamente</ThemedButton>
          {wp.type !== "image" && <span className="text-xs text-fg-muted">Escolha uma imagem como fundo primeiro.</span>}
        </div>
      </Section>
      <LockClockSection />
      <Section title="Ajustes">
        <Slider label="Escurecer" value={wp.dim} min={0} max={0.8} step={0.01} onChange={(v) => p({ dim: v })} format={(v) => Math.round(v * 100) + "%"} />
        <Slider label="Desfoque" value={wp.blur} min={0} max={40} onChange={(v) => p({ blur: v })} format={(v) => v + "px"} />
        <Switch label="Efeito de profundidade (parallax 3D com o mouse)" checked={wp.parallax} onChange={(v) => p({ parallax: v })} />
      </Section>
    </>
  )
}

/* ------------------- Relógio da tela de bloqueio ------------------- */
const LOCK_STYLES: { id: LockClockT["style"]; label: string; sample: React.CSSProperties }[] = [
  { id: "ios", label: "iPhone", sample: { fontWeight: 700, letterSpacing: "-0.04em" } },
  { id: "thin", label: "Fino", sample: { fontWeight: 200 } },
  { id: "bold", label: "Bem grosso", sample: { fontWeight: 900 } },
  { id: "stacked", label: "Empilhado", sample: { fontWeight: 900, lineHeight: 0.8 } },
  { id: "serif", label: "Elegante", sample: { fontFamily: "'Playfair Display Variable', serif", fontStyle: "italic" } },
  { id: "outline", label: "Contorno", sample: { color: "transparent", WebkitTextStroke: "1.2px var(--fg)", fontWeight: 800 } },
  { id: "neon", label: "Neon", sample: { textShadow: "0 0 8px var(--accent), 0 0 18px var(--accent)" } },
  { id: "retro", label: "Retrô", sample: { fontFamily: "'VT323', monospace" } },
]

function LockClockSection() {
  const [s, set] = useS()
  const media = useStore((x) => x.media)
  const c = { ...LOCK_DEFAULT, ...(s.lockClock ?? {}) }
  const p = (patch: Partial<LockClockT>) => set({ lockClock: { ...c, ...patch } })
  const wp = s.wallpaper
  const img = wp.type === "image" ? media.find((m) => m.file === wp.image) : undefined
  const ready = wp.fg && wp.fgFor === wp.image
  const [prog, setProg] = useState<{ pct: number; msg: string } | null>(null)
  const [err, setErr] = useState("")
  const cut = async () => {
    if (!wp.image) return
    setErr("")
    setProg({ pct: 0, msg: "Começando…" })
    try {
      const { segmentSubject } = await import("@/lib/depth")
      const data = await segmentSubject(mediaUrl(wp.image), (pct, msg) => setProg({ pct, msg }))
      const file = await bridge.media.saveDataUrl(data, "assunto")
      if (wp.fg && wp.fg !== file) bridge.media.remove(wp.fg)
      set({ wallpaper: { ...useStore.getState().settings.wallpaper, fg: file, fgFor: wp.image }, lockClock: { ...c, depth: true } })
    } catch (e: any) {
      setErr("Não consegui recortar: " + (e?.message ?? e))
    }
    setProg(null)
  }
  return (
    <Section title="Relógio da tela (estilo iPhone)" desc="Um relógio grande desenhado no papel de parede. Com a profundidade ligada, a pessoa ou o objeto da foto fica NA FRENTE do relógio, igual à tela de bloqueio do iPhone.">
      <Switch label="Mostrar o relógio no papel de parede" checked={c.on} onChange={(v) => p({ on: v })} />
      {c.on && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-4 gap-2">
            {LOCK_STYLES.map((st) => (
              <button key={st.id} onClick={() => p({ style: st.id })} className={cn("flex flex-col items-center gap-1 rounded-xl border p-2", c.style === st.id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
                <span className="text-2xl leading-none" style={st.sample}>{st.id === "stacked" ? <>09<br />41</> : "9:41"}</span>
                <span className="text-[11px] text-fg-muted">{st.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            <FontPicker label="Fonte do relógio da tela" value={c.font ?? ""} onChange={(id) => p({ font: id || undefined })} allowDefault defaultLabel="Do estilo escolhido" sample="12:45" />
            <div>
              <div className="mb-1 text-sm">Alinhamento</div>
              <Segmented value={c.align} onChange={(v) => p({ align: v, x: v === "left" ? 6 : v === "right" ? 94 : 50 })} options={[{ value: "left", label: "Esquerda" }, { value: "center", label: "Centro" }, { value: "right", label: "Direita" }]} />
            </div>
          </div>
          <div className="text-sm">Cor</div>
          <ColorPicker value={c.color} onChange={(v) => p({ color: v })} swatches={["#ffffff", "#fff4e6", "#ffd6e8", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff", "#111111"]} />
          <div className="grid grid-cols-2 gap-x-6">
            <Slider label="Tamanho" value={c.size} min={0.4} max={1.8} step={0.05} onChange={(v) => p({ size: v })} format={(v) => Math.round(v * 100) + "%"} />
            <Slider label="Espessura" value={c.weight} min={100} max={900} step={100} onChange={(v) => p({ weight: v })} />
            <Slider label="Altura na tela" value={c.y} min={0} max={80} onChange={(v) => p({ y: v })} format={(v) => v + "%"} />
            <Slider label="Posição horizontal" value={c.x} min={0} max={100} onChange={(v) => p({ x: v })} format={(v) => v + "%"} />
            <Slider label="Transparência" value={c.opacity} min={0.3} max={1} step={0.02} onChange={(v) => p({ opacity: v })} format={(v) => Math.round(v * 100) + "%"} />
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            <Switch label="Mostrar a data" checked={c.showDate} onChange={(v) => p({ showDate: v })} />
            <Switch label="Mostrar segundos" checked={c.seconds} onChange={(v) => p({ seconds: v })} />
            <Switch label="Formato 12h" checked={!!c.h12} onChange={(v) => p({ h12: v })} />
            <Switch label="Brilho em volta" checked={c.glow} onChange={(v) => p({ glow: v })} />
          </div>
          <div className="rounded-xl border border-line p-3">
            <Switch label="Profundidade: assunto da foto na frente do relógio" checked={c.depth} onChange={(v) => p({ depth: v })} />
            {wp.type !== "image" || !img ? (
              <div className="text-xs text-fg-muted">Funciona com papel de parede de imagem (foto de pessoa, animal, objeto, montanha…).</div>
            ) : img.animated ? (
              <div className="text-xs text-fg-muted">GIFs animados não podem ser recortados. Use uma foto.</div>
            ) : (
              <div className="mt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <button className="btn !py-1.5 text-sm" disabled={!!prog} onClick={cut}><Scissors size={14} /> {ready ? "Refazer o recorte" : "Separar o assunto da foto"}</button>
                  {ready && !prog && <span className="text-xs text-[#5ee3a1]">Recorte pronto ✓</span>}
                </div>
                {prog && (
                  <div>
                    <div className="mb-1 text-xs text-fg-muted">{prog.msg}</div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]"><div className="h-full bg-brand transition-all" style={{ width: prog.pct + "%" }} /></div>
                  </div>
                )}
                <div className="text-[11px] text-fg-muted">O recorte é feito no seu PC por um modelo de IA (na primeira vez baixa ~45 MB). Fotos com um assunto bem destacado ficam melhores.</div>
                {err && <div className="text-xs text-[#ff8f8f]">{err}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

/* ------------------------- Efeitos ------------------------- */
function Fx() {
  const [s, set] = useS()
  const sk = s.sakura
  const o = s.overlay
  return (
    <>
      <Section title="Flores de sakura">
        <Switch label="Animação de abertura ao entrar" checked={sk.splash} onChange={(v) => set({ sakura: { ...sk, splash: v } })} />
        <Slider label="Duração da abertura" value={sk.splashSeconds} min={2} max={10} step={0.5} onChange={(v) => set({ sakura: { ...sk, splashSeconds: v } })} format={(v) => v + "s"} />
        <Switch label="Pétalas caindo na área de trabalho" checked={sk.ambient} onChange={(v) => set({ sakura: { ...sk, ambient: v } })} />
        <Slider label="Quantidade de pétalas" value={sk.density} min={0.05} max={1} step={0.05} onChange={(v) => set({ sakura: { ...sk, density: v } })} format={(v) => Math.round(v * 100) + "%"} />
        <button className="btn mt-2" onClick={() => useStore.setState({ splashDone: false })}><Flower2 size={14} /> Ver abertura agora</button>
      </Section>
      <Section title="Camadas de efeito">
        <Switch label="Linhas de varredura (monitor CRT)" checked={o.scanlines} onChange={(v) => set({ overlay: { ...o, scanlines: v } })} />
        <Switch label="Granulado de filme" checked={o.grain} onChange={(v) => set({ overlay: { ...o, grain: v } })} />
        <Switch label="Vinheta nas bordas" checked={o.vignette} onChange={(v) => set({ overlay: { ...o, vignette: v } })} />
      </Section>
    </>
  )
}

/* ------------------------- Widgets ------------------------- */
function WidgetsTab() {
  const [s, set] = useS()
  const [city, setCity] = useState(s.weatherCity)
  return (
    <Section title="Padrões dos widgets">
      <label className="block py-1 text-sm">Cidade do clima
        <div className="mt-1 flex gap-2"><input className="field flex-1" value={city} onChange={(e) => setCity(e.target.value)} /><button className="btn" onClick={() => set({ weatherCity: city.trim() || "São Paulo" })}>Salvar</button></div>
      </label>
      <label className="block py-1 text-sm">Fonte de notícias
        <select className="field mt-1 w-full" value={s.newsFeed} onChange={(e) => set({ newsFeed: e.target.value })}>
          {FEEDS.map((f) => <option key={f.url} value={f.url}>{f.label}</option>)}
        </select>
      </label>
      <Switch label="Travar posição dos widgets" checked={s.widgetsLocked} onChange={(v) => set({ widgetsLocked: v })} />
      <div className="pt-2 text-xs text-fg-muted">Clique com o botão direito na área de trabalho para adicionar widgets. Passe o mouse sobre um widget para configurá-lo, removê-lo ou redimensioná-lo.</div>
    </Section>
  )
}

/* ------------------------- Sistema ------------------------- */
function System() {
  const [, set] = useS()
  const reset = useStore((x) => x.resetSettings)
  const [auto, setAuto] = useState(false)
  useEffect(() => { bridge.app.autostart().then(setAuto) }, [])

  const exportData = () => {
    const data = buildBackup(useStore.getState() as unknown as Record<string, unknown>)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    a.download = `widgy-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }
  // O arquivo é conferido antes de entrar (lib/backup): só dados conhecidos, no formato certo, e as
  // configurações completadas com os padrões. Um arquivo qualquer não consegue deixar o app sem abrir.
  const importData = (f: File) =>
    f.text().then((t) => {
      const r = parseBackup(t, { defaults: DEFAULT_SETTINGS as unknown as Record<string, unknown>, widgetTypes: Object.keys(WIDGET_SIZES), oneOf: { theme: Object.keys(THEME_PRESETS) } })
      if (!r.ok) { alert(r.error); return }
      const notes = r.warnings.length ? "\n\nObservações:\n- " + r.warnings.join("\n- ") : ""
      if (confirm(`Substituir os dados atuais pelo backup (${r.summary})?${notes}`)) useStore.setState(r.data)
    }).catch(() => alert("Não foi possível ler o arquivo."))

  return (
    <>
      <Section title="Inicialização">
        <Switch label="Abrir o Widgy ao ligar o computador" checked={auto} onChange={async (v) => setAuto(await bridge.app.autostart(v))} />
        {!isDesktop && <div className="text-xs text-fg-muted">Disponível no app desktop.</div>}
        <button className="btn mt-2" onClick={() => bridge.win.fullscreen(true)}>Entrar em tela cheia</button>
      </Section>
      <UpdatesSection />
      <SystemExtra />
      <Section title="Diagnóstico de travamentos" desc="Registra quedas do renderizador, da GPU e longas pausas da interface. Não coleta nomes de arquivos, senhas ou conteúdo de widgets.">
        <button className="btn" onClick={() => void bridge.app.diagnostics()}>
          <HardDrive size={14} /> Abrir relatório de diagnóstico
        </button>
        <div className="mt-2 text-xs text-fg-muted">Arquivo local: %APPDATA%\Agenda\widgy-diagnostics.log. O histórico é limitado para não consumir espaço ou RAM.</div>
      </Section>
      <Section title="Backup" desc="Exporta configurações, widgets, hábitos, estudos, serviços, listas, tarefas, galerias e os históricos de música e de jogos. As imagens ficam na pasta do app e as Finanças não entram neste arquivo.">
        <div className="flex gap-2">
          <button className="btn" onClick={exportData}><Download size={14} /> Exportar backup</button>
          <label className="btn clickable cursor-pointer"><Upload size={14} /> Importar backup<input type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importData(f) }} /></label>
        </div>
      </Section>
      <Section title="Restaurar">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(THEME_PRESETS) as ThemeId[]).length > 0 && (
            <button className="btn" onClick={() => confirm("Voltar todas as configurações ao padrão? Isso inclui aparência, barra, avisos, agendas conectadas e times favoritos. Seus widgets e seus dados (hábitos, listas, tarefas…) não mudam.") && reset()}><RotateCcw size={14} /> Configurações padrão</button>
          )}
          <button className="btn" onClick={() => set({ widgetsLocked: false })}>Destravar widgets</button>
        </div>
      </Section>
      <div className="text-center text-xs text-fg-muted">Widgy</div>
    </>
  )
}
