import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AppWindow as AppWindowIcon, ArrowLeft, ArrowRight, Check, Gamepad2, Headphones, Monitor, MonitorSmartphone, Music, Target, Crosshair, MessageCircle, type LucideIcon } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, type PcApp, type UiMode } from "@/lib/bridge"
import { MODE_INFO, useUiMode } from "@/lib/uimode"
import { cn } from "@/lib/utils"
import type { WidgetType } from "@/lib/types"
import { useThemeVars } from "@/App"
import { Wallpaper } from "./Wallpaper"
import { Logo } from "./Logo"
import { GlyphTile } from "./Glyph"

/** desenhinho de cada modo (só formas, sem imagens) */
function ModeArt({ mode }: { mode: UiMode }) {
  const bar = "absolute rounded-[3px] bg-[color-mix(in_srgb,var(--fg)_30%,transparent)]"
  const win = "absolute rounded-md border border-[color-mix(in_srgb,var(--fg)_25%,transparent)] bg-[color-mix(in_srgb,var(--bg,#000)_55%,transparent)] shadow-lg"
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, #1a1020), #120c18)" }}>
      {mode === "app" && (
        <div className={cn(win, "inset-x-6 inset-y-3 flex")}>
          <div className="m-1 w-8 rounded bg-[color-mix(in_srgb,var(--fg)_14%,transparent)]" />
          <div className="m-1 ml-0 flex-1 rounded bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]" />
        </div>
      )}
      {mode === "desktop" && (
        <>
          <div className="absolute top-3 left-3 h-7 w-12 rounded-md bg-[color-mix(in_srgb,var(--fg)_22%,transparent)]" />
          <div className="absolute top-12 left-3 h-9 w-12 rounded-md bg-[color-mix(in_srgb,var(--fg)_22%,transparent)]" />
          <div className="absolute top-3 right-3 h-10 w-10 rounded-full bg-[color-mix(in_srgb,var(--fg)_22%,transparent)]" />
          <div className={cn(win, "top-6 left-[34%] h-14 w-[42%]")} />
          <div className={cn(bar, "inset-x-0 bottom-0 h-3 !rounded-none bg-[color-mix(in_srgb,#000_55%,transparent)]")} />
        </>
      )}
      {mode === "screen" && (
        <>
          <div className="absolute top-3 left-3 h-8 w-14 rounded-md bg-[color-mix(in_srgb,var(--fg)_22%,transparent)]" />
          <div className="absolute top-3 right-3 h-14 w-12 rounded-md bg-[color-mix(in_srgb,var(--fg)_22%,transparent)]" />
          <div className={cn(bar, "bottom-2 left-1/2 h-3 w-24 -translate-x-1/2 !rounded-full bg-[color-mix(in_srgb,var(--fg)_35%,transparent)]")} />
        </>
      )}
    </div>
  )
}

const MODE_ICON: Record<UiMode, LucideIcon> = { app: AppWindowIcon, desktop: Monitor, screen: MonitorSmartphone }

const MUSIC_APPS: { id: PcApp | "ytmusic"; label: string; player: string }[] = [
  { id: "ytmusic", label: "YouTube Music (dentro do Agenda)", player: "" },
  { id: "spotify", label: "Spotify", player: "spotify" },
  { id: "deezer", label: "Deezer", player: "deezer" },
  { id: "applemusic", label: "Apple Music", player: "applemusic" },
  { id: "amazonmusic", label: "Amazon Music", player: "amazon" },
  { id: "tidal", label: "TIDAL", player: "tidal" },
]

interface Extra { id: string; label: string; desc: string; icon: LucideIcon; color: string; needs: PcApp[]; type: WidgetType }
const EXTRAS: Extra[] = [
  { id: "discord", label: "Discord", desc: "Quem está na call com você", icon: Headphones, color: "#5865F2", needs: ["discord"], type: "discord" },
  { id: "whatsapp", label: "WhatsApp", desc: "Conversas com mensagens novas", icon: MessageCircle, color: "#25D366", needs: ["whatsapp"], type: "whatsapp" },
  { id: "gaming", label: "Jogando agora", desc: "Arte e tempo do jogo aberto", icon: Gamepad2, color: "#a78bfa", needs: ["steam", "valorant", "lol", "epic", "cs2"], type: "gaming" },
  { id: "valagent", label: "Valorant: agente", desc: "Templates por agente", icon: Target, color: "#ff4655", needs: ["valorant"], type: "valagent" },
  { id: "cs2", label: "CS2", desc: "Jogos e resultados", icon: Crosshair, color: "#de9b35", needs: ["cs2"], type: "cs2" },
]

