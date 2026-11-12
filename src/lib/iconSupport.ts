/**
 * O que cada estilo de ícone aceita personalizar. Medido no app (docs/personalizacao-auditoria.md):
 * com "Logos" (o padrão) e com qualquer pacote de ícones, formato e cor por aba não mudam nada;
 * "Contorno" ignora a cor e "Pixel" ignora o formato. A tela de Configurações usa isto para desativar
 * o controle que não teria efeito, em vez de mostrar um ajuste que não faz nada.
 */
export type IconStyleId = "auto" | "logos" | "color" | "glass" | "metal" | "neon" | "outline" | "flat" | "pixel"
type ThemeId = "glass" | "metal" | "retro" | "terminal" | "minimal"

const AUTO: Record<ThemeId, Exclude<IconStyleId, "auto">> = { glass: "color", metal: "metal", retro: "pixel", terminal: "neon", minimal: "flat" }

export interface IconSupport { shape: boolean; color: boolean; why: string }

export function iconSupport(o: { iconStyle: IconStyleId; theme: ThemeId; iconPackStyle?: string }): IconSupport {
  if (o.iconPackStyle && o.iconPackStyle !== "original") return { shape: false, color: false, why: "O pacote de ícones escolhido tem desenhos prontos: formato e cores não se aplicam a ele." }
  const st = o.iconStyle === "auto" ? AUTO[o.theme] : o.iconStyle
  if (st === "logos") return { shape: false, color: false, why: "O estilo Logos usa a marca de cada app: formato e cores não se aplicam a ele." }
  if (st === "outline") return { shape: true, color: false, why: "O estilo Contorno usa a cor do tema: a cor de cada app não se aplica a ele." }
  if (st === "pixel") return { shape: false, color: true, why: "O estilo Pixel é sempre quadrado: o formato não se aplica a ele." }
  return { shape: true, color: true, why: "" }
}
