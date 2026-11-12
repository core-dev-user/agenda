import type { ReactNode } from "react"

/**
 * Seção das Configurações: plana, separada por uma linha fina, título pequeno na fonte da interface.
 * (Antes cada seção era uma caixa com borda e título grande serifado: a tela virava uma pilha de cartões.)
 * `data-section` permite a busca rolar até a seção.
 */
export function SettingsSection({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section data-section={title} className="settings-section scroll-mt-6">
      <h3 className="border-b border-line pb-2 text-[13px] font-semibold tracking-[.01em] text-fg">{title}</h3>
      {desc && <div className="mt-2.5 max-w-[68ch] text-[12.5px] leading-relaxed text-fg-muted">{desc}</div>}
      <div className="mt-3 space-y-1">{children}</div>
    </section>
  )
}
