import { Component, type ReactNode } from "react"
import { RotateCcw } from "lucide-react"

/**
 * Se um widget ou uma aba der erro, só ele mostra "teve um problema" com um botão de recarregar.
 * O resto do Agenda continua funcionando normalmente.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; compact?: boolean }, { err: Error | null; n: number }> {
  state = { err: null as Error | null, n: 0 }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    console.error(`[${this.props.label ?? "Agenda"}]`, err, info.componentStack)
  }
  render() {
    if (!this.state.err) return <div key={this.state.n} className="contents">{this.props.children}</div>
    const retry = () => this.setState((s) => ({ err: null, n: s.n + 1 }))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center" data-nodrag>
        <div className={this.props.compact ? "text-xl" : "text-3xl"}>🥀</div>
        <div className="text-sm font-semibold">{this.props.compact ? "Este widget teve um problema" : `${this.props.label ?? "Esta aba"} teve um problema`}</div>
        {!this.props.compact && <div className="max-w-md truncate text-xs text-fg-muted" title={String(this.state.err.message)}>{String(this.state.err.message)}</div>}
        <button className="btn !py-1 text-xs" onClick={retry}><RotateCcw size={12} /> Recarregar</button>
      </div>
    )
  }
}
