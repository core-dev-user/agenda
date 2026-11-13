import { useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { bridge, type BarConfig } from "@/lib/bridge"
import { cn } from "@/lib/utils"

/**
 * Estado do atalho da tecla Windows, em palavras: se está pegando a tecla, por que não está, e o que aconteceu na
 * última vez que ela foi apertada. Atualiza sozinho enquanto está na tela.
 */
export function WinKeyStatus({ className }: { className?: string }) {
  const [bar, setBar] = useState<BarConfig | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    const read = () => void bridge.bar.get().then((b) => { if (alive) { setBar(b); setNow(Date.now()) } }).catch(() => {})
    read()
    const t = window.setInterval(read, 1500)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const k = bar?.keyStatus
  if (!bar || !k) return null

  let tone: "ok" | "warn" | "err" = "ok"
  let text: string
  if (k.hook === "error") { tone = "err"; text = k.error || "O atalho de teclado não conseguiu ligar." }
  else if (!k.wanted) { tone = "warn"; text = "Desligado agora: " + (k.policy || "sem motivo informado") + "." }
  else if (k.hook === "starting" || k.hook === "off") { tone = "warn"; text = "Ligando o atalho de teclado…" }
  else if (!k.winAlone) { tone = "warn"; text = "A tecla Windows está indo para o Iniciar do Windows (a opção acima está desligada)." }
  else text = "Pronto: a tecla Windows abre o Iniciar do Widgy."

  const ago = k.lastKeyAt ? Math.max(0, Math.round((now - k.lastKeyAt) / 1000)) : -1
  const last = ago < 0 ? "" : `Última tecla Windows: ${k.lastKey === "start" ? "abriu o Iniciar do Widgy" : "foi para o Iniciar do Windows"}, há ${ago < 60 ? ago + " s" : Math.round(ago / 60) + " min"}.`
  const dot = tone === "ok" ? "#4ade80" : tone === "warn" ? "#fbbf24" : "#f87171"

  return (
    <div className={cn("rounded-[10px] px-3 py-2 text-xs leading-relaxed", className)} style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <span className="mt-[5px] size-2 shrink-0 rounded-full" style={{ background: dot, boxShadow: `0 0 0 3px color-mix(in srgb, ${dot} 22%, transparent)` }} />
        <div className="min-w-0 flex-1">
          <div className="text-fg">{text}</div>
          {last && <div className="text-fg-muted">{last}</div>}
          {k.engine === "powershell" && k.hook === "on" && <div className="text-fg-muted">Usando o modo de compatibilidade (PowerShell). Na próxima vez que o Widgy abrir, ele usa o ajudante próprio, que liga mais rápido.</div>}
          {tone !== "ok" && <div className="mt-0.5 text-fg-muted">Registro para diagnóstico: {k.log}</div>}
        </div>
        <button type="button" disabled={busy} title="Desliga e liga de novo o atalho de teclado"
          className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
          onClick={async () => { setBusy(true); try { setBar(await bridge.bar.set({ restartKeys: true })) } finally { setTimeout(() => setBusy(false), 1200) } }}>
          <RotateCcw size={11} /> Reiniciar
        </button>
      </div>
    </div>
  )
}
