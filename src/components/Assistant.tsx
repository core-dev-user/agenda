import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Bot, Cpu, Download, Loader2, Send, Undo2, X } from "lucide-react"
import { create } from "zustand"
import { useStore } from "@/lib/store"
import { AI_MODELS, ask, preloadAi, type AiModel } from "@/lib/assistant"
import { cn } from "@/lib/utils"

export const useAssistant = create<{ open: boolean; draft: string }>(() => ({ open: false, draft: "" }))
export const openAssistant = (draft = "") => useAssistant.setState({ open: true, draft })

interface Turn { id: number; me: string; said?: string; undo?: () => void; undone?: boolean; ai?: boolean; error?: boolean }

const IDEAS = ["Arruma os widgets bem encaixados", "Coloca um relógio e o clima", "Deixa com tema escuro e cor rosa", "Abre Finanças"]

function Panel() {
  const draft = useAssistant((s) => s.draft)
  const ai = useStore((s) => s.settings.ai) ?? { on: false, model: "small" as AiModel }
  const set = useStore((s) => s.setSettings)
  const [text, setText] = useState(draft)
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState<{ pct: number; msg: string } | null>(null)
  const [installing, setInstalling] = useState<{ pct: number; msg: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const close = () => useAssistant.setState({ open: false, draft: "" })
  useEffect(() => { box.current?.scrollTo({ top: 1e9, behavior: "smooth" }) }, [turns, busy])
  useEffect(() => { if (draft) send(draft) }, [])

  const send = async (t = text) => {
    t = t.trim()
    if (!t || busy) return
    setText("")
    const id = Date.now()
    setTurns((x) => [...x, { id, me: t }])
    setBusy({ pct: 0, msg: "" })
    try {
      const r = await ask(t, ai.model, ai.on, (pct, msg) => setBusy({ pct, msg }))
      setTurns((x) => x.map((u) => (u.id === id ? { ...u, said: r.said, undo: r.undo, ai: r.usedAi } : u)))
    } catch (e: any) {
      setTurns((x) => x.map((u) => (u.id === id ? { ...u, said: "A IA falhou: " + (e?.message || e), error: true } : u)))
    }
    setBusy(null)
  }

  const install = async (model: AiModel) => {
    setInstalling({ pct: 0, msg: "Preparando…" })
    try {
      await preloadAi(model, (pct, msg) => setInstalling({ pct, msg }))
      set({ ai: { on: true, model } })
    } catch (e: any) {
      setTurns((x) => [...x, { id: Date.now(), me: "", said: "Não deu para baixar a IA: " + (e?.message || e), error: true }])
    }
    setInstalling(null)
  }

  return (
    <motion.div
      data-modal
      className="surface fixed right-5 bottom-[calc(var(--tb-size)+44px)] z-[1500] flex max-h-[min(640px,calc(100vh-140px))] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-hidden"
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Bot size={17} className="text-[var(--accent)]" />
        <div className="flex-1 font-semibold">Assistente</div>
        <span className="text-[11px] text-fg-muted">Ctrl+J</span>
        <button aria-label="Fechar" className="btn btn-ghost btn-icon" onClick={close}><X size={15} /></button>
      </div>

      <div ref={box} className="min-h-[160px] flex-1 space-y-3 overflow-y-auto p-4">
        {!turns.length && (
          <div className="space-y-2">
            <div className="text-sm text-fg-muted">Peça em português e eu faço. Por exemplo:</div>
            <div className="flex flex-wrap gap-1.5">
              {IDEAS.map((i) => <button key={i} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]" onClick={() => send(i)}>{i}</button>)}
            </div>
          </div>
        )}
        {turns.map((u) => (
          <div key={u.id} className="space-y-1.5">
            {u.me && <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-3 py-1.5 text-sm">{u.me}</div>}
            {u.said && (
              <div className={cn("w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] px-3 py-1.5 text-sm", u.error && "text-red-300")}>
                {u.said}
                {u.undo && !u.undone && (
                  <button className="mt-1 flex items-center gap-1 text-xs text-fg-muted hover:text-fg" onClick={() => { u.undo!(); setTurns((x) => x.map((v) => (v.id === u.id ? { ...v, undone: true } : v))) }}>
                    <Undo2 size={12} /> Desfazer
                  </button>
                )}
                {u.undone && <div className="mt-1 text-xs text-fg-muted">Desfeito.</div>}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 size={14} className="animate-spin" /> {busy.msg || "Pensando…"}{busy.pct > 0 && busy.pct < 100 ? ` ${Math.round(busy.pct)}%` : ""}
          </div>
        )}
      </div>

      {!ai.on && (
        <div className="border-t border-line px-4 py-3 text-xs">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold"><Cpu size={13} /> IA local (opcional)</div>
          <div className="mb-2 text-fg-muted">Pedidos simples já funcionam. Para entender pedidos livres, baixe uma IA que roda no seu PC — de graça, sem internet depois do download, e nada sai do computador.</div>
          {installing ? (
            <div>
              <div className="mb-1 text-fg-muted">{installing.msg} {Math.round(installing.pct)}%</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: installing.pct + "%" }} /></div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              {(Object.keys(AI_MODELS) as AiModel[]).map((m) => (
                <button key={m} className="btn flex-1 !py-1.5 text-xs" onClick={() => install(m)}><Download size={12} /> {AI_MODELS[m].label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1.5 border-t border-line p-2.5">
        <input
          autoFocus
          className="field min-w-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="O que você quer que eu faça?"
          onKeyDown={(e) => { if (e.key === "Enter") send() }}
        />
        <button aria-label="Enviar" className="btn btn-primary btn-icon" disabled={!!busy || !text.trim()} onClick={() => send()}><Send size={15} /></button>
      </div>
      {ai.on && (
        <div className="flex items-center gap-2 px-3 pb-2 text-[10px] text-fg-muted">
          IA local: {AI_MODELS[ai.model].label}
          <button className="underline" onClick={() => set({ ai: { ...ai, on: false } })}>desligar</button>
          <button className="underline" onClick={() => install(ai.model === "small" ? "big" : "small")}>trocar para {AI_MODELS[ai.model === "small" ? "big" : "small"].label}</button>
        </div>
      )}
    </motion.div>
  )
}

/** painel do assistente + atalho Ctrl+J */
export function Assistant() {
  const open = useAssistant((s) => s.open)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); useAssistant.setState((s) => ({ open: !s.open, draft: "" })) }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
  return createPortal(<AnimatePresence>{open && <Panel />}</AnimatePresence>, document.body)
}
