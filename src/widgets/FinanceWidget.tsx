import { useEffect } from "react"
import { Glyph } from "@/components/Glyph"
import { Lock } from "lucide-react"
import { useStore } from "@/lib/store"
import { useFinance } from "@/lib/financeStore"
import { summary, ym } from "@/lib/finance"
import { brl } from "@/lib/utils"
import type { Widget } from "@/lib/types"

/** Widget de Finanças: gastos do mês e as categorias que mais pesaram (com o limite do orçamento). */
export function FinanceWidget({ w }: { w: Widget }) {
  const fin = useFinance()
  const open = useStore((s) => s.openWindow)
  useEffect(() => { if (fin.status === "idle") fin.check() }, [])
  const header = (
    <div className="flex items-center gap-2">
      <img src="logos/financas.svg" className="h-6 w-6" draggable={false} />
      <div className="flex-1 text-sm font-semibold">Finanças</div>
    </div>
  )
  if (fin.status !== "open")
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <button className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-fg-muted" onClick={() => open("finance")}><Lock size={20} /> Toque para desbloquear</button>
      </div>
    )
  const m = ym(new Date())
  const s = summary(fin.data, m)
  const money = (n: number) => (fin.hidden ? "R$ ••••" : brl(n))
  const cats = new Map(fin.data.categories.map((c) => [c.id, c]))
  const top = [...s.byCat].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, Math.max(2, Math.floor((w.h - 150) / 34)))
  const max = Math.max(1, ...top.map(([id, v]) => Math.max(v, cats.get(id)?.budget ?? 0)))
  return (
    <button className="flex h-full w-full flex-col gap-2.5 p-3.5 text-left" onClick={() => open("finance")}>
      {header}
      <div>
        <div className="font-num text-3xl font-semibold">{money(s.expense)}</div>
        <div className="text-xs text-fg-muted">gastos em {new Date().toLocaleDateString("pt-BR", { month: "long" })}{s.income ? ` · entradas ${money(s.income)}` : ""}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
        {top.map(([id, v]) => {
          const c = cats.get(id)
          const over = !!c?.budget && v > c.budget
          return (
            <div key={id}>
              <div className="flex justify-between text-xs"><span className="flex min-w-0 items-center gap-1.5 truncate"><Glyph v={c?.emoji} size={12} style={{ color: c?.color }} /> {c?.name}</span><span className="font-num">{money(v)}</span></div>
              <div className="relative mt-0.5 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
                <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: over ? "#ff6b8b" : "var(--viz-1)" }} />
                {c?.budget ? <div className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-fg opacity-60" style={{ left: `${(c.budget / max) * 100}%` }} /> : null}
              </div>
            </div>
          )
        })}
        {!top.length && <div className="text-sm text-fg-muted">Importe um extrato na aba Finanças.</div>}
      </div>
    </button>
  )
}
