import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Glyph, ICONS, iconKey } from "./Glyph"

/** Ícones por categoria, com palavras-chave em português para a busca. O valor salvo é "i:<Nome>". */
const GROUPS: { name: string; items: [string, string][] }[] = [
  { name: "Compras", items: [["ShoppingCart", "mercado compras carrinho"], ["ShoppingBag", "sacola shopping loja"], ["ShoppingBasket", "cesta feira"], ["Receipt", "nota cupom recibo"], ["CreditCard", "cartão pagamento"], ["PiggyBank", "dinheiro economia cofrinho"], ["Coins", "moeda troco"], ["Tag", "etiqueta preço promoção"], ["Gift", "presente aniversário"], ["Package", "pacote entrega encomenda"]] },
  { name: "Casa", items: [["House", "casa lar"], ["Sofa", "sala sofá móveis"], ["BedDouble", "quarto cama"], ["Brush", "limpeza faxina"], ["SprayCan", "produto limpeza"], ["Leaf", "planta jardim"], ["Wrench", "ferramenta conserto"], ["Lightbulb", "luz ideia lâmpada"], ["Bath", "banho banheiro"], ["Plug", "tomada energia"]] },
  { name: "Comida", items: [["Apple", "fruta maçã"], ["Carrot", "verdura legume"], ["Beef", "carne açougue"], ["Croissant", "pão padaria"], ["Pizza", "pizza"], ["Sandwich", "lanche hambúrguer"], ["Coffee", "café"], ["Wine", "vinho bebida"], ["Cake", "doce bolo sobremesa"], ["Salad", "salada dieta"], ["Fish", "peixe sushi japonês"], ["Utensils", "restaurante comida"]] },
  { name: "Roupas", items: [["Shirt", "camiseta roupa"], ["Footprints", "tênis sapato"], ["Glasses", "óculos"], ["Gem", "joia anel"], ["Watch", "relógio"], ["Scissors", "cabelo barbearia"]] },
  { name: "Tecnologia", items: [["Laptop", "notebook computador"], ["Monitor", "pc desktop setup"], ["Gamepad2", "game jogo console"], ["Headphones", "fone headset"], ["Smartphone", "celular"], ["Keyboard", "teclado"], ["Mouse", "mouse"], ["Camera", "câmera foto"], ["Printer", "impressora"], ["Code", "programar código"]] },
  { name: "Estudo e trabalho", items: [["BookOpen", "livros estudo leitura"], ["Book", "livro"], ["Notebook", "caderno"], ["PenLine", "anotação escrever"], ["Pencil", "lápis"], ["GraduationCap", "formatura faculdade"], ["Briefcase", "trabalho maleta"], ["ChartColumn", "gráfico relatório"], ["FolderOpen", "pastas arquivos"], ["CalendarDays", "calendário agenda"], ["Brain", "cérebro mente"], ["Languages", "idioma língua"]] },
  { name: "Lazer e viagem", items: [["Plane", "viagem avião"], ["TreePalm", "praia férias"], ["Tent", "acampamento"], ["Mountain", "trilha montanha"], ["Clapperboard", "filme cinema"], ["Tv", "série tv"], ["Music", "música"], ["Guitar", "violão guitarra"], ["Volleyball", "esporte bola"], ["Dumbbell", "academia treino"], ["Bike", "bicicleta pedal"], ["Palette", "arte pintura"]] },
  { name: "Saúde e bem-estar", items: [["Pill", "remédio farmácia"], ["Stethoscope", "médico consulta dentista"], ["Droplet", "água beber hidratação"], ["HandHeart", "cuidado gratidão"], ["Sunrise", "meditação manhã yoga"], ["Moon", "dormir sono"], ["Heart", "coração amor"], ["CigaretteOff", "parar fumar"], ["PhoneOff", "sem celular"], ["Dog", "cachorro pet"], ["Cat", "gato pet"], ["Baby", "bebê criança"]] },
  { name: "Símbolos", items: [["Star", "estrela favorito"], ["Flame", "fogo urgente sequência"], ["Sparkles", "brilho"], ["CircleCheck", "feito check"], ["Pin", "fixar alfinete"], ["Rocket", "foguete projeto"], ["Target", "meta alvo"], ["Trophy", "conquista troféu"], ["Sun", "sol dia"], ["Flower2", "flor sakura"], ["Rainbow", "arco-íris"], ["Clover", "sorte trevo"]] },
]

export function IconPicker({ value, onPick, className, color }: { value?: string; onPick: (icon: string) => void; className?: string; color?: string }) {
  const [q, setQ] = useState("")
  const cur = iconKey(value)
  const groups = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return GROUPS
    return [{ name: "Resultados", items: GROUPS.flatMap((g) => g.items).filter(([k, words]) => words.includes(n) || k.toLowerCase().includes(n)) }]
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
              {g.items.filter(([k]) => ICONS[k]).map(([k, words]) => (
                <button
                  key={k + g.name}
                  title={words}
                  onClick={() => onPick("i:" + k)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-transform hover:scale-110 hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]", cur === k && "bg-brand/30 ring-1 ring-brand")}
                  style={cur === k && color ? { color } : undefined}
                >
                  <Glyph v={"i:" + k} size={17} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups[0]?.items.length === 0 && <div className="py-3 text-center text-xs text-fg-muted">Nada encontrado com esse nome.</div>}
      </div>
    </div>
  )
}
