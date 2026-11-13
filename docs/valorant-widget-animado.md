# Widget "Valorant: agente" animado

## Arquitetura

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Motor de efeitos | `src/widgets/valorant/fx.ts` | Sem React e sem DOM. 35 tipos de camada (lâminas, vento, brasas, chamas, orbes, anéis, raios, fumaça, cristais, barreira, varredura, radar, circuito, mira orbital, disparos, ícones, rasgos, ondas, malha, prismas, linhas de velocidade, espinhos, foguetes, olhos, estrelas, linha cósmica, reflexo, luneta, bolhas, falha no chão, explosões, fios, folhas, cura, clarão). Cada agente tem uma receita por UUID. |
| Laço de animação | `src/widgets/valorant/AgentFx.tsx` | Um `requestAnimationFrame` por widget desenhando em dois canvas (atrás e na frente do agente). Nenhum re-render do React por quadro. |
| Catálogo de mapas | `src/widgets/valorant/maps.ts` e `maps-core.ts` | Baixa o catálogo só quando um widget usa fundo de mapa; guarda 7 dias. Funções puras separadas para teste. |
| Widget e painel | `src/widgets/ValAgentWidget.tsx` | Camadas do widget, fundo de mapa, opções novas no `ValLook`, grupos "Animação do agente" (aba Conteúdo) e "Fundo do agente" (aba Aparência). |
| Mapa da partida | `electron/gamestats.cjs` | A resposta da partida que o Widgy já consultava para saber o agente também traz `MapID`; agora ele segue junto. |

Ordem das camadas no widget, de trás para a frente:

1. Fundo base (degradê ou cor do agente).
2. Arte do agente, imagem própria ou mapa, com escurecimento e degradê por cima.
3. Canvas de trás (efeitos atrás do agente).
4. Arte oficial do agente (com parallax opcional).
5. Sombra para o texto.
6. Canvas da frente (efeitos na frente do agente: lâminas que passam pela frente, chamas, ondas, espinhos do chão).
7. Nome, função, habilidades e tempo de partida.

O agente é sempre a arte oficial, carregada do catálogo. Os efeitos são formas abstratas desenhadas por cima e
por trás; nenhum personagem é redesenhado. Na Gekko e na Skye, as criaturas aparecem como os ícones oficiais
das habilidades. Agentes novos usam o ícone oficial da ultimate.

## Agentes e efeitos

Os 30 agentes jogáveis do catálogo (consultado em 13/11/2026): 27 com efeito próprio e 3 com o efeito de
reserva. "Reserva" usa a paleta oficial do agente, a função e o ícone oficial da ultimate. É também o que
um agente lançado depois recebe automaticamente: o widget lê a lista do catálogo, não uma lista fixa.

