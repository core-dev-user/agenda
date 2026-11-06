import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ImagePlus, Pencil, Plus, Trash2, Wand2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import { FONTS } from "@/lib/fonts"
import { cn, uid } from "@/lib/utils"
import { ColorPicker, Segmented, Slider, Switch } from "@/components/ui/controls"
import { MediaPicker } from "@/components/MediaPicker"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"

/* ---------------- agentes (valorant-api.com, público) ---------------- */
export interface Agent {
  uuid: string; displayName: string; description: string; displayIcon: string; bustPortrait: string; fullPortrait: string; background: string
  backgroundGradientColors: string[]; role?: { displayName: string; displayIcon: string }; abilities: { slot: string; displayName: string; displayIcon: string | null }[]
}
let agentsCache: Agent[] | null = null
let agentsLoading: Promise<Agent[]> | null = null
function loadAgents(): Promise<Agent[]> {
  if (agentsCache) return Promise.resolve(agentsCache)
  if (!agentsLoading) {
    agentsLoading = bridge.net.text("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=pt-BR")
      .then((t) => { const list = (JSON.parse(t).data as Agent[]).sort((a, b) => a.displayName.localeCompare(b.displayName)); agentsCache = list; try { localStorage.setItem("val-agents", JSON.stringify(list)) } catch {} return list })
      .catch(() => { try { const c = JSON.parse(localStorage.getItem("val-agents") || "null"); if (c) { agentsCache = c; return c } } catch {} agentsLoading = null; return [] })
  }
  return agentsLoading
}
export function useAgents() {
  const [list, setList] = useState<Agent[]>(agentsCache ?? [])
  useEffect(() => { if (!agentsCache) loadAgents().then(setList) }, [])
  return list
}
const hex = (c?: string) => (c ? "#" + c.slice(0, 6) : "#1b1b2b")

/* ---------------- aparência ---------------- */
/** tudo que dá para personalizar (é isso que um template guarda) */
export interface ValLook {
  image: "full" | "bust" | "icon" | "custom" | "none"
  customId?: string
  imgScale: number; imgX: number; imgY: number; flip: boolean
  bg: "gradient" | "color" | "art" | "custom"
  bgColor: string; c1?: string; c2?: string; customBgId?: string; artOpacity: number
  showName: boolean; nameText?: string; font: string; nameSize: number; nameColor: string; upper: boolean; namePos: "top" | "bottom"
  showRole: boolean; showAbilities: boolean; subtitle: string; textColor: string
  shade: number; glow: boolean; showTimer: boolean
}
export const DEFAULT_LOOK: ValLook = {
  image: "full", imgScale: 1.35, imgX: 0, imgY: 6, flip: false,
  bg: "gradient", bgColor: "#0f1923", artOpacity: 0.35,
  showName: true, font: "space", nameSize: 1, nameColor: "#ffffff", upper: true, namePos: "bottom",
  showRole: true, showAbilities: false, subtitle: "", textColor: "#ffffff", shade: 0.55, glow: true, showTimer: true,
}
export const PRESETS: { id: string; name: string; look: Partial<ValLook> }[] = [
  { id: "retrato", name: "Retrato", look: { image: "full", bg: "gradient", showName: true, namePos: "bottom", showRole: true, showAbilities: false, imgScale: 1.35, imgY: 6 } },
  { id: "cartao", name: "Cartão", look: { image: "bust", bg: "art", artOpacity: 0.45, namePos: "top", showRole: true, showAbilities: true, imgScale: 1.05, imgY: 8 } },
  { id: "icone", name: "Ícone", look: { image: "icon", bg: "color", bgColor: "#0f1923", showAbilities: true, showRole: true, imgScale: 0.7, imgY: -6 } },
  { id: "minimal", name: "Só o nome", look: { image: "none", bg: "gradient", showName: true, nameSize: 1.6, namePos: "bottom", showRole: false, showAbilities: false } },
  { id: "poster", name: "Pôster", look: { image: "full", bg: "art", artOpacity: 0.8, font: "orbitron", nameSize: 1.3, upper: true, shade: 0.75, imgScale: 1.25, imgY: 6 } },
]
export interface ValTemplate { id: string; name: string; agent?: string; look: Partial<ValLook> }

