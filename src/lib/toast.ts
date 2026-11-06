/** aviso curtinho no rodapé da tela ("Desfeito", "Configuração copiada"…) */
export const toast = (text: string) => window.dispatchEvent(new CustomEvent("agenda:toast", { detail: text }))
