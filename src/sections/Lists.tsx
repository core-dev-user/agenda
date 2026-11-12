import { useState } from "react"
import { Glyph } from "@/components/Glyph"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import type { ListItem, ShopList } from "@/lib/types"
import { brl, cn, uid } from "@/lib/utils"
import { Card, Empty, Modal, Stat, ThemedButton } from "@/components/ui/controls"
import { IconPicker } from "@/components/IconPicker"

const PRI = [
  { label: "Baixa", c: "#9aa4ff" },
  { label: "Média", c: "#ffd36e" },
  { label: "Alta", c: "#ff6b8b" },
]

export default function Lists() {
  const lists = useStore((s) => s.lists)
  const setKey = useStore((s) => s.set)
  const [selId, setSel] = useState<string | null>(lists[0]?.id ?? null)
  const sel = lists.find((l) => l.id === selId) ?? null
  const upd = (p: Partial<ShopList>) => sel && setKey("lists", (ls) => ls.map((l) => (l.id === sel.id ? { ...l, ...p } : l)))

  const [creating, setCreating] = useState(false)
  const add = (name: string, emoji: string) => {
    const l: ShopList = { id: uid(), name: name.trim() || "Nova lista", emoji, budget: 0, items: [] }
    setKey("lists", (ls) => [...ls, l])
    setSel(l.id)
    setCreating(false)
  }

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 space-y-1 overflow-auto border-r border-line p-3">
        {lists.map((l) => {
          const tot = l.items.reduce((a, i) => a + i.price * i.qty, 0)
          return (
            <button key={l.id} onClick={() => setSel(l.id)} className={cn("w-full rounded-xl p-2.5 text-left transition-colors", l.id === selId ? "bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
              <div className="flex items-center gap-2"><Glyph v={l.emoji} size={16} className="text-fg-muted" /><span className="flex-1 truncate font-medium">{l.name}</span></div>
              <div className="font-num mt-0.5 text-xs text-fg-muted">{l.items.filter((i) => i.checked).length}/{l.items.length} · {brl(tot)}</div>
            </button>
          )
        })}
        <button className="btn mt-2 w-full" onClick={() => setCreating(true)}><Plus size={14} /> Lista</button>
      </aside>
      {creating && <ListDialog onClose={() => setCreating(false)} onSave={add} />}
      <div className="min-w-0 flex-1 overflow-auto p-6">
        {sel ? <ListView key={sel.id} l={sel} upd={upd} remove={() => { setKey("lists", (ls) => ls.filter((x) => x.id !== sel.id)); setSel(null) }} /> : <Empty icon="🛒" title="Crie uma lista" />}
      </div>
    </div>
  )
}

/** Criar lista: nome + ícone escolhido numa grade de emojis. */
function ListDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string, emoji: string) => void }) {
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("i:ShoppingBag")
  return (
    <Modal open onClose={onClose} title="Nova lista" width={420}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}>{emoji}</div>
          <input
            autoFocus
            className="field min-w-0 flex-1 text-lg"
            placeholder="Nome da lista (ex.: Mercado do mês)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSave(name, emoji)}
          />
        </div>
        <div className="text-sm text-fg-muted">Ícone</div>
        <IconPicker value={emoji} onPick={setEmoji} className="!w-full" />
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <ThemedButton onClick={() => onSave(name, emoji)}><Plus size={14} /> Criar lista</ThemedButton>
        </div>
      </div>
    </Modal>
  )
}