| Agente | Função | Efeito | Inspiração | Camadas (Característico) | Camadas (Ultimate) |
| --- | --- | --- | --- | --- | --- |
| Astra | Controlador | próprio | Estrelas e constelação; a linha da Divisa Cósmica atravessa o fundo. | stars, cosmic, smoke | stars, cosmic, smoke, flash |
| Breach | Iniciador | próprio | Falha sísmica no chão e ondas laranja (Onda Trovejante). | crack, rings/ground, embers | crack, rings/ground, embers, flash |
| Brimstone | Controlador | próprio | Mira do Ataque Orbital no chão, feixe e impacto; fumaça leve. | smoke, orbital | smoke, orbital, flash |
| Chamber | Sentinela | próprio | Reflexos dourados, cristais e a luneta do Tour de Force. | sheen, shards, reticle | sheen, shards, reticle, flash |
| Clove | Controlador | próprio | Partículas roxas e rosadas, fios etéreos subindo. | orbs, wisps, heal | orbs, wisps, heal, flash |
| Cypher | Sentinela | próprio | Linha de varredura e cantos de câmera de vigilância; fios de armadilha em circuito. | scan, circuit | scan, circuit, flash |
| Deadlock | Sentinela | próprio | Malha de nanofios em volta do agente (Aniquilação) e campos de contenção. | wires, rings | wires, rings, flash |
| Fade | Iniciador | próprio | Névoa escura, fios de sombra e olhos espectrais (Véu da Noite). | smoke, eyes, wisps | smoke, eyes, wisps, flash |
| Gekko | Iniciador | próprio | As criaturas aparecem como os ícones oficiais das habilidades, flutuando, com partículas. | icons, heal | icons, heal, flash |
| Harbor | Controlador | próprio | Ondas na base e uma parede de água atravessando o widget. | waves, bubbles | waves, bubbles, flash |
| Hush | Duelista | reserva | Efeito de reserva (Duelista): paleta oficial do agente e o ícone oficial da ultimate. | streaks, embers, icons | streaks, embers, icons, flash |
| Iso | Duelista | próprio | Escudos prismáticos hexagonais orbitando e fragmentos de energia. | prism, shards/hex | prism, shards/hex, flash |
| Jett | Duelista | próprio | Tormenta de Aço: cinco adagas orbitando com um pulso que corre pelas lâminas; correntes de vento atrás. | wind, blades, streaks/up | wind, blades, streaks/up, flash |
| KAY/O | Iniciador | próprio | Pulsos de supressão em anéis segmentados, holograma e circuito. | rings/seg, circuit/glitch, bolts | rings/seg, circuit/glitch, bolts, flash |
| Killjoy | Sentinela | próprio | Circuitos amarelos, holograma e o pulso no chão do Confinamento. | circuit/glitch, rings/ground | circuit/glitch, rings/ground, flash |
| Miks | Controlador | reserva | Efeito de reserva (Controlador): paleta oficial do agente e o ícone oficial da ultimate. | smoke, orbs, icons | smoke, orbs, icons, flash |
| Neon | Duelista | próprio | Raios azuis, descargas e linhas de velocidade (Sobrecarga). | streaks, bolts, embers | streaks, bolts, embers, flash |
| Omen | Controlador | próprio | Névoa violeta, fios de sombra subindo e ondas do Salto das Sombras. | smoke, wisps, rings | smoke, wisps, rings, flash |
| Phoenix | Duelista | próprio | Chamas na base, brasas subindo e, no modo Ultimate, o clarão de Renascimento. | flames, embers | flames, embers, flash, rings |
| Raze | Duelista | próprio | Explosões e fumaça; um foguete (Estraga-prazeres) cruza de tempos em tempos. | blasts, embers, rockets/single | blasts, embers, rockets/single, flash |
| Reyna | Duelista | próprio | Orbes de alma roxos flutuando e os pulsos de Imperatriz. | smoke, orbs, rings | smoke, orbs, rings, flash |
| Sage | Sentinela | próprio | Cristais verdes, partículas de cura e a Barreira de cristal se formando. | barrier, shards, heal | barrier, shards, heal, flash |
| Skye | Iniciador | próprio | Luz verde, folhas e os ícones oficiais das habilidades de criaturas flutuando. | leaves, heal, icons | leaves, heal, icons, flash |
| Sova | Iniciador | próprio | Radar azul de reconhecimento; no modo Ultimate, os três disparos da Fúria do Caçador. | radar, embers | beams, radar |
| Tejo | Iniciador | próprio | Salva de foguetes em arco com rastros e impactos (Armagedom). | rockets, embers | rockets, embers, flash |
| Veto | Sentinela | reserva | Efeito de reserva (Sentinela): paleta oficial do agente e o ícone oficial da ultimate. | circuit, shards/hex, icons | circuit, shards/hex, icons, flash |
| Viper | Controlador | próprio | Gás tóxico verde, bolhas e ondas químicas. | smoke, bubbles, wisps | smoke, bubbles, wisps, flash |
| Vyse | Sentinela | próprio | Espinhos metálicos brotando do chão (Jardim de Aço) e fragmentos. | spikes, shards | spikes, shards, flash |
| Waylay | Duelista | próprio | Rastros de luz refratada e prismas (Caminhos Convergentes). | prism/streak, streaks, shards | prism/streak, streaks, shards, flash |
| Yoru | Duelista | próprio | Rasgos dimensionais azul-escuros puxando partículas (Espionagem Dimensional). | smoke, rifts | smoke, rifts, flash |