const lookOf = (c: Record<string, any>): ValLook => ({ ...DEFAULT_LOOK, ...(c.look ?? {}) })

/** Widget do Valorant: o agente com o visual que você montar (e troca sozinho para o agente que você está jogando). */
export function ValAgentWidget({ w }: { w: Widget }) {
  const agents = useAgents()
  const now = useStore((s) => s.valAgentNow)
  const templates = useStore((s) => s.valTemplates)
  const running = useStore((s) => s.gamesRunning.find((g) => g.id === "valorant"))
  const media = useStore((s) => s.media)
  const c = w.config
  const auto = c.auto !== false
  const agentId = (auto && now?.id) || c.agent || agents.find((a) => a.displayName === "Jett")?.uuid || agents[0]?.uuid
  const a = agents.find((x) => x.uuid === agentId)
  // template ligado a este agente (no modo automático) ou o visual do widget
  const bound = auto ? templates.find((t) => t.agent === agentId) : undefined
  const L: ValLook = { ...lookOf(c), ...(bound?.look ?? {}) }
  const clock = useNow(1000)
  if (!a) return <div className="flex h-full items-center justify-center text-sm text-fg-muted"><span className="animate-pulse">Carregando agentes…</span></div>

  const [g1, g2] = [L.c1 || hex(a.backgroundGradientColors[0]), L.c2 || hex(a.backgroundGradientColors[2] ?? a.backgroundGradientColors[1])]
  const custom = L.customId ? media.find((m) => m.id === L.customId) : undefined
  const customBg = L.customBgId ? media.find((m) => m.id === L.customBgId) : undefined
  const img = L.image === "full" ? a.fullPortrait : L.image === "bust" ? a.bustPortrait : L.image === "icon" ? a.displayIcon : L.image === "custom" && custom ? mediaUrl(custom.file) : ""
  const font = FONTS.find((f) => f.id === L.font)?.family
  const name = L.nameText || a.displayName
  const base = Math.min(w.w, w.h)
  const playing = running && L.showTimer
  const secs = playing ? Math.floor((clock.getTime() - running.start) / 1000) : 0

  const nameBlock = L.showName && (
    <div className={cn("relative z-10 px-4", L.namePos === "top" ? "pt-4" : "pb-4")}>
      {L.showRole && a.role && (
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] uppercase opacity-85" style={{ color: L.textColor }}>
          <img src={a.role.displayIcon} className="h-3.5 w-3.5" draggable={false} />{a.role.displayName}
        </div>
      )}
      <div className="leading-[0.9] font-black" style={{ fontFamily: font, fontSize: Math.max(18, base * 0.15 * L.nameSize), color: L.nameColor, textTransform: L.upper ? "uppercase" : "none", textShadow: L.glow ? `0 0 24px ${g1}, 0 4px 18px rgb(0 0 0 / .5)` : "0 3px 12px rgb(0 0 0 / .5)" }}>{name}</div>
      {L.subtitle && <div className="mt-1 text-xs opacity-85" style={{ color: L.textColor }}>{L.subtitle}</div>}
    </div>
  )

  return (
    <div className="relative h-full w-full overflow-hidden text-white">
      {/* fundo */}
      <div className="absolute inset-0" style={{ background: L.bg === "color" ? L.bgColor : `linear-gradient(160deg, ${g1}, ${g2})` }} />
      {L.bg === "art" && <img src={a.background} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: L.artOpacity, mixBlendMode: "screen" }} draggable={false} />}
      {L.bg === "custom" && customBg && <img src={mediaUrl(customBg.file)} className="absolute inset-0 h-full w-full object-cover" draggable={false} />}

      {/* agente */}
      <AnimatePresence mode="wait">
        {img && (
          <motion.img
            key={img}
            src={img}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ transform: `translate(${L.imgX}%, ${L.imgY}%) scale(${L.imgScale}) ${L.flip ? "scaleX(-1)" : ""}`, filter: L.glow ? `drop-shadow(0 0 28px ${g1}aa)` : undefined }}
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0" style={{ background: L.namePos === "top" ? `linear-gradient(to bottom, rgb(0 0 0 / ${L.shade}), transparent 45%)` : `linear-gradient(to top, rgb(0 0 0 / ${L.shade}), transparent 50%)` }} />

      <div className={cn("relative flex h-full flex-col", L.namePos === "top" ? "justify-start" : "justify-end")}>
        {L.namePos === "top" && nameBlock}
        {L.showAbilities && (
          <div className={cn("relative z-10 flex gap-1.5 px-4", L.namePos === "top" ? "mt-auto pb-3" : "pb-2")}>
            {a.abilities.filter((x) => x.displayIcon && x.slot !== "Passive").map((x) => (
              <div key={x.slot} title={x.displayName} className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/35 backdrop-blur-sm"><img src={x.displayIcon!} className="h-5 w-5" draggable={false} /></div>
            ))}
          </div>
        )}
        {L.namePos === "bottom" && nameBlock}
      </div>

      {(playing || (auto && now)) && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff4655]" />
          {now && !now.locked ? "escolhendo…" : playing ? `${Math.floor(secs / 3600) ? Math.floor(secs / 3600) + ":" : ""}${String(Math.floor(secs / 60) % 60).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}` : "em jogo"}
        </div>
      )}
    </div>
  )
}

