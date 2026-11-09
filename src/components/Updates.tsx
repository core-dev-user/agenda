import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Download, Loader2, RefreshCw, RotateCw, X } from "lucide-react"
import { bridge, type UpdateState } from "@/lib/bridge"
import { Card } from "@/components/ui/controls"

/** estado da atualização automática (vem do processo principal) */
export function useUpdate() {
  const [st, setSt] = useState<UpdateState | null>(null)
  useEffect(() => {
    if (!bridge.update) return
    bridge.update.get().then(setSt).catch(() => {})
    return bridge.update.onState(setSt)
  }, [])
  return st
}

/** aviso no canto quando a versão nova já foi baixada */
export function UpdatePrompt() {
  const st = useUpdate()
  const [later, setLater] = useState("")
  const show = st?.status === "ready" && later !== st.version
  return (
    <AnimatePresence>
      {show && st && (
        <motion.div
          className="surface fixed top-4 right-4 z-[5000] w-[320px] p-4"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div className="flex items-start gap-3">
            <Download size={18} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Versão {st.version} pronta</div>
              <div className="mt-0.5 text-xs text-fg-muted">Reinicie para atualizar. Se preferir, ela é instalada sozinha na próxima vez que você fechar o Agenda.</div>
              <div className="mt-3 flex gap-2">
                <button className="btn !py-1 text-xs" onClick={() => bridge.update?.install()}><RotateCw size={12} /> Reiniciar agora</button>
                <button className="btn btn-ghost !py-1 text-xs" onClick={() => setLater(st.version)}>Depois</button>
              </div>
            </div>
            <button className="text-fg-muted hover:text-fg" onClick={() => setLater(st.version)} title="Fechar"><X size={14} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Configurações › Sistema */
export function UpdatesSection() {
  const st = useUpdate()
  const [busy, setBusy] = useState(false)
  if (!bridge.update || !st) return null
  const line =
    !st.enabled ? "Rodando pelo código: as atualizações automáticas só funcionam no Agenda instalado pelo instalador."
    : st.status === "checking" ? "Procurando…"
    : st.status === "downloading" ? `Baixando a versão ${st.version}… ${st.percent}%`
    : st.status === "ready" ? `Versão ${st.version} baixada. Reinicie para instalar.`
    : st.status === "none" ? "Você está com a versão mais nova."
    : st.status === "error" ? `Não consegui procurar agora (${st.error || "sem conexão"}).`
    : "O Agenda procura atualizações sozinho ao abrir e a cada 3 horas."
  return (
    <Card>
      <div className="font-display mb-1 text-lg font-semibold">Atualizações</div>
      <div className="mb-3 text-sm text-fg-muted">Versão instalada: <b className="text-fg">{st.current}</b>. As versões novas são baixadas em segundo plano; seus widgets, tarefas e configurações continuam iguais.</div>
      <div className="flex items-center gap-2 text-sm">
        {st.status === "checking" || st.status === "downloading" ? <Loader2 size={15} className="animate-spin text-fg-muted" /> : st.status === "none" || st.status === "ready" ? <CheckCircle2 size={15} className="text-[#5ee3a1]" /> : null}
        <span>{line}</span>
      </div>
      <div className="mt-3 flex gap-2">
        {st.status === "ready" ? (
          <button className="btn !py-1 text-xs" onClick={() => bridge.update?.install()}><RotateCw size={12} /> Reiniciar e atualizar</button>
        ) : (
          <button className="btn !py-1 text-xs" disabled={!st.enabled || busy || st.status === "checking" || st.status === "downloading"} onClick={async () => { setBusy(true); await bridge.update?.check(); setBusy(false) }}>
            <RefreshCw size={12} /> Procurar agora
          </button>
        )}
      </div>
    </Card>
  )
}