Hush, Miks e Veto ficaram no efeito de reserva porque não conheço as habilidades deles o bastante para
criar algo fiel. Prefiro isso a inventar.

O modo **Ambiente** usa as camadas do Característico sem flashes, explosões e disparos, mais lentas e
suaves. Quando um agente tem um modo Ultimate próprio (Phoenix, Sova), ele é usado; nos outros, o Ultimate
é o Característico com mais elementos, um pouco mais rápido e com um clarão periódico.

### Jett

Cinco adagas (quantidade fixa: não muda com intensidade, partículas ou economia) orbitam numa elipse em
volta dela. As que estão "atrás" são desenhadas no canvas de trás e as da "frente" no da frente, então elas
passam de verdade por trás e pela frente da arte. A cada 3,6 s um pulso de luz percorre as lâminas uma a uma.
Cada lâmina tem um rastro curto (sem rastro no modo economia). Atrás, correntes de vento em arcos.

## Fontes das imagens

Todas as imagens vêm do catálogo público valorant-api.com, que serve os arquivos oficiais do jogo:

- Agentes: `https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=pt-BR` (retrato completo,
  busto, ícone, arte de fundo, ícones de função e habilidades).
- Mapas: `https://valorant-api.com/v1/maps?language=pt-BR` (`splash`, `stylizedBackgroundImage`,
  `premierBackgroundImage` para o fundo; `listViewIcon`, 456 × 100 px e cerca de 65 KB, para as miniaturas).

A API oficial da Riot (developer.riotgames.com) não oferece as imagens de agentes e mapas; o valorant-api.com
é um agregador não oficial que redistribui os arquivos do jogo. Nenhuma imagem é gerada, editada ou
redesenhada. O uso segue a política da Riot para projetos de fãs ("Legal Jibber Jabber"): sem fins
comerciais e sem dar a entender que a Riot apoia o projeto.

## Fundo de mapa

Aparência › Fundo do agente: **Degradê**, **Arte do agente**, **Cor**, **Sua imagem** (já existiam),
**Mapa** e **Mapa aleatório** (novos).

- **Mapa**: grade com as miniaturas oficiais e busca pelo nome. Competitivos primeiro, depois mata-mata,
  duelo e treino. "The Range" aparece uma vez só.
- **Mapa aleatório**: sorteia entre os mapas competitivos; muda ao trocar de agente e ao abrir o widget, não
  a cada redesenho.
- **Imagem**: Cena (`splash`), Arte (estilizada) ou Premier. Sem a imagem pedida, usa a cena.
- **Acompanhar o mapa da partida**: com o Valorant aberto, usa o mapa informado pela própria partida
  (seleção de agentes e partida em andamento). Fora dela, volta ao mapa escolhido.
- **Ajustes**: escala, posição horizontal e vertical, escurecer, desfoque, saturação, intensidade das cores,
  degradê do agente por cima, profundidade ao mover o mouse e panorâmica lenta.

Os filtros do mapa (desfoque, saturação, contraste) são fixos: só mudam quando o ajuste muda, nunca a cada
quadro. A panorâmica e o parallax animam só `transform`.

## Opções da animação

Conteúdo › Animação do agente: liga e desliga; tipo (Característico, Ultimate, Ambiente); intensidade (baixa,
média, alta); velocidade (lenta, normal, rápida); quantidade de partículas (30% a 200%); profundidade ao mover
o mouse; pausar fora da tela; economia de recursos (metade das partículas, sem rastros, 30 quadros por segundo).

Conteúdo › Imagem do agente ganhou **Luz da arte** e **Sombra**. Retrato completo, busto, ícone e foto
própria continuam como antes.

