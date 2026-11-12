# Transmissão de tela (Salas)

Como funciona: a captura é do Chromium/Electron (`getDisplayMedia` com a fonte escolhida no Widgy) e o envio é
WebRTC direto entre os PCs (PeerJS só apresenta um ao outro). O som do PC vem do ajudante `sysaudio`.

## O que o Widgy ajusta

| Ajuste | Onde | Efeito |
| --- | --- | --- |
| H.264 primeiro na oferta (modo Automático) | `preferVideoCodec` | Deixa a placa de vídeo codificar quando há suporte; sem ela, H.264 por software |
| Taxa inicial = 50% da taxa da qualidade | `withStartBitrate` na resposta de quem assiste | A tela já chega na resolução cheia, sem os segundos borrados |
| Taxa máxima, limite de quadros, prioridade | `applySenderParams` | Reaplicado até a negociação terminar e ao trocar a qualidade no ar |
| Baixa latência (quem assiste) | `jitterBufferTarget = 0` | Menor buffer de reprodução; opção porque numa rede instável pode engasgar |
| Medições a cada 2 s | `summarize(getStats())` | fps, resolução, Mb/s, ida e volta, perdas, limite (CPU/internet), placa de vídeo ou CPU |

A adaptação à rede é a do próprio WebRTC (controle de congestionamento): a taxa cai e sobe sozinha dentro do
limite da qualidade escolhida. "Priorizar movimento" mantém os quadros e reduz a resolução; desligado, o contrário.

## Segurança

- A captura só é liberada para a fonte escolhida no diálogo, **uma vez**, por até 30 s, e só para a janela principal.
  Sem escolha válida nada é capturado.
- Tela e voz só são aceitas de quem está na lista da sala.
- "Parar transmissão" encerra as trilhas de captura na hora; fechar a fonte ou sair da sala também.

## Bancada de medição (reproduzível)

`npx vite` e abrir `http://localhost:5173/tools/rtc-bench.html?s=10` com os parâmetros:
`codec=H264` (preferência), `start=4000` (taxa inicial em kbit/s), `ll=1` (baixa latência), `s` (segundos medidos).
O resultado fica em `window.__result`. Conteúdo: "tela" de 1920×1080 a 60 fps com texto e blocos em movimento,
limite de 8 Mb/s, duas conexões na mesma máquina.

Medido em Chromium sem placa de vídeo (codificação por software), depois de 3 s de aquecimento + 10 s:

| Cenário | Resolução enviada | fps | Mb/s | ms de CPU por quadro | Limite |
| --- | --- | --- | --- | --- | --- |
| Antes (VP8, sem taxa inicial) | 640×360 | 59,9 | 4,0 | 3,5 | internet (estimativa baixa) |
| H.264, sem taxa inicial | 960×540 | 60,0 | 3,4 | 1,7 | internet (estimativa baixa) |
| VP8 + taxa inicial | 1920×1080 | 57,7–58,5 | 7,3 | 14,8–15,3 | nenhum |
| **Depois (H.264 + taxa inicial)** | **1920×1080** | **59,5–59,7** | **7,4** | **9,3–10,4** | nenhum |

Baixa latência: na mesma máquina o buffer já é mínimo (12–13 ms com e sem), então o ganho só aparece em rede real.

## Não dá para medir fora do Windows (validar no PC)

- Codificação pela placa de vídeo: o número ao lado de "Sua tela" mostra "placa de vídeo" ou "CPU".
- Jogos em tela cheia exclusiva: a captura do Windows pode entregar tela preta; use janela sem bordas.
  O Widgy não injeta nada no jogo (compatível com anti-cheat).
- Sincronia do som do PC com a imagem (o som passa pelo ajudante e por um caminho diferente do vídeo).
- Latência ponta a ponta entre dois PCs em redes diferentes.
