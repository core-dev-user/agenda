import { useEffect, useState } from "react"
import { Clipboard, Download, Link2, Plus, Share2, ShieldCheck, X } from "lucide-react"
import { useStore, lookOf } from "@/lib/store"
import { uid } from "@/lib/utils"
import { toast } from "@/lib/toast"
import type { LookTemplate } from "@/lib/types"
import {
  decodeTemplate, encodeTemplate, importedTemplate, shareLink, consumeShareLink,
  type SharedTemplate,
} from "@/lib/templateShare"
import { Card, ThemedButton } from "@/components/ui/controls"
import { SettingsSection } from "@/components/ui/SettingsSection"

type InstallMode = "save" | "replace" | "add"

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast("Copiado para a área de transferência!")
  } catch {
    toast("Não foi possível copiar automaticamente. Selecione o texto e copie.")
  }
}

/** A interface não executa scripts recebidos: só pré-visualiza dados sanitizados. */
export function TemplateSharing({ selected, onClose }: { selected: LookTemplate | null; onClose: () => void }) {
  const [code, setCode] = useState("")
  const [link, setLink] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")
  const [input, setInput] = useState("")
  const [preview, setPreview] = useState<SharedTemplate | null>(null)
  const [checking, setChecking] = useState(false)
  const [installed, setInstalled] = useState("")
  const [busyInstall, setBusyInstall] = useState(false)

  useEffect(() => {
    if (!selected) { setCode(""); setLink(null); return }
    let alive = true
    setGenerating(true)
    setError("")
    setCode("")
    void encodeTemplate(selected).then((value) => {
      if (!alive) return
      setCode(value)
      setLink(shareLink(value))
    }).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : "Não foi possível criar o código.")
    }).finally(() => { if (alive) setGenerating(false) })
    return () => { alive = false }
  }, [selected])

  const inspect = async (value: string) => {
    setError("")
    setInstalled("")
    setChecking(true)
    setPreview(null)
    try {
      const result = await decodeTemplate(value)
      setPreview(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Código inválido.")
    } finally { setChecking(false) }
  }

  useEffect(() => {
    const incoming = () => {
      const value = consumeShareLink()
      if (value) {
        setInput(value)
        void inspect(value)
      }
    }
    incoming()
    window.addEventListener("widgy:template-link", incoming)
    return () => window.removeEventListener("widgy:template-link", incoming)
  }, [])

  const install = (mode: InstallMode) => {
    if (!preview || busyInstall) return
    if (mode === "replace" && !confirm("Aplicar este template no lugar da aparência e dos widgets atuais? Você poderá desfazer.")) return
    setBusyInstall(true)
    try {
      const template = importedTemplate(preview, uid)
      if (mode === "add" && !template.widgets?.length) return
      const state = useStore.getState()
      if (mode === "add") {
        useStore.setState((s) => ({
          templates: [...s.templates, template],
          templateUndo: { name: template.name, settings: lookOf(s.settings), widgets: structuredClone(s.widgets) },
          widgets: [...s.widgets, ...(template.widgets ?? [])],
        }))
      } else {
        useStore.setState({ templates: [...state.templates, template] })
        if (mode === "replace") useStore.getState().applyTemplate(template.id)
      }
      setInstalled(template.name)
      setPreview(null)
      setInput("")
      toast(mode === "save" ? "Template salvo na biblioteca." : "Template importado e aplicado.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível importar o template.")
    } finally { setBusyInstall(false) }
  }

  return (
    <div className="space-y-4">
      {selected && (
        <Card>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-semibold"><Share2 size={16} /> Compartilhar {selected.name}</div>
              <p className="mt-1 text-xs text-fg-muted">Envie o código ou o link. O destinatário pode importar sem conta e sem servidor.</p>
            </div>
            <button className="btn btn-ghost !p-2" title="Fechar" onClick={onClose}><X size={16}/></button>
          </div>
          {generating && <div className="text-sm text-fg-muted">Compactando o template…</div>}
          {!generating && code && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-medium">Código de importação</div>
                <textarea value={code} readOnly spellCheck={false} onFocus={(e) => e.currentTarget.select()}
                  className="field h-20 w-full resize-none break-all font-mono text-[11px]" aria-label="Código do template" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <ThemedButton size="sm" onClick={() => void copyText(code)}><Clipboard size={14} /> Copiar código</ThemedButton>
                  {link ? (
                    <button className="btn !py-1.5 text-xs" onClick={() => void copyText(link)}><Link2 size={14} /> Copiar link</button>
                  ) : (
                    <span className="self-center text-xs text-fg-muted">Template grande: compartilhe pelo código, sem link.</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-fg-muted">O compartilhamento transfere o visual e os widgets permitidos, mas não envia fotos locais, textos de notas, contas, arquivos ou dados pessoais. Arquivos de mídia devem ser importados separadamente.</p>
            </div>
          )}
        </Card>
      )}
      <SettingsSection title="Importar template compartilhado" desc="Cole um código WDG1 ou link widgy://template/… de outra pessoa. Veja a prévia antes de aplicar.">
        <textarea className="field mb-2 min-h-20 w-full resize-y text-xs" maxLength={18000} spellCheck={false}
          placeholder="Cole aqui o código WDG1-… ou o link widgy://template/…"
          value={input} onChange={(e) => { setInput(e.target.value); setPreview(null); setError("") }} />
        <ThemedButton size="sm" disabled={checking || !input.trim()} onClick={() => void inspect(input)}>
          <ShieldCheck size={14} /> {checking ? "Validando…" : "Verificar código"}
        </ThemedButton>
        {installed && <div className="mt-3 text-sm text-emerald-400">“{installed}” foi importado para sua biblioteca.</div>}
        {error && <div className="mt-3 rounded-lg border border-red-400/30 p-3 text-sm text-red-400" role="alert">{error}</div>}
        {preview && (
          <div className="mt-4 space-y-3 rounded-xl border border-line p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-white/10 text-sm"
                style={{ background: preview.settings.accent || "var(--accent)", color: preview.settings.dark === false ? "#111" : "#fff" }}>
                {preview.settings.theme === "retro" ? "95" : "Widgy"}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{preview.name}</div>
                <p className="text-xs text-fg-muted">{preview.settings.theme ?? "Visual"} · {preview.widgets?.length ?? 0} widgets · prévia validada</p>
              </div>
            </div>
            <p className="text-xs text-fg-muted">Escolha como importar. Salvar não altera a área de trabalho; substituir cria um ponto para desfazer; adicionar mantém o visual atual.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn !py-1.5 text-xs" disabled={busyInstall} onClick={() => install("save")}><Download size={13}/> Salvar na biblioteca</button>
              <ThemedButton size="sm" disabled={busyInstall} onClick={() => install("replace")}><Share2 size={13}/> Substituir visual</ThemedButton>
              <button className="btn !py-1.5 text-xs" disabled={busyInstall || !preview.widgets?.length} onClick={() => install("add")}><Plus size={13}/> Adicionar widgets</button>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
