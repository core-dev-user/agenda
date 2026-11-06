import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

/** Emojis por categoria, com palavras-chave em português para a busca. */
const GROUPS: { name: string; items: [string, string][] }[] = [
  { name: "Compras", items: [["🛒", "mercado compras carrinho"], ["🛍️", "sacola shopping loja"], ["🧾", "nota cupom recibo"], ["💳", "cartão pagamento"], ["💰", "dinheiro economia"], ["🏷️", "etiqueta preço promoção"], ["🎁", "presente aniversário"], ["📦", "pacote entrega encomenda"], ["🧺", "cesta feira"], ["🪙", "moeda"]] },
  { name: "Casa", items: [["🏠", "casa lar"], ["🛋️", "sala sofá móveis"], ["🛏️", "quarto cama"], ["🧹", "limpeza faxina"], ["🧼", "sabão higiene"], ["🪴", "planta jardim"], ["🔧", "ferramenta conserto"], ["💡", "luz ideia lâmpada"], ["🧴", "produto cuidado"], ["🧻", "papel banheiro"]] },
  { name: "Comida", items: [["🍎", "fruta maçã"], ["🥦", "verdura legume"], ["🥩", "carne açougue"], ["🍞", "pão padaria"], ["🧀", "queijo laticínio"], ["🍕", "pizza"], ["🍔", "lanche hambúrguer"], ["☕", "café"], ["🍷", "vinho bebida"], ["🍰", "doce bolo sobremesa"], ["🥗", "salada dieta"], ["🍣", "sushi japonês"]] },
  { name: "Roupas", items: [["👕", "camiseta roupa"], ["👖", "calça jeans"], ["👗", "vestido"], ["👟", "tênis sapato"], ["🧥", "casaco jaqueta"], ["👜", "bolsa"], ["🕶️", "óculos"], ["💍", "anel joia"], ["⌚", "relógio"], ["🧢", "boné"]] },
  { name: "Tecnologia", items: [["💻", "notebook computador"], ["🖥️", "pc desktop setup"], ["🎮", "game jogo console"], ["🎧", "fone headset"], ["📱", "celular"], ["⌨️", "teclado"], ["🖱️", "mouse"], ["📷", "câmera foto"], ["🔌", "cabo tomada"], ["🖨️", "impressora"]] },
  { name: "Estudo e trabalho", items: [["📚", "livros estudo"], ["📘", "livro azul"], ["📝", "anotação nota"], ["✏️", "lápis escrever"], ["🎓", "formatura faculdade"], ["💼", "trabalho maleta"], ["📊", "gráfico relatório"], ["🗂️", "pastas arquivos"], ["📅", "calendário agenda"], ["🧠", "cérebro mente"]] },
  { name: "Lazer e viagem", items: [["✈️", "viagem avião"], ["🏖️", "praia férias"], ["🏕️", "acampamento"], ["🎬", "filme cinema"], ["🎵", "música"], ["🎸", "violão guitarra"], ["⚽", "futebol esporte"], ["🏋️", "academia treino"], ["🎨", "arte pintura"], ["📸", "fotografia"]] },
  { name: "Saúde e bem-estar", items: [["💊", "remédio farmácia"], ["🩺", "médico consulta"], ["🦷", "dentista"], ["💆", "spa relaxar"], ["🧘", "meditação yoga"], ["❤️", "coração amor"], ["🐶", "cachorro pet"], ["🐱", "gato pet"], ["👶", "bebê criança"], ["🌸", "flor sakura"]] },
  { name: "Símbolos", items: [["⭐", "estrela favorito"], ["🔥", "fogo urgente"], ["✨", "brilho"], ["✅", "feito check"], ["📌", "fixar alfinete"], ["🚀", "foguete projeto"], ["💎", "diamante"], ["🎯", "meta alvo"], ["🌙", "lua noite"], ["☀️", "sol dia"], ["🌈", "arco-íris"], ["🍀", "sorte trevo"]] },
]

export function IconPicker({ value, onPick, className }: { value?: string; onPick: (emoji: string) => void; className?: string }) {
  const [q, setQ] = useState("")
  const [custom, setCustom] = useState("")
  const groups = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return GROUPS
    return [{ name: "Resultados", items: GROUPS.flatMap((g) => g.items).filter(([e, k]) => k.includes(n) || e === n) }]
  }, [q])
  return (
    <div className={cn("w-[320px] space-y-2", className)}>
      <div className="field flex items-center gap-1.5 !py-1">
        <Search size={13} className="text-fg-muted" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar (ex.: mercado, roupa, viagem)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="max-h-64 space-y-2 overflow-auto pr-1">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="mb-1 text-[10px] tracking-wide text-fg-muted uppercase">{g.name}</div>
            <div className="grid grid-cols-8 gap-1">
              {g.items.map(([e, k]) => (
                <button key={e + g.name} title={k} onClick={() => onPick(e)} className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]", value === e && "bg-brand/30 ring-1 ring-brand")}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups[0]?.items.length === 0 && <div className="py-3 text-center text-xs text-fg-muted">Nada encontrado. Use o campo abaixo para qualquer emoji.</div>}
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-2 text-xs text-fg-muted">
        Outro:
        <input className="field w-14 !py-0.5 text-center text-lg" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="😀" />
        <button className="btn !py-0.5 text-xs" disabled={!custom.trim()} onClick={() => { onPick([...custom.trim()].slice(0, 2).join("")); setCustom("") }}>Usar</button>
        <span className="ml-auto">Win + . abre os emojis do Windows</span>
      </div>
    </div>
  )
}
