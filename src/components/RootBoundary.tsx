import { Component, type ReactNode } from "react"
import { useStore } from "@/lib/store"

/**
 * Última proteção: se a tela inteira der erro ao desenhar, em vez de ficar em branco (o que, no modo área de
 * trabalho, deixaria o PC sem fundo e sem barra) aparece um cartão com saídas. Não depende do tema nem de
 * nenhum outro componente: usa só estilos próprios.
 */
export class RootBoundary extends Component<{ children: ReactNode }, { err: Error | null; n: number; tries: number }> {
  state = { err: null as Error | null, n: 0, tries: 0 }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    console.error("[Widgy] erro ao desenhar a tela", err, info.componentStack)
  }
  render() {
    if (!this.state.err) return <div key={this.state.n} className="contents">{this.props.children}</div>
    const retry = () => this.setState((s) => ({ err: null, n: s.n + 1, tries: s.tries + 1 }))
    const resetLook = () => {
      if (!confirm("Voltar todas as configurações ao padrão? Seus widgets e seus dados (hábitos, listas, tarefas…) não mudam.")) return
      try { useStore.getState().resetSettings() } catch { /* segue para recarregar */ }
      retry()
    }
    const btn = { padding: "8px 14px", borderRadius: 10, border: "1px solid rgb(255 255 255 / .18)", background: "rgb(255 255 255 / .08)", color: "#F3F8FF", font: "inherit", cursor: "pointer" } as const
    return (
      <div role="alert" style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1220", color: "#F3F8FF", font: '14px/1.5 system-ui, "Segoe UI", sans-serif' }}>
        <div style={{ width: "min(460px, calc(100vw - 32px))", padding: 24, borderRadius: 16, border: "1px solid rgb(255 255 255 / .14)", background: "#121b2e" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>O Widgy teve um problema ao desenhar a tela</div>
          <p style={{ margin: "8px 0 0", color: "rgb(229 239 255 / .78)" }}>
            Seus dados estão guardados. {this.state.tries > 0 ? "Tentar de novo não resolveu: reinicie a tela ou volte as configurações ao padrão." : "Tente de novo; se voltar a acontecer, reinicie a tela."}
          </p>
          <div style={{ margin: "10px 0 0", padding: "8px 10px", borderRadius: 8, background: "rgb(0 0 0 / .3)", color: "rgb(229 239 255 / .7)", fontSize: 12, wordBreak: "break-word", maxHeight: 72, overflow: "auto" }}>{String(this.state.err.message || this.state.err)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button type="button" style={{ ...btn, background: "#3b82f6", borderColor: "transparent" }} onClick={retry} autoFocus>Tentar de novo</button>
            <button type="button" style={btn} onClick={() => location.reload()}>Reiniciar a tela</button>
            <button type="button" style={btn} onClick={resetLook}>Configurações padrão</button>
          </div>
        </div>
      </div>
    )
  }
}
