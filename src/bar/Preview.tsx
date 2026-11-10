import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { bridge, type PreviewTile } from "@/lib/bridge"
import { useBarSync } from "./sync"

/**
 * Prévia das janelas de um programa (mouse em cima do botão na barra), como no Windows.
 * A imagem ao vivo de cada janela é desenhada pelo próprio Windows por cima do quadro escuro;
 * aqui ficam o título, o fechar e o clique para trazer a janela.
 */
export function Preview() {
  useBarSync()
  const [tiles, setTiles] = useState<PreviewTile[]>([])
  useEffect(() => bridge.bar.onPreview((d) => {
    setTiles(d.tiles)
    // depois de desenhar (dois quadros): avisa para mostrar a janela e as miniaturas juntas
    requestAnimationFrame(() => requestAnimationFrame(() => bridge.bar.previewReady(d.seq)))
  }), [])
  return (
    <div
      className="bar-bg fixed inset-0 text-fg"
      onPointerEnter={() => bridge.bar.previewHover(true)}
      onPointerLeave={() => bridge.bar.previewHover(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {tiles.map((t) => (
        <div
          key={t.h}
          className="group absolute cursor-default rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
          style={{ left: t.x, top: t.y, width: t.w, height: t.head + t.thumb.h + 8 }}
          onClick={() => { bridge.bar.previewHide(); bridge.bar.click(t.h, true) }}
          onAuxClick={(e) => { if (e.button === 1) { bridge.bar.previewHide(); bridge.bar.win("close", t.h) } }}
        >
          <div className="flex items-center gap-2 px-2" style={{ height: t.head }}>
            {t.icon && <img src={t.icon} alt="" className="size-4 shrink-0" draggable={false} />}
            <span className="min-w-0 flex-1 truncate text-xs">{t.title}</span>
            {t.min && <span className="shrink-0 text-[10px] text-fg-muted group-hover:hidden">minimizada</span>}
            <button
              className="flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:!bg-red-500/80 hover:text-white"
              title="Fechar janela"
              onClick={(e) => { e.stopPropagation(); bridge.bar.previewHide(); bridge.bar.win("close", t.h) }}
            >
              <X size={13} />
            </button>
          </div>
          {/* o Windows desenha a janela aqui (a minimizada com a última imagem dela); o ícone só aparece se não vier imagem */}
          <div
            className="absolute flex flex-col items-center justify-center gap-2 rounded-md bg-black/25"
            style={{ left: t.thumb.x - t.x, top: t.thumb.y - t.y, width: t.thumb.w, height: t.thumb.h }}
          >
            {t.icon && <img src={t.icon} alt="" className="size-8 opacity-40" draggable={false} />}
          </div>
        </div>
      ))}
    </div>
  )
}
