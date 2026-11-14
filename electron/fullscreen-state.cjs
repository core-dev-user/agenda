// Outro programa em tela cheia na frente (jogo, vídeo): o Widgy evita mexer na tela enquanto isso.
//
// Por quê: quando um jogo entra em tela cheia (às vezes trocando a resolução), o Windows avisa que a tela mudou.
// Se nesse instante o Widgy reorganiza as barras (AppBar), move a área de trabalho dele ou mostra uma janela por
// cima, o jogo pode perder a tela cheia, minimizar ou fechar. Quem sabe o estado é a barra (ela consulta a janela
// da frente a cada segundo); quem precisa mexer na tela pergunta aqui e, se for o caso, deixa para depois.
let other = false
let since = 0
const pending = new Map()
const listeners = new Set()

function set(v) {
  v = !!v
  if (v === other) return
  other = v
  since = Date.now()
  for (const f of listeners) { try { f(other) } catch {} }
  if (!other) {
    const fns = [...pending.values()]
    pending.clear()
    for (const f of fns) { try { f() } catch (e) { console.error("fullscreen-state:", e) } }
  }
}

module.exports = {
  set,
  /** true: outro programa está em tela cheia na frente agora */
  get: () => other,
  since: () => since,
  /** roda agora, ou quando a tela cheia acabar (para cada chave, só a última pendência vale) */
  whenFree(key, fn) { if (!other) { fn(); return true } pending.set(key, fn); return false },
  pendingKeys: () => [...pending.keys()],
  onChange(f) { listeners.add(f); return () => listeners.delete(f) },
  /** só para testes */
  _reset() { other = false; since = 0; pending.clear(); listeners.clear() },
}
