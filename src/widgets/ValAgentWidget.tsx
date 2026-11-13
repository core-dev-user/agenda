import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ImagePlus, Pencil, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import { FONTS } from "@/lib/fonts"
import { cn, uid } from "@/lib/utils"
import { MediaPicker } from "@/components/MediaPicker"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"
import { Choice, Group, MiniButton, Range, Row, Swatches, TextField, Toggle } from "./inspector"
import { FontPicker } from "@/components/FontPicker"

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
/** lista de agentes + se a busca falhou (sem internet e sem cópia guardada) + tentar de novo */
export function useAgentsState() {
  const [list, setList] = useState<Agent[]>(agentsCache ?? [])
  const [failed, setFailed] = useState(false)
  const load = () => { setFailed(false); void loadAgents().then((l) => { setList(l); setFailed(!l.length) }) }
  useEffect(() => { if (!agentsCache) load() }, [])
  return { list, failed, retry: load }
}
export function useAgents() { return useAgentsState().list }
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
  const { list: agents, failed, retry } = useAgentsState()
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
  // o relógio só serve para o tempo de partida: sem o Valorant aberto, 30 s bastam (antes: todo segundo)
  const clock = useNow(running ? 1000 : 30000)
  if (!a) return failed
    // antes ficava em "Carregando agentes…" para sempre quando a busca falhava
    ? <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-fg-muted">
        <span>Não deu para carregar os agentes. Confira a internet.</span>
        <button type="button" data-nodrag className="btn !py-1 text-xs" onClick={retry}>Tentar de novo</button>
      </div>
    : <div className="flex h-full items-center justify-center text-sm text-fg-muted"><span className="animate-pulse">Carregando agentes…</span></div>

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
  const dot = "relative size-[24px] cursor-pointer overflow-hidden rounded-full border border-[rgb(255_255_255/.2)]"

  return (
    <>
      <Group title="Agente" flush note="Com o modo automático ligado, o agente escolhido aqui aparece quando você não está em partida.">
        <Toggle label="Acompanhar o agente em jogo" hint="Troca sozinho para o agente que você está jogando." checked={c.auto !== false} onChange={(v) => set({ auto: v })} />
        <div className="space-y-2 border-t border-line p-2">
          <input className="wi-input" aria-label="Buscar agente" placeholder="Buscar agente" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="wi-scroll grid max-h-40 grid-cols-7 gap-1.5 overflow-y-auto pr-0.5">
            {shown.map((a) => (
              <button key={a.uuid} type="button" title={a.displayName} aria-label={a.displayName} aria-pressed={c.agent === a.uuid} onClick={() => set({ agent: a.uuid })} className={cn("relative overflow-hidden rounded-[9px] border-2 transition-colors", c.agent === a.uuid ? "border-brand" : "border-transparent hover:border-[color-mix(in_srgb,var(--fg)_30%,transparent)]")} style={{ background: hex(a.backgroundGradientColors?.[0]) }}>
                <img src={a.displayIcon} className="aspect-square w-full" draggable={false} alt="" />
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group title="Modelos prontos" flush>
        <div className="flex flex-wrap gap-1.5 p-2.5">
          {PRESETS.map((p) => <MiniButton key={p.id} onClick={() => set({ look: { ...DEFAULT_LOOK, ...p.look } })}><Wand2 size={12} /> {p.name}</MiniButton>)}
        </div>
      </Group>

      <Group title="Imagem do agente">
        <Row stack>
          <Choice label="Imagem do agente" value={L.image} onChange={(v) => setL({ image: v })} options={[{ value: "full", label: "Corpo" }, { value: "bust", label: "Busto" }, { value: "icon", label: "Ícone" }, { value: "custom", label: "Foto" }, { value: "none", label: "Sem" }]} />
        </Row>
        {L.image === "custom" && (
          <Row label="Sua foto">
            <MiniButton onClick={() => setPicker("img")}><ImagePlus size={12} /> {L.customId && media.some((m) => m.id === L.customId) ? "Trocar" : "Escolher"}</MiniButton>
          </Row>
        )}
        {L.image !== "none" && <Range label="Tamanho" value={L.imgScale} min={0.4} max={2.2} step={0.05} onChange={(v) => setL({ imgScale: v })} format={(v) => `${Math.round(v * 100)}%`} def={DEFAULT_LOOK.imgScale} />}
        {L.image !== "none" && <Range label="Posição horizontal" value={L.imgX} min={-50} max={50} onChange={(v) => setL({ imgX: v })} def={DEFAULT_LOOK.imgX} />}
        {L.image !== "none" && <Range label="Posição vertical" value={L.imgY} min={-50} max={50} onChange={(v) => setL({ imgY: v })} def={DEFAULT_LOOK.imgY} />}
        {L.image !== "none" && <Toggle label="Espelhar" checked={L.flip} onChange={(v) => setL({ flip: v })} />}
        {L.image !== "none" && <Toggle label="Brilho na cor do agente" checked={L.glow} onChange={(v) => setL({ glow: v })} />}
      </Group>

      <Group title="Fundo">
        <Row stack>
          <Choice label="Fundo" value={L.bg} onChange={(v) => setL({ bg: v })} options={[{ value: "gradient", label: "Degradê" }, { value: "art", label: "Arte" }, { value: "color", label: "Cor" }, { value: "custom", label: "Imagem" }]} />
        </Row>
        {(L.bg === "gradient" || L.bg === "art") && (
          <Row label="Cores" hint={L.c1 || L.c2 ? "Escolhidas por você." : "As do agente."}>
            <label className={dot} title="Primeira cor" style={{ background: L.c1 || "#ff4655" }}><input type="color" aria-label="Primeira cor" value={L.c1 || "#ff4655"} onChange={(e) => setL({ c1: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" /></label>
            <label className={dot} title="Segunda cor" style={{ background: L.c2 || "#0f1923" }}><input type="color" aria-label="Segunda cor" value={L.c2 || "#0f1923"} onChange={(e) => setL({ c2: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" /></label>
            {(L.c1 || L.c2) && <button type="button" className="wi-icon" title="Voltar às cores do agente" aria-label="Voltar às cores do agente" onClick={() => setL({ c1: undefined, c2: undefined })}><RotateCcw size={13} /></button>}
          </Row>
        )}
        {L.bg === "art" && <Range label="Força da arte" value={L.artOpacity} min={0.1} max={1} step={0.05} onChange={(v) => setL({ artOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />}
        {L.bg === "color" && <Row stack label="Cor"><Swatches label="Cor do fundo" value={L.bgColor} onChange={(v) => v && setL({ bgColor: v })} colors={["#0f1923", "#ff4655", "#ece8e1", "#111111", "#1f2937", "#3b0a45", "#0b3d2e"]} /></Row>}
        {L.bg === "custom" && <Row label="Sua imagem"><MiniButton onClick={() => setPicker("bg")}><ImagePlus size={12} /> Escolher</MiniButton></Row>}
        <Range label="Escurecer para o texto" value={L.shade} min={0} max={0.95} step={0.05} onChange={(v) => setL({ shade: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Group>

      <Group title="Nome">
        <Toggle label="Mostrar o nome" checked={L.showName} onChange={(v) => setL({ showName: v })} />
        {L.showName && <Row stack label="Texto" hint="Vazio usa o nome do agente."><TextField label="Nome mostrado" value={L.nameText ?? ""} placeholder="Nome do agente" onCommit={(v) => setL({ nameText: v || undefined })} /></Row>}
        {L.showName && <Row stack label="Posição"><Choice label="Posição do nome" value={L.namePos} onChange={(v) => setL({ namePos: v })} options={[{ value: "top", label: "Em cima" }, { value: "bottom", label: "Embaixo" }]} /></Row>}
        {L.showName && <Range label="Tamanho" value={L.nameSize} min={0.5} max={2.5} step={0.05} onChange={(v) => setL({ nameSize: v })} format={(v) => `${Math.round(v * 100)}%`} def={DEFAULT_LOOK.nameSize} />}
        {L.showName && <Row stack label="Cor"><Swatches label="Cor do nome" value={L.nameColor} onChange={(v) => v && setL({ nameColor: v })} colors={["#ffffff", "#ff4655", "#ece8e1", "#ffd36e", "#7cc8ff", "#0f1923"]} /></Row>}
        {L.showName && <Toggle label="Letras maiúsculas" checked={L.upper} onChange={(v) => setL({ upper: v })} />}
        {L.showName && <div className="p-2"><FontPicker label="Fonte do nome" value={L.font} onChange={(v) => v && setL({ font: v })} sample="JETT" /></div>}
      </Group>

      <Group title="Outros textos">
        <Row stack label="Frase embaixo do nome"><TextField label="Frase embaixo do nome" value={L.subtitle} placeholder="Opcional" onCommit={(v) => setL({ subtitle: v })} /></Row>
        <Row stack label="Cor da frase e da função"><Swatches label="Cor da frase e da função" value={L.textColor} onChange={(v) => v && setL({ textColor: v })} colors={["#ffffff", "#ece8e1", "#ff4655", "#ffd36e", "#0f1923"]} /></Row>
        <Toggle label="Função" hint="Duelista, Controlador…" checked={L.showRole} onChange={(v) => setL({ showRole: v })} />
        <Toggle label="Habilidades" checked={L.showAbilities} onChange={(v) => setL({ showAbilities: v })} />
        <Toggle label="Tempo de jogo" hint="Há quanto tempo você está jogando." checked={L.showTimer} onChange={(v) => setL({ showTimer: v })} />
      </Group>

      <Group title="Meus modelos" flush note="Salve o visual atual. Ligado a um agente, o modelo é usado sozinho quando você jogar com ele.">
        <div className="space-y-2 p-2">
          <div className="flex gap-2">
            <input className="wi-input" aria-label="Nome do modelo" placeholder="Nome do modelo" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <select className="wi-input !w-[132px] shrink-0 cursor-pointer" aria-label="Agente do modelo" value={tplAgent} onChange={(e) => setTplAgent(e.target.value)}>
              <option value="">Sem agente fixo</option>
              {agents.map((a) => <option key={a.uuid} value={a.uuid}>{a.displayName}</option>)}
            </select>
          </div>
          <MiniButton onClick={() => {
            const name = tplName.trim() || (tplAgent ? agents.find((a) => a.uuid === tplAgent)?.displayName : "") || `Modelo ${templates.length + 1}`
            setTemplates((t) => [...t.map((x) => (tplAgent && x.agent === tplAgent ? { ...x, agent: undefined } : x)), { id: uid(), name, agent: tplAgent || undefined, look: L }])
            setTplName(""); setTplAgent("")
          }}><Plus size={12} /> Salvar o visual atual</MiniButton>
        </div>
        {templates.length > 0 && (
          <div className="divide-y divide-[var(--line)] border-t border-line">
            {templates.map((t) => {
              const ag = agents.find((a) => a.uuid === t.agent)
              return (
                <div key={t.id} className="flex min-h-[42px] items-center gap-2 px-3 py-1.5">
                  {ag ? <img src={ag.displayIcon} className="size-6 rounded" draggable={false} alt="" /> : <span className="size-6 rounded" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }} />}
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.name}{ag && <span className="text-[11.5px] text-fg-muted"> · {ag.displayName}</span>}</span>
                  <MiniButton title="Aplicar no widget" onClick={() => set({ look: { ...DEFAULT_LOOK, ...t.look } })}><Check size={12} /> Usar</MiniButton>
                  <button type="button" className="wi-icon" title="Atualizar com o visual atual" aria-label="Atualizar com o visual atual" onClick={() => setTemplates((all) => all.map((x) => (x.id === t.id ? { ...x, look: L } : x)))}><Pencil size={13} /></button>
                  <button type="button" className="wi-icon hover:!text-red-400" title="Apagar" aria-label="Apagar modelo" onClick={() => setTemplates((all) => all.filter((x) => x.id !== t.id))}><Trash2 size={13} /></button>
                </div>
              )
            })}
          </div>
        )}
      </Group>

      <MediaPicker open={!!picker} onClose={() => setPicker(null)} onPick={(ids) => { if (ids[0]) setL(picker === "img" ? { customId: ids[0], image: "custom" } : { customBgId: ids[0], bg: "custom" }); setPicker(null) }} />
    </>
  )
}