Todas as opções ficam no `look` do widget: valem depois de reiniciar, entram nos modelos do agente, nos
templates locais e no backup.

## Desempenho

O que o laço faz para não pesar:

- No máximo 60 quadros por segundo; a velocidade vem do tempo real, então 60, 144 e 180 Hz andam igual
  (testado). No modo economia, 30.
- Respeita o limite de animação do Widgy (`perfVisualFps`), que cai em PC fraco e com jogo aberto.
- Para quando o Widgy está oculto, quando o modo jogo pausa as animações e (opcional) quando o widget está
  fora da tela.
- "Animações" desligado ou "reduzir movimento" do Windows: desenha um quadro parado e não roda o laço.
- Bolinhas de luz pré-desenhadas e compartilhadas entre widgets; imagens só carregam quando usadas.
- Ao tirar o widget ou desligar a animação, o laço e os observadores são desligados (testado: o contador de
  laços volta a zero, inclusive depois de cinco ciclos de montar e desmontar).

### Medições

Medido neste ambiente: Chromium sem placa de vídeo (a composição de imagem é feita pelo processador), 4
núcleos. Um widget de 360 × 400 com Jett e Ascent, 8 s por cenário. "CPU" é o tempo de trabalho da thread
principal por segundo. São números reais, mas não do Windows: no PC, com placa de vídeo, a composição sai da
CPU e o custo deve ser menor. Não medi no Windows.

Este ambiente tem 4 núcleos, e o Widgy trata isso como PC fraco: no perfil automático todas as animações ficam
limitadas a 20 quadros por segundo (17 na prática). Por isso há duas tabelas.

**Perfil automático (o que esta máquina usaria):**

| Cenário | Quadros/s | CPU (ms/s) | Script (ms/s) | Memória JS (MB) |
| --- | --- | --- | --- | --- |
| sem widget | 0 | 5.6 | 4.8 | 22.5 |
| widget parado (animação desligada) | 0 | 5.6 | 5 | 22.9 |
| leve (intensidade baixa) | 17 | 60.9 | 10.8 | 23.3 |
| normal (média) | 17 | 62 | 10.5 | 24.1 |
| intensa (alta, 200% partículas) | 17 | 67.1 | 11.6 | 23.7 |
| Phoenix intensa + ultimate | 17 | 69.4 | 11.9 | 23.4 |
| normal, economia de recursos | 17 | 52.1 | 8.1 | 23.4 |
| normal, fora da tela (pausa) | 0 | 5.8 | 3.9 | 23.5 |

**Perfil Qualidade (60 quadros por segundo):**

| Cenário | Quadros/s | CPU (ms/s) | Script (ms/s) | Memória JS (MB) |
| --- | --- | --- | --- | --- |
| sem widget | 0 | 5.3 | 4.8 | 22.5 |
| widget parado (animação desligada) | 0 | 4.8 | 4.4 | 22.9 |
| leve (intensidade baixa) | 51 | 140.3 | 17.5 | 23.6 |
| normal (média) | 51 | 157.3 | 19.4 | 23 |
| intensa (alta, 200% partículas) | 51 | 167.6 | 21.9 | 24 |
| Phoenix intensa + ultimate | 51 | 165 | 23.5 | 23.9 |
| normal, economia de recursos | 25 | 78.7 | 11.1 | 23.9 |
| normal, fora da tela (pausa) | 0 | 6 | 4.3 | 23.7 |

**Perfil Qualidade com o processador 4× mais lento (simulação de PC fraco):**

| Cenário | Quadros/s | CPU (ms/s) | Script (ms/s) | Memória JS (MB) |
| --- | --- | --- | --- | --- |
| sem widget | 0 | 30.8 | 28.6 | 22.6 |
| widget parado (animação desligada) | 0 | 19.7 | 18.3 | 22.7 |
| leve (intensidade baixa) | 50 | 536.2 | 64.9 | 23.6 |
| normal (média) | 50 | 546.8 | 70.1 | 24.2 |
| intensa (alta, 200% partículas) | 50 | 653.3 | 80.8 | 23.2 |
| Phoenix intensa + ultimate | 50 | 656.4 | 96.1 | 24.5 |
| normal, economia de recursos | 25 | 342.5 | 49.5 | 23.8 |
| normal, fora da tela (pausa) | 0 | 28.7 | 22.9 | 24.3 |

