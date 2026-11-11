import { create } from "zustand"
import { bridge } from "./bridge"
import { defaultData, normalize, categorize, type FinData, type FinRule, type Txn } from "./finance"
import { uid } from "./utils"

interface FinState {
  status: "idle" | "locked" | "open"
  hasPin: boolean
  data: FinData
  /** esconder os valores (R$ ••••) */
  hidden: boolean
  check: () => Promise<void>
  unlock: (pin?: string) => Promise<{ ok: boolean; error?: string; waitMs?: number }>
  lock: () => Promise<void>
  update: (fn: (d: FinData) => FinData) => void
  setHidden: (v: boolean) => void
  /** muda a categoria e aprende: os próximos com a mesma descrição já vêm certos */
  recategorize: (txnId: string, categoryId: string, learn: boolean) => number
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingData: FinData | null = null
const persistPending = async (): Promise<boolean> => {
  if (!pendingData) return true
  const snapshot = pendingData
  try {
    const ok = await bridge.finance.save(JSON.stringify(snapshot))
    if (ok && pendingData === snapshot) pendingData = null
    return ok
  } catch { return false }
}
const save = (d: FinData) => {
  pendingData = d
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; void persistPending() }, 400)
}

export const useFinance = create<FinState>()((set, get) => ({
  status: "idle",
  hasPin: false,
  data: defaultData(),
  hidden: (() => { try { return localStorage.getItem("fin-hidden") === "1" } catch { return false } })(),
  check: async () => {
    const st = await bridge.finance.status()
    set({ hasPin: st.hasPin })
    if (get().status === "open" && (st.unlocked || !st.hasPin)) return
    if (st.hasPin && !st.unlocked) { set({ status: "locked" }); return }
    await get().unlock()
  },
  unlock: async (pin) => {
    const r = await bridge.finance.open(pin)
    if (!r.ok) return { ok: false, error: r.error, waitMs: r.waitMs }
    let data = defaultData()
    try { if (r.data) data = { ...defaultData(), ...JSON.parse(r.data) } } catch {}
    set({ data, status: "open" })
    return { ok: true }
  },
  lock: async () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    if (!await persistPending() || !await bridge.finance.drain()) {
      console.error("Finanças: a gravação não terminou; mantendo a aba aberta")
      return
    }
    await bridge.finance.lock()
    const st = await bridge.finance.status()
    // Após bloquear com PIN, libera os dados financeiros da memória do renderer.
    set({ hasPin: st.hasPin, status: st.hasPin ? "locked" : "open", ...(st.hasPin ? { data: defaultData() } : {}) })
  },
  update: (fn) => {
    const d = fn(get().data)
    set({ data: d })
    save(d)
  },
  setHidden: (v) => { try { localStorage.setItem("fin-hidden", v ? "1" : "0") } catch {} set({ hidden: v }) },
  recategorize: (txnId, categoryId, learn) => {
    const d = get().data
    const t = d.txns.find((x) => x.id === txnId)
    if (!t) return 0
    let rules = d.rules
    let others = 0
    if (learn && t.key) {
      const match = t.key
      rules = [...rules.filter((r) => r.match !== match), { id: uid(), match, categoryId, createdAt: Date.now() } as FinRule]
    }
    const txns = d.txns.map((x): Txn => {
      if (x.id === txnId) return { ...x, categoryId, manual: true, review: false }
      // aplica nos outros iguais que não foram escolhidos à mão
      if (learn && !x.manual && x.key === t.key && x.categoryId !== categoryId) { others++; return { ...x, categoryId, review: false } }
      return x
    })
    get().update(() => ({ ...d, rules, txns }))
    return others
  },
}))

/** reaplica as regras em tudo que não foi escolhido à mão (ex.: depois de apagar uma regra) */
export function reapply(d: FinData): FinData {
  return { ...d, txns: d.txns.map((t) => (t.manual ? t : { ...t, ...categorize(t.key || normalize(t.desc), t.amount, d.rules, d.categories) })) }
}

// Encerrou a janela antes do debounce de 400ms? O IPC síncrono grava a última
// versão criptografada no disco; não coloca os dados financeiros no localStorage.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const state = useFinance.getState()
    if (state.status !== "open") return
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    try {
      if (bridge.finance.saveSync(JSON.stringify(state.data))) pendingData = null
    } catch (error) { console.error("Finanças: falha na gravação ao fechar", error) }
  })
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !pendingData) return
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    void persistPending()
  })
}