/** Ícone clicável que abre o seletor (trocar o ícone de uma lista existente). */
function IconButton({ value, onPick }: { value: string; onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className="group relative flex h-12 w-12 items-center justify-center rounded-2xl transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]" title="Trocar o ícone" onClick={() => setOpen(true)}>
        <Glyph v={value} size={26} />
        <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white opacity-0 transition-opacity group-hover:opacity-100"><Pencil size={10} /></span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
            <motion.div className="surface absolute top-full left-0 z-50 mt-2 p-3" style={{ background: "color-mix(in srgb, #1b1220 94%, transparent)" }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <IconPicker value={value} onPick={(e) => { onPick(e); setOpen(false) }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ListView({ l, upd, remove }: { l: ShopList; upd: (p: Partial<ShopList>) => void; remove: () => void }) {
  const [hide, setHide] = useState(false)
  const [sort, setSort] = useState<"manual" | "price" | "priority">("manual")
  const [draft, setDraft] = useState({ name: "", qty: 1, price: 0 })
  const setItem = (id: string, p: Partial<ListItem>) => upd({ items: l.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })

  const total = l.items.reduce((a, i) => a + i.price * i.qty, 0)
  const bought = l.items.filter((i) => i.checked).reduce((a, i) => a + i.price * i.qty, 0)
  let items = hide ? l.items.filter((i) => !i.checked) : l.items
  if (sort === "price") items = [...items].sort((a, b) => b.price * b.qty - a.price * a.qty)
  if (sort === "priority") items = [...items].sort((a, b) => b.priority - a.priority)
  items = [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)]

  const addItem = () => {
    if (!draft.name.trim()) return
    upd({ items: [...l.items, { id: uid(), name: draft.name.trim(), qty: draft.qty || 1, price: draft.price || 0, checked: false, link: "", priority: 1 }] })
    setDraft({ name: "", qty: 1, price: 0 })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <IconButton value={l.emoji} onPick={(e) => upd({ emoji: e })} />
        <input className="font-display min-w-0 flex-1 rounded-lg bg-transparent px-1 text-3xl font-semibold outline-none hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] focus:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]" title="Clique para renomear" value={l.name} onChange={(e) => upd({ name: e.target.value })} />
        <button aria-label="Excluir lista" className="btn hover:!text-red-400" onClick={() => confirm(`Excluir a lista "${l.name}"?`) && remove()}><Trash2 size={14} /></button>
      </div>
      <div className="flex gap-3">
        <Stat label="Total da lista" value={brl(total)} sub={`${l.items.length} itens`} />
        <Stat label="Já comprado" value={brl(bought)} tone="#5ee3a1" sub={`${l.items.filter((i) => i.checked).length} itens`} />
        <Stat label="Falta comprar" value={brl(total - bought)} tone="#ffd36e" />
        <Card className="min-w-0 flex-1">
          <div className="text-xs tracking-wide text-fg-muted uppercase">Orçamento</div>
          <input type="number" className="font-num mt-1 w-full bg-transparent text-2xl font-semibold outline-none" placeholder="R$ 0" value={l.budget || ""} onChange={(e) => upd({ budget: Number(e.target.value) })} />
          {l.budget > 0 && <div className={cn("text-xs", total > l.budget ? "text-[#ff6b8b]" : "text-fg-muted")}>{total > l.budget ? `Excede em ${brl(total - l.budget)}` : `Sobra ${brl(l.budget - total)}`}</div>}
        </Card>
      </div>
      {total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
          <motion.div className="h-full rounded-full bg-[#5ee3a1]" animate={{ width: (bought / total) * 100 + "%" }} />
        </div>
      )}

      <Card className="!p-0">
        <form className="flex gap-2 border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); addItem() }}>
          <input className="field min-w-0 flex-1" placeholder="Adicionar item…" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input type="number" min={1} className="field w-16" title="Quantidade" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
          <input type="number" step="0.01" className="field font-num w-28" placeholder="Preço un." value={draft.price || ""} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
          <ThemedButton size="sm" title="Adicionar item" onClick={addItem}><Plus size={14} /></ThemedButton>
        </form>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
          <span>Ordenar:</span>
          {(["manual", "priority", "price"] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)} className={cn("rounded px-1.5", sort === k && "bg-brand/30 text-fg")}>{{ manual: "Ordem", priority: "Prioridade", price: "Valor" }[k]}</button>
          ))}
          <div className="flex-1" />
          <button className="flex items-center gap-1" onClick={() => setHide(!hide)}>{hide ? <Eye size={13} /> : <EyeOff size={13} />}{hide ? "Mostrar comprados" : "Ocultar comprados"}</button>
        </div>
        {items.length === 0 ? (
          <Empty icon="📝" title="Lista vazia" />
        ) : (
          <div>
            <AnimatePresence initial={false}>
              {items.map((i) => (
                <motion.div key={i.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 border-t border-line px-3 py-2">
                  <motion.button
                    whileTap={{ scale: 0.75 }}
                    onClick={() => setItem(i.id, { checked: !i.checked })}
                    className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors", i.checked ? "border-transparent bg-[#5ee3a1] text-black" : "border-line hover:border-brand")}
                  >
                    {i.checked && <Check size={14} strokeWidth={3} />}
                  </motion.button>
                  <button onClick={() => setItem(i.id, { priority: ((i.priority + 1) % 3) as 0 | 1 | 2 })} title={`Prioridade ${PRI[i.priority].label}`} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PRI[i.priority].c }} />
                  <input className={cn("min-w-0 flex-1 bg-transparent outline-none", i.checked && "text-fg-muted line-through")} value={i.name} onChange={(e) => setItem(i.id, { name: e.target.value })} />
                  <input
                    className="w-0 flex-[0.6] bg-transparent text-xs text-fg-muted opacity-0 outline-none group-hover:opacity-100 focus:opacity-100"
                    placeholder="link da loja"
                    value={i.link}
                    onChange={(e) => setItem(i.id, { link: e.target.value })}
                  />
                  {i.link && <button aria-label="Abrir o link" onClick={() => bridge.app.openExternal(i.link.startsWith("http") ? i.link : "https://" + i.link)} className="text-fg-muted hover:text-brand"><ExternalLink size={14} /></button>}
                  <input type="number" min={1} className="font-num w-12 bg-transparent text-right outline-none" value={i.qty} onChange={(e) => setItem(i.id, { qty: Number(e.target.value) })} />
                  <span className="text-xs text-fg-muted">×</span>
                  <input type="number" step="0.01" className="font-num w-24 bg-transparent text-right outline-none" value={i.price || ""} placeholder="0,00" onChange={(e) => setItem(i.id, { price: Number(e.target.value) })} />
                  <span className="font-num w-28 text-right font-medium">{brl(i.qty * i.price)}</span>
                  <button aria-label="Remover item" className="opacity-0 group-hover:opacity-70 hover:!text-red-400" onClick={() => upd({ items: l.items.filter((x) => x.id !== i.id) })}><Trash2 size={14} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>
    </div>
  )
}
