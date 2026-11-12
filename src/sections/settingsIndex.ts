/**
 * Mapa das Configurações: grupos da navegação e o que cada aba contém (para a busca).
 * Os títulos de `sections` são os mesmos dos <Section title="…"> de cada aba;
 * tests/settings-index.test.mjs falha se um título daqui deixar de existir no código.
 */
export type SettingsTabId = "mode" | "templates" | "packs" | "look" | "fonts" | "cursor" | "taskbar" | "wallpaper" | "fx" | "widgets" | "pet" | "routine" | "integrations" | "system"

export interface SettingsTabInfo { id: SettingsTabId; label: string; sections: string[]; words: string }

export const SETTINGS_GROUPS: { label: string; tabs: SettingsTabInfo[] }[] = [
  { label: "Geral", tabs: [
    { id: "mode", label: "Modo de uso", sections: ["Modo de uso", "Monitor", "Barra de tarefas"], words: "area de trabalho aplicativo tela propria monitores" },
    { id: "templates", label: "Templates", sections: [], words: "estilo salvar compartilhar codigo link importar" },
    { id: "packs", label: "Pacotes", sections: ["Pacotes de interface", "Ajustes do Carbono"], words: "carbono painel busca barra lateral moldura" },
  ] },
  { label: "Aparência", tabs: [
    { id: "look", label: "Aparência", sections: ["Tema", "Cores", "Forma e profundidade 3D", "Prévia dos botões"], words: "modo escuro claro destaque arredondamento desfoque blur opacidade transparencia vidro metal retro terminal minimal" },
    { id: "fonts", label: "Fontes", sections: [], words: "tipografia letra tamanho do texto numeros titulos" },
    { id: "cursor", label: "Cursor", sections: ["Formato do cursor", "Efeito ao mover", "Cor e tamanho", "Efeito ao clicar"], words: "mouse seta rastro particulas" },
    { id: "wallpaper", label: "Papel de parede", sections: ["Monitor", "Fundo", "Personalizar pela foto", "Ajustes", "Relógio da tela (estilo iPhone)"], words: "imagem video gif degrade wallpaper engine fundo relogio" },
    { id: "fx", label: "Sakura e efeitos", sections: ["Flores de sakura", "Camadas de efeito"], words: "petalas abertura splash granulado vinheta scanlines animacao" },
  ] },
  { label: "Área de trabalho", tabs: [
    { id: "taskbar", label: "Barra e ícones", sections: ["Barra de tarefas", "Barra de tarefas do PC", "O que aparece na barra", "Ícones dos apps"], words: "dock posicao tamanho ocultar tecla windows atalhos iniciar icones" },
    { id: "widgets", label: "Widgets", sections: ["Padrões dos widgets"], words: "travar arrumar clima cidade noticias" },
    { id: "pet", label: "Bichinho", sections: [], words: "pet gato cachorro sapo dragao cabra nome" },
  ] },
  { label: "Sistema", tabs: [
    { id: "routine", label: "Rotina e avisos", sections: ["Avisos", "Times favoritos", "Modo foco", "Tela Hoje", "Agenda do Google"], words: "notificacoes som calendario foco futebol" },
    { id: "integrations", label: "Integrações", sections: ["Status das integrações"], words: "discord whatsapp ifood youtube music spotify" },
    { id: "system", label: "Sistema", sections: ["Inicialização", "Bandeja e atalho", "Backup na nuvem", "Desempenho e consumo", "Economia de memória", "Diagnóstico de travamentos", "Backup", "Restaurar"], words: "iniciar com o windows atualizacao versao desempenho fps memoria ram cpu jogos economia restaurar padrao exportar importar" },
  ] },
]

export const SETTINGS_TABS: SettingsTabInfo[] = SETTINGS_GROUPS.flatMap((g) => g.tabs)

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export interface SettingsHit { tab: SettingsTabId; tabLabel: string; section?: string }

/** Busca por aba, seção ou palavra-chave. Seções que batem vêm antes das abas que só batem por palavra-chave. */
export function searchSettings(query: string): SettingsHit[] {
  const q = norm(query.trim())
  if (!q) return []
  const toks = q.split(/\s+/)
  const hits: (SettingsHit & { rank: number })[] = []
  for (const t of SETTINGS_TABS) {
    for (const s of t.sections) {
      const hay = norm(s)
      if (toks.every((k) => hay.includes(k))) hits.push({ tab: t.id, tabLabel: t.label, section: s, rank: hay.startsWith(toks[0]) ? 0 : 1 })
    }
    const label = norm(t.label)
    if (toks.every((k) => label.includes(k))) hits.push({ tab: t.id, tabLabel: t.label, rank: 0 })
    else if (toks.every((k) => norm(t.words).includes(k))) hits.push({ tab: t.id, tabLabel: t.label, rank: 2 })
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, 12).map(({ rank: _rank, ...h }) => h)
}
