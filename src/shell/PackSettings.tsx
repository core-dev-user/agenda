import { Check, Command, LayoutDashboard, MousePointer2, PanelLeft, Search } from "lucide-react"
import { useStore } from "@/lib/store"
import { Card, Segmented, Switch } from "@/components/ui/controls"
import { useEffect, useState, type ReactNode } from "react"
import { bridge, type BarConfig } from "@/lib/bridge"
import { cn } from "@/lib/utils"
import { SettingsSection } from "@/components/ui/SettingsSection"
import { ACCENTS, SURFACES, applyCarbono, removePack, setShellPrefs, shellPrefs, type CarbonoAccent } from "./pack"

/** Miniatura desenhada do Carbono: moldura, barra fina, painel de cima e busca de baixo. */
function CarbonoPreview({ accent, bg, rail }: { accent: string; bg: string; rail: string }) {
  return (
    <svg viewBox="0 0 320 180" className="w-full rounded-xl" role="img" aria-label="Prévia do pacote Carbono">
      <defs>
        <linearGradient id="cb-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5d6670" /><stop offset=".55" stopColor="#2c3036" /><stop offset="1" stopColor="#4a2228" />
        </linearGradient>
        <mask id="cb-hole"><rect width="320" height="180" fill="#fff" /><rect x="18" y="4" width="298" height="172" rx="12" fill="#000" /></mask>
      </defs>
      <rect width="320" height="180" fill="url(#cb-wall)" />
      <rect width="320" height="180" fill={rail} mask="url(#cb-hole)" />
      {/* barra */}
      <circle cx="9" cy="12" r="3.2" fill="#ECE7E8" />
      <rect x="6" y="22" width="6" height="22" rx="3" fill="#1b1b1c" />
      {[27, 33].map((y) => <circle key={y} cx="9" cy={y} r="1.3" fill="#9C9597" />)}
      <rect x="7.8" y="36" width="2.4" height="6" rx="1.2" fill="#ECE7E8" />
      <rect x="7" y="140" width="4" height="3" rx="1" fill="#ECE7E8" /><rect x="7" y="145" width="4" height="3" rx="1" fill="#ECE7E8" />
      <circle cx="9" cy="168" r="2.4" fill="#F2A0A0" />
      {/* painel de cima */}
      <path d="M96 4 a8 8 0 0 0 8 8 V40 a12 12 0 0 0 12 12 H222 a12 12 0 0 0 12 -12 V12 a8 8 0 0 0 8 -8 Z" fill={bg} />
      <rect x="112" y="14" width="34" height="14" rx="4" fill="#1b1b1c" /><rect x="150" y="14" width="40" height="14" rx="4" fill="#1b1b1c" /><rect x="194" y="14" width="30" height="30" rx="4" fill="#1b1b1c" />
      <rect x="112" y="31" width="34" height="13" rx="4" fill="#1b1b1c" /><rect x="150" y="31" width="40" height="13" rx="4" fill="#1b1b1c" />
      <circle cx="209" cy="27" r="7" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="1.5 1.5" />
      {/* busca de baixo */}
      <path d="M108 176 a8 8 0 0 0 8 -8 V140 a12 12 0 0 1 12 -12 H210 a12 12 0 0 1 12 12 V168 a8 8 0 0 0 8 8 Z" fill={bg} />
      {[136, 146, 156].map((y, i) => <rect key={y} x="124" y={y} width={i === 0 ? 84 : 70} height="6" rx="3" fill={i === 0 ? "#2e2e30" : "#1b1b1c"} />)}
      <rect x="124" y="164" width="86" height="7" rx="3.5" fill="#1b1b1c" />
    </svg>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return <SettingsSection title={title} desc={desc}>{children}</SettingsSection>
}

/** tecla Windows sozinha: Iniciar do Windows ou a busca do Carbono (precisa da barra do Widgy no lugar da do Windows) */
function WinKeySwitch() {
  const [bar, setBar] = useState<BarConfig | null>(null)
  useEffect(() => { void bridge.bar.get().then(setBar).catch(() => {}) }, [])
  if (!bar?.available) return null
  return (
    <div>
      <Switch label="Tecla Windows abre a busca do Carbono" checked={bar.winKey === "agenda"}
        onChange={(v) => void bridge.bar.set({ winKey: v ? "agenda" : "windows" }).then(setBar)} />
      {!bar.active && <p className="mt-1 text-xs text-fg-muted">Funciona quando a barra do Widgy substitui a do Windows (Barra e ícones). Win+S abre a busca nesse modo.</p>}
    </div>
  )
}

/** cores prontas + uma cor livre; `same` acrescenta a opção "igual aos painéis" (valor vazio) */
function SurfacePicker({ label, hint, value, onChange, same }: { label: string; hint: string; value: string; onChange: (v: string) => void; same?: boolean }) {
  // anel na cor do texto: aparece tanto no tema escuro quanto no claro
  const swatch = (on: boolean) => cn("relative size-8 rounded-full border border-line transition-transform hover:scale-110", on && "ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-transparent")
  const custom = !!value && !SURFACES.some((x) => x.color.toLowerCase() === value.toLowerCase())
  return (
    <div>
      <div className="text-xs font-medium text-fg-muted">{label}</div>
      <div className="mb-2 text-[11px] text-fg-muted/80">{hint}</div>
      <div className="flex flex-wrap items-center gap-2">
        {same && (
          <button type="button" title="Igual aos painéis" aria-label="Igual aos painéis" onClick={() => onChange("")}
            className={cn(swatch(!value), "flex items-center justify-center text-[10px] font-semibold text-fg-muted")}>=</button>
        )}
        {SURFACES.map((x) => (
          <button key={x.color} type="button" title={x.label} aria-label={x.label} onClick={() => onChange(x.color)}
            className={swatch(value.toLowerCase() === x.color.toLowerCase())} style={{ background: x.color }} />
        ))}
        <label title="Outra cor" className={cn(swatch(custom), "flex cursor-pointer items-center justify-center overflow-hidden")}
          style={{ background: custom ? value : "conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)" }}>
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label={label + ": outra cor"}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#121212"} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

export function PacksTab() {
  const settings = useStore((s) => s.settings)
  const p = shellPrefs(settings)
  const on = p.pack === "carbono"
  const accent = ACCENTS[p.accent ?? "rose"].color

  return (
    <>
      <Section title="Pacotes de interface" desc="Um pacote troca o jeito do Widgy inteiro: barra, busca, painéis, cores e fontes. Seus widgets, abas e dados continuam iguais, e ao desativar o visual anterior volta exatamente como estava.">
        <div className={cn("overflow-hidden rounded-2xl border transition-colors", on ? "border-[var(--accent)]" : "border-line")}>
          <div className="grid gap-4 p-4 sm:grid-cols-[1.1fr_1fr]">
            <CarbonoPreview accent={accent.startsWith("var") ? "#F1B9C6" : accent} bg={p.bg || "#121212"} rail={p.railBg || p.bg || "#121212"} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">Carbono</span>
                {on && <span className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] px-2 py-0.5 text-[11px] font-medium"><Check size={11} /> Ativo</span>}
              </div>
              <p className="mt-1 text-sm text-fg-muted">Escuro, sóbrio e feito para o teclado. A tela ganha uma moldura e todos os painéis saem das bordas, como peças do mesmo bloco.</p>
              <ul className="mt-3 space-y-1.5 text-[13px] text-fg-muted">
                <li className="flex items-center gap-2"><PanelLeft size={14} /> Barra fina com abas abertas, relógio e energia</li>
                <li className="flex items-center gap-2"><LayoutDashboard size={14} /> Painel no topo: resumo, música, desempenho e clima</li>
                <li className="flex items-center gap-2"><Search size={14} /> Busca na borda de baixo, com programas do PC</li>
                <li className="flex items-center gap-2"><Command size={14} /> Comandos com &quot;&gt;&quot;: &gt;papel, &gt;musica, &gt;desligar…</li>
              </ul>
              <div className="mt-auto pt-4">
                {on
                  ? <button type="button" className="btn" onClick={removePack}>Desativar e voltar ao visual anterior</button>
                  : <button type="button" className="btn btn-accent" onClick={applyCarbono}>Ativar o Carbono</button>}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Ajustes do Carbono" desc={on ? "Valem na hora." : "Ficam guardados para quando o pacote estiver ativo."}>
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Cor de destaque</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ACCENTS) as CarbonoAccent[]).map((k) => (
                <button key={k} type="button" onClick={() => setShellPrefs({ accent: k })}
                  className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", (p.accent ?? "rose") === k ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
                  <span className="size-3.5 rounded-full" style={{ background: ACCENTS[k].color }} />
                  {ACCENTS[k].label}
                </button>
              ))}
            </div>
          </div>
          <SurfacePicker label="Cor dos painéis" hint="Painel de cima, busca, avisos e as janelas do Widgy."
            value={p.bg || "#121212"} onChange={(v) => setShellPrefs({ bg: v })} />
          <SurfacePicker label="Cor da barra lateral e da moldura" hint="Pode ser a mesma dos painéis ou outra."
            value={p.railBg || ""} same onChange={(v) => setShellPrefs({ railBg: v })} />
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Lado da barra</div>
            <Segmented value={p.side ?? "left"} onChange={(v) => setShellPrefs({ side: v as "left" | "right" })}
              options={[{ value: "left", label: "Esquerda" }, { value: "right", label: "Direita" }]} />
          </div>
          <Switch label="Moldura em volta da tela" checked={p.frame !== false} onChange={(v) => setShellPrefs({ frame: v })} />
          <Switch label="Abrir o painel ao encostar o mouse no meio do topo" checked={p.hoverTop !== false} onChange={(v) => setShellPrefs({ hoverTop: v })} />
          <Switch label="Abrir a busca ao encostar o mouse no meio de baixo" checked={p.hoverBottom !== false} onChange={(v) => setShellPrefs({ hoverBottom: v })} />
          <WinKeySwitch />
          <div className="rounded-xl bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] p-3 text-[12.5px] leading-relaxed text-fg-muted">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-fg"><MousePointer2 size={13} /> Atalhos</div>
            <b>Win+S</b>, <b>Ctrl+K</b> ou o logo da barra abrem a busca · <b>Ctrl+Shift+D</b> abre o painel · <b>Tab</b> completa um comando · <b>Esc</b> fecha.
            No comando <b>&gt;papel</b>, as setas escolhem o fundo e <b>Enter</b> aplica.
          </div>
        </div>
      </Section>
    </>
  )
}
