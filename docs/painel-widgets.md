# Painel de personalizar dos widgets

O que mudou no painel que abre em "Configurar" de cada widget, e por quê.

## Antes

Uma janela no meio da tela, com fundo escurecido, e todas as opções numa coluna só: as do widget, depois
tamanho, imagem de fundo, aparência e opacidade. No relógio eram 68 controles numa rolagem única. O widget
que estava sendo ajustado ficava escurecido atrás da janela. Seis widgets (esportes, desempenho do PC,
música do PC, contagem regressiva, Meu time e agente do Valorant) tinham painéis próprios, cada um com um
desenho diferente.

## Agora

- **Painel ao lado do widget**, sem escurecer a tela: a mudança aparece no próprio widget, que ganha um
  contorno para saber qual é. O painel abre à direita (ou à esquerda, se não couber), não cobre a barra e
  pode ser arrastado pelo cabeçalho. Só um painel fica aberto por vez.
- **Três abas**: Conteúdo (o que é só daquele widget), Aparência e Tamanho. Widgets sem opções próprias
  mostram só as duas últimas.
- **Menu de ações** (os três pontos): copiar e colar configuração, modo descanso, usar a aparência em
  todos, voltar a aparência ao padrão, remover.
- **Um conjunto só de peças** para os 27 tipos de widget (`src/widgets/inspector.tsx`): grupo, linha,
  interruptor, deslizante com botão de voltar ao padrão, escolha em segmentos, opções com miniatura e
  amostras de cor com a opção "do tema".
- **Miniaturas desenhadas** para os estilos do relógio e da contagem regressiva, no lugar de símbolos de
  fonte (que saíam de tamanhos diferentes).
- Funciona nos cinco temas, claro e escuro.

## Opções sem efeito ou sem utilidade

Cada controle foi testado no app: mexe-se nele a partir do widget "zerado" e compara-se o widget antes e
depois.

| Achado | O que foi feito |
| --- | --- |
| "Cor de destaque" não mudava nada em 14 tipos de widget (nota, foto, clima, notícias, WhatsApp, Discord, iFood, finanças, agenda, estatísticas, jogos, letra, clipe, Meu time), porque eles não usam essa cor | Só aparece nos widgets que a usam, ou quando a sombra ou o efeito de passar o mouse dependem dela |
| Contagem regressiva: a "cor" não mudava o número no estilo padrão (só ícone, barra e anel) | Passou a se chamar "Cor de destaque", com uma linha dizendo o que ela pinta em cada estilo; e a cor do número, que existia no código sem controle, ganhou o seu |
| Quadro de fotos: transição e tempo de troca apareciam com uma foto só | Aparecem a partir de duas fotos |
| Contagem regressiva: a grade inteira de ícones ficava sempre aberta | Abre ao clicar em "Escolher" |
| "Em todos" e "Padrão" soltos no meio da aparência; copiar, colar e descanso no topo de tudo | Foram para o menu de ações |
| Textos longos de dica (música, tarefas, esportes, desempenho) | Encurtados e postos junto da opção a que se referem |

Depois das mudanças: aba Aparência com 0 opções sem efeito no relógio, na nota e no clima; contagem
regressiva com 0 em 39 controles.

## Não verificável aqui

Opções de widgets que dependem de dados do PC ou da internet (música tocando, Spotify, placares, notícias,
WhatsApp, agente do Valorant) não puderam ser testadas uma a uma fora do app instalado: sem dados o widget
mostra o estado vazio e nada muda. O painel delas foi redesenhado, mas o efeito de cada opção precisa ser
conferido no Windows.

## Como repetir

`npm run test:widgets` confere que todos os painéis usam as peças novas, que cada widget com opções
próprias tem sua aba Conteúdo e que a cor de destaque só aparece onde é usada.