/* ================================== editor ================================== */
export function ValAgentSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const agents = useAgents()
  const templates = useStore((s) => s.valTemplates)
  const media = useStore((s) => s.media)
  const c = w.config
  const L = lookOf(c)
  const setL = (p: Partial<ValLook>) => set({ look: { ...L, ...p } })
  const [picker, setPicker] = useState<null | "img" | "bg">(null)
  const [tplName, setTplName] = useState("")
  const [tplAgent, setTplAgent] = useState("")
  const [q, setQ] = useState("")
  const setTemplates = (fn: (t: ValTemplate[]) => ValTemplate[]) => useStore.setState((s) => ({ valTemplates: fn(s.valTemplates) }))
  const shown = useMemo(() => agents.filter((a) => !q || a.displayName.toLowerCase().includes(q.toLowerCase())), [agents, q])
  const label = "text-xs font-semibold tracking-wide text-fg-muted uppercase"

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className={label}>Agente</div>
        <Switch label="Trocar sozinho para o agente que estou jogando" checked={c.auto !== false} onChange={(v) => set({ auto: v })} />
        <input className="field !py-1 text-sm" placeholder="Buscar agente" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid max-h-40 grid-cols-8 gap-1.5 overflow-y-auto pr-1">
          {shown.map((a) => (
            <button key={a.uuid} title={a.displayName} onClick={() => set({ agent: a.uuid })} className={cn("relative overflow-hidden rounded-lg border-2", c.agent === a.uuid ? "border-brand" : "border-transparent")} style={{ background: hex(a.backgroundGradientColors[0]) }}>
              <img src={a.displayIcon} className="aspect-square w-full" draggable={false} />
            </button>
          ))}
        </div>
        <div className="text-[11px] text-fg-muted">Com o modo automático, este agente aparece quando você não está jogando.</div>
      </div>

      <div className="space-y-2">
        <div className={label}>Modelos prontos</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => <button key={p.id} className="btn !py-1 text-xs" onClick={() => set({ look: { ...DEFAULT_LOOK, ...p.look } })}><Wand2 size={12} /> {p.name}</button>)}
        </div>
      </div>

      <div className="space-y-2">
        <div className={label}>Imagem</div>
        <Segmented value={L.image} onChange={(v) => setL({ image: v })} options={[{ value: "full", label: "Corpo" }, { value: "bust", label: "Busto" }, { value: "icon", label: "Ícone" }, { value: "custom", label: "Minha foto" }, { value: "none", label: "Nenhuma" }]} />
        {L.image === "custom" && <button className="btn !py-1 text-xs" onClick={() => setPicker("img")}><ImagePlus size={13} /> {L.customId && media.some((m) => m.id === L.customId) ? "Trocar a foto" : "Escolher da galeria"}</button>}
        {L.image !== "none" && (
          <>
            <Slider label="Tamanho" value={L.imgScale} min={0.4} max={2.2} step={0.05} onChange={(v) => setL({ imgScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Posição horizontal" value={L.imgX} min={-50} max={50} onChange={(v) => setL({ imgX: v })} />
            <Slider label="Posição vertical" value={L.imgY} min={-50} max={50} onChange={(v) => setL({ imgY: v })} />
            <Switch label="Espelhar" checked={L.flip} onChange={(v) => setL({ flip: v })} />
            <Switch label="Brilho na cor do agente" checked={L.glow} onChange={(v) => setL({ glow: v })} />
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className={label}>Fundo</div>
        <Segmented value={L.bg} onChange={(v) => setL({ bg: v })} options={[{ value: "gradient", label: "Degradê do agente" }, { value: "art", label: "Arte do agente" }, { value: "color", label: "Cor" }, { value: "custom", label: "Minha imagem" }]} />
        {(L.bg === "gradient" || L.bg === "art") && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Cores</span>
            <input type="color" value={L.c1 || "#ff4655"} onChange={(e) => setL({ c1: e.target.value })} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" />
            <input type="color" value={L.c2 || "#0f1923"} onChange={(e) => setL({ c2: e.target.value })} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" />
            {(L.c1 || L.c2) && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => setL({ c1: undefined, c2: undefined })}>cores do agente</button>}
          </div>
        )}
        {L.bg === "art" && <Slider label="Força da arte" value={L.artOpacity} min={0.1} max={1} step={0.05} onChange={(v) => setL({ artOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />}
        {L.bg === "color" && <ColorPicker value={L.bgColor} onChange={(v) => setL({ bgColor: v })} swatches={["#0f1923", "#ff4655", "#ece8e1", "#111111", "#1f2937", "#3b0a45", "#0b3d2e"]} />}
        {L.bg === "custom" && <button className="btn !py-1 text-xs" onClick={() => setPicker("bg")}><ImagePlus size={13} /> Escolher da galeria</button>}
        <Slider label="Sombra para o texto" value={L.shade} min={0} max={0.95} step={0.05} onChange={(v) => setL({ shade: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </div>

      <div className="space-y-2">
        <div className={label}>Texto</div>
        <Switch label="Mostrar o nome" checked={L.showName} onChange={(v) => setL({ showName: v })} />
        {L.showName && (
          <>
            <input className="field !py-1 text-sm" placeholder="Nome (vazio = nome do agente)" value={L.nameText ?? ""} onChange={(e) => setL({ nameText: e.target.value || undefined })} />
            <div className="flex gap-2">
              <select className="field !py-1 text-sm" value={L.font} onChange={(e) => setL({ font: e.target.value })}>{FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>)}</select>
              <Segmented value={L.namePos} onChange={(v) => setL({ namePos: v })} options={[{ value: "top", label: "Em cima" }, { value: "bottom", label: "Embaixo" }]} />
            </div>
            <Slider label="Tamanho do nome" value={L.nameSize} min={0.5} max={2.5} step={0.05} onChange={(v) => setL({ nameSize: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <div className="flex items-center gap-3 text-sm"><span>Cor do nome</span><ColorPicker value={L.nameColor} onChange={(v) => setL({ nameColor: v })} swatches={["#ffffff", "#ff4655", "#ece8e1", "#ffd36e", "#7cc8ff", "#0f1923"]} /></div>
            <Switch label="LETRAS MAIÚSCULAS" checked={L.upper} onChange={(v) => setL({ upper: v })} />
          </>
        )}
        <input className="field !py-1 text-sm" placeholder="Frase embaixo do nome (opcional)" value={L.subtitle} onChange={(e) => setL({ subtitle: e.target.value })} />
        <div className="flex items-center gap-3 text-sm"><span>Cor da frase e da função</span><ColorPicker value={L.textColor} onChange={(v) => setL({ textColor: v })} swatches={["#ffffff", "#ece8e1", "#ff4655", "#ffd36e", "#0f1923"]} /></div>
        <Switch label="Mostrar a função (Duelista, Controlador…)" checked={L.showRole} onChange={(v) => setL({ showRole: v })} />
        <Switch label="Mostrar as habilidades" checked={L.showAbilities} onChange={(v) => setL({ showAbilities: v })} />
        <Switch label="Mostrar há quanto tempo estou jogando" checked={L.showTimer} onChange={(v) => setL({ showTimer: v })} />
      </div>

      {/* templates */}
      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className={label}>Meus templates</div>
        <div className="text-[11px] text-fg-muted">Salve o visual atual. Ligando a um agente, ele é usado sozinho quando você jogar com ele.</div>
        <div className="flex flex-wrap gap-2">
          <input className="field !w-40 !py-1 text-sm" placeholder="Nome do template" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <select className="field !w-auto !py-1 text-sm" value={tplAgent} onChange={(e) => setTplAgent(e.target.value)}>
            <option value="">Sem agente fixo</option>
            {agents.map((a) => <option key={a.uuid} value={a.uuid}>{a.displayName}</option>)}
          </select>
          <button className="btn !py-1 text-xs" onClick={() => {
            const name = tplName.trim() || (tplAgent ? agents.find((a) => a.uuid === tplAgent)?.displayName : "") || `Template ${templates.length + 1}`
            setTemplates((t) => [...t.map((x) => (tplAgent && x.agent === tplAgent ? { ...x, agent: undefined } : x)), { id: uid(), name, agent: tplAgent || undefined, look: L }])
            setTplName(""); setTplAgent("")
          }}><Plus size={12} /> Salvar visual atual</button>
        </div>
        <div className="space-y-1">
          {templates.map((t) => {
            const ag = agents.find((a) => a.uuid === t.agent)
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                {ag ? <img src={ag.displayIcon} className="h-6 w-6 rounded" draggable={false} /> : <span className="h-6 w-6" />}
                <span className="min-w-0 flex-1 truncate">{t.name}{ag && <span className="text-xs text-fg-muted"> · {ag.displayName}</span>}</span>
                <button className="btn !py-0.5 text-xs" title="Aplicar no widget" onClick={() => set({ look: { ...DEFAULT_LOOK, ...t.look } })}><Check size={12} /> Usar</button>
                <button className="btn btn-ghost btn-icon !p-1" title="Atualizar com o visual atual" onClick={() => setTemplates((all) => all.map((x) => (x.id === t.id ? { ...x, look: L } : x)))}><Pencil size={12} /></button>
                <button className="btn btn-ghost btn-icon !p-1" title="Apagar" onClick={() => setTemplates((all) => all.filter((x) => x.id !== t.id))}><Trash2 size={12} /></button>
              </div>
            )
          })}
          {!templates.length && <div className="text-xs text-fg-muted">Nenhum template ainda.</div>}
        </div>
      </div>

      <MediaPicker open={!!picker} onClose={() => setPicker(null)} onPick={(ids) => { if (ids[0]) setL(picker === "img" ? { customId: ids[0], image: "custom" } : { customBgId: ids[0], bg: "custom" }); setPicker(null) }} />
    </div>
  )
}
