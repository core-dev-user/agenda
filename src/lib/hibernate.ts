import { useStore } from "./store"

/**
 * Hibernar: põe todos os widgets em modo descanso de uma vez (nada roda por trás,
 * libera memória e processador para o jogo). Guarda quais estavam acordados para
 * acordar só esses ao sair. Durante a hibernação dá para acordar um por um normalmente.
 */
export const isHibernating = () => !!useStore.getState().settings.hibernate?.on

export function setHibernate(on: boolean) {
  const st = useStore.getState()
  if (on === !!st.settings.hibernate?.on) return
  if (on) {
    const ids = st.widgets.filter((w) => !w.config.rest).map((w) => w.id)
    const set = new Set(ids)
    useStore.setState((s) => ({
      widgets: s.widgets.map((w) => (set.has(w.id) ? { ...w, config: { ...w.config, rest: true } } : w)),
      settings: { ...s.settings, hibernate: { on: true, ids } },
    }))
  } else {
    const set = new Set(st.settings.hibernate?.ids ?? [])
    useStore.setState((s) => ({
      widgets: s.widgets.map((w) => (set.has(w.id) && w.config.rest ? { ...w, config: { ...w.config, rest: false } } : w)),
      settings: { ...s.settings, hibernate: { on: false, ids: [] } },
    }))
  }
}

export const toggleHibernate = () => setHibernate(!isHibernating())
