/**
 * Separa o "assunto" (pessoa, objeto, paisagem em primeiro plano) do fundo de uma imagem,
 * para o relógio do papel de parede ficar ATRÁS dele, como na tela de bloqueio do iPhone.
 * Usa o modelo RMBG-1.4 rodando no próprio PC (Transformers.js, num worker para não travar a tela).
 * Na primeira vez baixa ~45 MB.
 */
import { aiSegment } from "./ai"

export async function segmentSubject(url: string, onProgress?: (pct: number, msg: string) => void): Promise<string> {
  onProgress?.(0, "Preparando o modelo de recorte…")
  const out = await aiSegment(url, onProgress)
  onProgress?.(100, "Pronto")
  return out
}