export default function Onboarding() {
  useThemeVars()
  const monitors = useUiMode((s) => s.monitors)
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<UiMode>("desktop")
  const [apps, setApps] = useState<PcApp[] | null>(null)
  const [music, setMusic] = useState<string>("ytmusic")
  const [extras, setExtras] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [mainBar, setMainBar] = useState(false)

  useEffect(() => {
    bridge.mode.detectApps().then((r) => {
      setApps(r.apps)
      // já sugere o player que a pessoa tem instalado e os widgets dos apps dela
      const m = MUSIC_APPS.find((a) => a.id !== "ytmusic" && r.apps.includes(a.id as PcApp))
      if (m) setMusic(m.id)
      setExtras(Object.fromEntries(EXTRAS.filter((e) => e.needs.some((n) => r.apps.includes(n))).map((e) => [e.id, true])))
    }).catch(() => setApps([]))
  }, [])

  const has = (a: string) => a === "ytmusic" || !!apps?.includes(a as PcApp)
  const shownExtras = EXTRAS.filter((e) => e.needs.some((n) => apps?.includes(n)))
  const modes: UiMode[] = ["desktop", "app", "screen"]

  const finish = async () => {
    setBusy(true)
    const st = useStore.getState()
    if (mode !== "app") {
      const exists = (t: WidgetType) => st.widgets.some((w) => w.type === t)
      const m = MUSIC_APPS.find((a) => a.id === music)!
      if (m.id === "ytmusic") { if (!exists("music")) st.addWidget("music") }
      else if (!exists("pcmusic")) st.addWidget("pcmusic", { app: m.player })
      for (const e of shownExtras) if (extras[e.id] && !exists(e.type)) st.addWidget(e.type)
    }
    st.setSettings({ musicAutostart: music === "ytmusic" ? st.settings.musicAutostart : false })
    bridge.store.flush?.()
    await bridge.bar.set({ on: mode === "desktop" && mainBar })
    const ok = await bridge.mode.set(mode)
    // sem reabrir (modo de teste): troca aqui mesmo
    if (ok) setTimeout(() => useUiMode.setState({ mode }), 400)
  }

  const next = () => (step === 0 && mode === "app" ? finish() : step === 1 ? finish() : setStep(step + 1))

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden p-4">
      <Wallpaper />
      <motion.div
        className="surface relative z-10 w-full max-w-[880px] p-8"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <div>
            <div className="font-display text-2xl font-semibold">Bem-vindo ao Agenda</div>
            <div className="text-sm text-fg-muted">{step === 0 ? "Como você quer usar?" : "Encontramos estes apps no seu PC"}</div>
          </div>
          <div className="ml-auto flex gap-1.5">
            {[0, 1].map((i) => <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-[color-mix(in_srgb,var(--fg)_25%,transparent)]")} />)}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid gap-3 sm:grid-cols-3">
              {modes.map((m) => {
                const I = MODE_ICON[m]
                const on = mode === m
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    onDoubleClick={() => { setMode(m); if (m === "app") finish(); else setStep(1) }}
                    className={cn("relative flex flex-col gap-3 rounded-2xl border p-3 text-left transition-all", on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}
                  >
                    <ModeArt mode={m} />
                    <div className="flex items-center gap-2 font-semibold"><I size={16} /> {MODE_INFO[m].label}
                      {m === "screen" && monitors > 1 && <span className="ml-auto text-[10px] font-normal text-fg-muted">2º monitor</span>}
                    </div>
                    <div className="text-xs leading-relaxed text-fg-muted">{MODE_INFO[m].desc}</div>
                    {on && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-white"><Check size={12} strokeWidth={3} /></span>}
                  </button>
                )
              })}
              {mode === "desktop" && (
                <button onClick={() => setMainBar(!mainBar)} className="flex items-center gap-3 rounded-xl border border-line p-3 text-left sm:col-span-3 hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border", mainBar ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-line")}>{mainBar && <Check size={12} strokeWidth={3} />}</span>
                  <span>
                    <span className="block text-sm font-medium">Usar a barra do Agenda no lugar da barra do Windows</span>
                    <span className="block text-xs text-fg-muted">Iniciar, programas abertos e fixados e relógio na barra do Agenda. Se o Agenda fechar, a do Windows volta.</span>
                  </span>
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Music size={15} /> Qual player de música você usa?</div>
                <div className="flex flex-wrap gap-2">
                  {MUSIC_APPS.filter((a) => has(a.id)).map((a) => (
                    <button key={a.id} onClick={() => setMusic(a.id)} className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", music === a.id ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
                      {a.label}
                    </button>
                  ))}
                </div>
                {music !== "ytmusic" && <div className="mt-1.5 text-xs text-fg-muted">O widget mostra o que está tocando e controla o player que já está no seu PC.</div>}
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Widgets dos seus apps</div>
                {apps === null && <div className="text-sm text-fg-muted">Procurando…</div>}
                {apps && !shownExtras.length && <div className="text-sm text-fg-muted">Nenhum outro app compatível encontrado. Dá para adicionar widgets depois pelo botão “+”.</div>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {shownExtras.map((e) => (
                    <button key={e.id} onClick={() => setExtras((x) => ({ ...x, [e.id]: !x[e.id] }))} className={cn("flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors", extras[e.id] ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-line opacity-70 hover:opacity-100")}>
                      <GlyphTile icon={e.icon} color={e.color} size={32} />
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{e.label}</div><div className="text-xs text-fg-muted">{e.desc}</div></div>
                      <span className={cn("flex size-5 items-center justify-center rounded-md border", extras[e.id] ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-line")}>{extras[e.id] && <Check size={12} strokeWidth={3} />}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-7 flex items-center gap-2">
          {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Voltar</button>}
          <div className="flex-1 text-xs text-fg-muted">Dá para trocar depois em Configurações.</div>
          <button className="btn btn-primary" disabled={busy} onClick={next}>
            {busy ? "Abrindo…" : step === 1 || mode === "app" ? <>Começar <Check size={15} /></> : <>Continuar <ArrowRight size={15} /></>}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
