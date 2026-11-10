import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { ICON_PACK_CATALOG, ICON_PACK_CATEGORIES, ICON_PACK_STYLES, iconPackSrc, type IconPackStyle } from "@/lib/iconPack"
import { cn } from "@/lib/utils"

export function IconPackSettings({ value, onChange }: { value: IconPackStyle; onChange: (style: IconPackStyle) => void }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const matches = useMemo(() => ICON_PACK_CATALOG.filter((icon) => {
    const q = query.trim().toLocaleLowerCase("pt-BR")
    return (category === "all" || icon.category === category) && (!q || icon.name.toLocaleLowerCase("pt-BR").includes(q))
  }), [query, category])
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="text-sm font-semibold">Pacote visual · 169 aplicativos</div>
      <p className="text-xs text-fg-muted">Escolha um estilo para os ícones do Widgy e dos programas reconhecidos na barra e no menu Iniciar. Outros programas mantêm seus ícones originais. Todos os desenhos funcionam sem internet.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ICON_PACK_STYLES.map((theme) => (
          <button key={theme.id} type="button" aria-pressed={value === theme.id} onClick={() => onChange(theme.id)}
            className={cn("flex flex-col gap-2 rounded-xl border p-3 text-left transition", value === theme.id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
            <div className="flex h-9 items-center gap-1">
              {theme.id === "original" ? <span className="text-xs text-fg-muted">Padrão</span> :
                ["Discord", "Spotify", "GitHub"].map((name) => <img key={name} src={iconPackSrc(name, theme.id) ?? ""} alt="" className="h-9 w-9" loading="lazy" />)}
            </div>
            <span className="text-xs">{theme.label}</span>
          </button>
        ))}
      </div>
      {value !== "original" && (
        <>
          <div className="flex gap-2">
            <label className="field flex min-w-0 flex-1 items-center gap-2">
              <Search size={15} className="shrink-0 text-fg-muted" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar entre 169 ícones..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select aria-label="Categoria dos ícones" className="field max-w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">Todas</option>
              {ICON_PACK_CATEGORIES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
          </div>
          <div className="max-h-60 overflow-auto rounded-xl border border-line p-2">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {matches.map((icon) => (
                <div key={icon.name} title={icon.name} className="flex min-w-0 flex-col items-center gap-1 rounded-lg p-1">
                  <img loading="lazy" src={iconPackSrc(icon.name, value) ?? ""} alt={icon.name} width={48} height={48} />
                  <span className="w-full truncate text-center text-[10px]">{icon.name}</span>
                </div>
              ))}
            </div>
            {!matches.length && <p className="p-3 text-center text-xs text-fg-muted">Nenhum ícone encontrado.</p>}
          </div>
        </>
      )}
    </div>
  )
}
