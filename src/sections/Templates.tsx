import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Undo2, Share2 } from "lucide-react"
import { DEFAULT_SETTINGS, useStore } from "@/lib/store"
import { mediaUrl } from "@/lib/bridge"
import type { LookTemplate, Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { fontFamily } from "@/lib/fonts"
import { Switch, ThemedButton } from "@/components/ui/controls"
import { GRADIENTS } from "@/components/Wallpaper"
import { TemplateSharing } from "./TemplateSharing"
import { SettingsSection } from "@/components/ui/SettingsSection"

const THEME_LABEL: Record<string, string> = { glass: "Vidro líquido", metal: "Metal", retro: "Retrô 95", terminal: "Terminal CRT", minimal: "Minimal" }

/** Miniatura do estilo: fundo, janela no tema, cor de destaque e fontes. */
function Preview({ s, widgets }: { s: Partial<Settings>; widgets?: number }) {
  const media = useStore((x) => x.media)
  const wp = { ...DEFAULT_SETTINGS.wallpaper, ...(s.wallpaper ?? {}) }
  const hasImg = wp.type === "image" && wp.image && media.some((m) => m.file === wp.image)
  const bg = hasImg ? { backgroundImage: `url("${mediaUrl(wp.image)}")`, backgroundSize: "cover", backgroundPosition: "center" } : wp.type === "color" ? { background: wp.color } : { background: (GRADIENTS[wp.gradient] ?? GRADIENTS.dusk).css }
  const accent = s.accent ?? DEFAULT_SETTINGS.accent
  const theme = s.theme ?? "glass"
  const dark = s.dark ?? true
  const r = Math.min(10, (s.radius ?? 22) / 2.2)
  const win: React.CSSProperties =
    theme === "retro" ? { background: dark ? "#2e2e33" : "#c0c0c0", boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #fff", borderRadius: 0 }
    : theme === "metal" ? { background: "linear-gradient(180deg, #5a5d64, #24262b)", border: "1px solid #000", borderRadius: r }
    : theme === "terminal" ? { background: "rgb(2 10 5 / .85)", border: `1px solid ${accent}`, boxShadow: `0 0 10px ${accent}66`, borderRadius: 3 }
    : theme === "minimal" ? { background: dark ? "rgb(18 16 22 / .75)" : "rgb(255 255 255 / .75)", border: "1px solid rgb(255 255 255 / .15)", borderRadius: r }
    : { background: "linear-gradient(135deg, rgb(255 255 255 / .22), rgb(255 255 255 / .06))", backdropFilter: "blur(6px)", border: "1px solid rgb(255 255 255 / .3)", borderRadius: r }
  const fg = theme === "retro" && !dark ? "#111" : theme === "terminal" ? accent : dark ? "#fff" : "#2a1520"
  return (
    <div className="relative h-28 overflow-hidden rounded-xl" style={bg}>
      <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${wp.dim})` }} />
      <div className="absolute top-3 left-3 w-[62%] p-2" style={{ ...win, color: fg }}>
        <div className="truncate text-[11px] font-semibold" style={{ fontFamily: fontFamily(s.displayFont ?? "playfair") }}>Widgy</div>
        <div className="mt-1 text-[9px] opacity-70" style={{ fontFamily: fontFamily(s.uiFont ?? "outfit") }}>{THEME_LABEL[theme]}</div>
        <div className="mt-1.5 flex items-center gap-1">
          <span className="h-3 w-8 rounded-full" style={{ background: accent, borderRadius: theme === "retro" ? 0 : 99 }} />
          <span className="font-num text-[10px]" style={{ fontFamily: fontFamily(s.numFont ?? "space") }}>12:34</span>
        </div>
      </div>
      <div className="absolute right-3 bottom-2 flex gap-1">
        {[0, 1, 2, 3].map((i) => <span key={i} className="h-3 w-3" style={{ background: i === 1 ? accent : "rgb(255 255 255 / .35)", borderRadius: theme === "retro" ? 0 : 4 }} />)}
      </div>
      {widgets != null && <span className="absolute top-2 right-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] text-white">+ {widgets} widgets</span>}
    </div>
  )
}

export function TemplatesTab() {
  const templates = useStore((s) => s.templates)
  const settings = useStore((s) => s.settings)
  const undo = useStore((s) => s.templateUndo)
  const { saveTemplate, updateTemplate, renameTemplate, deleteTemplate, applyTemplate, undoTemplate } = useStore.getState()
  const [name, setName] = useState("")
  const [withWidgets, setWithWidgets] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [sharing, setSharing] = useState<LookTemplate | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const ping = (id: string) => { setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400) }

  return (
    <div className="space-y-5">
      <SettingsSection title="Salvar o estilo atual" desc="Guarda tema, cores, fontes, cursor, ícones, barra de tarefas, papel de parede e efeitos. Seus hábitos, listas, serviços e estudos nunca são alterados por templates.">
        <div className="flex items-center gap-3">
          <div className="w-44 shrink-0"><Preview s={settings} widgets={withWidgets ? useStore.getState().widgets.length : undefined} /></div>
          <div className="min-w-0 flex-1 space-y-2">
            <input
              className="field w-full"
              placeholder="Nome do template (ex.: Sakura noturno, Retrô de domingo…)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { const t = saveTemplate(name, withWidgets); setName(""); ping(t.id) } }}
            />
            <Switch label="Incluir a posição e o estilo dos widgets da área de trabalho" checked={withWidgets} onChange={setWithWidgets} />
            <ThemedButton size="sm" disabled={!name.trim()} onClick={() => { const t = saveTemplate(name, withWidgets); setName(""); ping(t.id) }}>
              <Plus size={14} /> Salvar template
            </ThemedButton>
          </div>
        </div>
      </SettingsSection>

      <TemplateSharing selected={sharing} onClose={() => setSharing(null)} />

      <AnimatePresence>
        {undo && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
              <Undo2 size={18} className="shrink-0" />
              <div className="min-w-0 flex-1 text-sm">Você aplicou <b>{undo.name}</b>. Não gostou? Dá para voltar exatamente como estava antes.</div>
              <button className="btn" onClick={undoTemplate}><RotateCcw size={14} /> Voltar como estava</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSection title="Templates salvos">
      <div className="grid grid-cols-2 gap-3 pt-1">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            t={t}
            flash={flash === t.id}
            editing={editing === t.id}
            onEdit={() => setEditing(t.id)}
            onRename={(n) => { renameTemplate(t.id, n); setEditing(null) }}
            onShare={() => setSharing(t)}
            onApply={() => { applyTemplate(t.id); ping(t.id) }}
            onUpdate={() => { if (confirm(`Substituir "${t.name}" pelo estilo que está agora na tela?`)) { updateTemplate(t.id); ping(t.id) } }}
            onDelete={() => confirm(`Excluir o template "${t.name}"?`) && deleteTemplate(t.id)}
          />
        ))}
        {/* sempre disponível: o visual original do app */}
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-3">
          <Preview s={DEFAULT_SETTINGS} />
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">Padrão do Widgy</div>
              <div className="text-xs text-fg-muted">O visual original do app</div>
            </div>
            <button className="btn !py-1.5 text-xs" onClick={() => applyTemplate("default")}>Aplicar</button>
          </div>
        </div>
      </div>
      </SettingsSection>
      {templates.length === 0 && <div className="text-center text-sm text-fg-muted">Nenhum template ainda. Personalize do seu jeito e salve acima — depois é só um clique para voltar a ele.</div>}
    </div>
  )
}

function TemplateCard({ t, flash, editing, onEdit, onRename, onApply, onUpdate, onDelete, onShare }: {
  t: LookTemplate; flash: boolean; editing: boolean
  onEdit: () => void; onRename: (n: string) => void; onApply: () => void; onUpdate: () => void; onDelete: () => void; onShare: () => void
}) {
  return (
    <motion.div layout className={cn("group flex flex-col gap-2 rounded-2xl border p-3 transition-colors", flash ? "border-brand" : "border-line")} style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
      <div className="relative">
        <Preview s={t.settings} widgets={t.widgets?.length} />
        <AnimatePresence>
          {flash && (
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/35">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white"><Check size={20} /></span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input autoFocus className="field w-full !py-1 text-sm" defaultValue={t.name} onBlur={(e) => onRename(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onRename((e.target as HTMLInputElement).value)} />
          ) : (
            <div className="truncate font-semibold" onDoubleClick={onEdit}>{t.name}</div>
          )}
          <div className="text-xs text-fg-muted">{new Date(t.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}{(t.widgets ? " · com widgets" : "") + (t.source === "shared" ? " · importado" : "")}</div>
        </div>
        <button className="btn !py-1.5 text-xs" onClick={onApply}>Aplicar</button>
      </div>
      <div className="flex flex-wrap gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        <button className="btn btn-ghost flex-1 !py-1 text-xs" title="Compartilhar" onClick={onShare}><Share2 size={12} /> Compartilhar</button>
        <button className="btn btn-ghost flex-1 !py-1 text-xs" title="Renomear" onClick={onEdit}><Pencil size={12} /> Renomear</button>
        <button className="btn btn-ghost flex-1 !py-1 text-xs" title="Guardar o estilo atual neste template" onClick={onUpdate}><RefreshCw size={12} /> Atualizar</button>
        <button className="btn btn-ghost !py-1 text-xs hover:!text-red-400" title="Excluir" onClick={onDelete}><Trash2 size={12} /></button>
      </div>
    </motion.div>
  )
}