Leitura:

- O desenho dos efeitos em si custa pouco: 10 a 24 ms de script por segundo a 50 quadros por segundo, quase
  igual entre leve, normal e intensa. A maior parte do custo é compor a imagem, que aqui roda sem placa de
  vídeo. Repetindo a mesma medição, o total variou entre 104 e 145 ms/s; as diferenças entre os ajustes
  testados (desfoque atrás, filtros da arte, um canvas só) ficaram dentro dessa variação, então não mudei nada
  por palpite.
- Memória: menos de 2 MB a mais de JavaScript com a animação ligada. A imagem do mapa (1920 × 1080) ocupa
  memória de imagem, fora desse número.
- Fora da tela: 0 quadros e o custo volta ao de sem widget.
- Economia de recursos: cerca de metade do custo a 60 quadros por segundo.
- Com jogo aberto, o modo jogo do Widgy já pausa ou limita as animações; nada disso foi medido com um jogo
  rodando.

## Testes executados

| Comando | Resultado |
| --- | --- |
| `npm run build` | passou |
| `npm run test:media` | 14 de 14 |
| `npm run test:templates` | 13 de 13 |
| `npm run test:a11y` | 5 de 5 |
| `npm run test:perf` | 18 de 18 |
| `npm run test:flows` | 6 de 6 |
| `npm run test:valorant` (novo) | 17 de 17 |
| todos os testes juntos | 156 de 156 |

`tests/valorant-fx.test.mjs` (com o catálogo real reduzido em `tests/fixtures`) cobre:

1. Todos os 30 agentes do catálogo têm efeito em todos os modos; 27 próprios, 3 de reserva (listados).
2. Cada receita própria aponta para um UUID que existe, com o nome certo; nenhuma repete as camadas de outra.
3. Jett tem exatamente cinco adagas em todos os modos e opções, e elas passam por trás e pela frente.
4. Todos os agentes desenham sem erro e sem número inválido, pequenos (150 × 110) e grandes (980 × 720).
5. Agente futuro sem receita recebe o efeito de reserva com o ícone oficial; sem ícone, sem a camada.
6. A posição depois de 2 s é a mesma a 60, 144 e 180 Hz.
7. Ambiente não tem flashes nem explosões; economia e menos partículas desenham menos.
8. Mapas: sem repetidos, competitivos primeiro, imagem de reserva, mapa da partida pelo caminho interno,
   sorteio estável e só entre competitivos.
9. Opções novas no `look` padrão; o backup preserva o `look` do widget e os modelos do agente.

No app rodando (Chromium):

- Trocar de agente troca arte, cores e efeito; trocar de mapa não muda o agente.
- Modo automático: com o jogo informando Sage em Lotus, o widget mostra Sage em Lotus; ao fim da partida,
  volta ao agente e ao mapa escolhidos.
- 150 × 120, 240 × 260 e 900 × 700: canvas do tamanho do widget, nada passa dos limites.
- Laços de animação voltam a zero ao desligar a animação e ao tirar o widget.
- Os 27 tipos de widget abrem e os painéis deles abrem sem erro.
- Painel do widget: 88 controles, todos com nome para leitor de tela.

## Limitações

- Hush, Miks e Veto usam o efeito de reserva.
- O compartilhamento de template por código (WDG1) não leva o visual do widget do Valorant: ele já descartava,
  por segurança, toda configuração que não é um valor simples, em todos os widgets. Templates locais, modelos
  do agente e backup levam tudo.
- As imagens dependem do valorant-api.com. Sem internet e sem cópia guardada, o widget mostra o aviso que já
  existia (agentes) e o fundo de mapa cai no degradê do agente.
- Não medido no Windows nem com jogo aberto.
