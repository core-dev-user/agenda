# Auditoria de fluxos e interações

Fluxos conferidos: adicionar widget, personalizar widget, abrir janelas e painéis da barra, arrastar e
redimensionar. Medido no app rodando (página real `index.html` no Chromium, fora do Electron).

## Defeitos encontrados e corrigidos

| Defeito | Antes | Depois |
| --- | --- | --- |
| Painéis da barra abrindo **atrás** de uma janela aberta: área coberta de "Adicionar widget" / "Avisos" / "Início" | 91% / 80% / 94% | 0% / 0% / 0% |
| O mesmo no Carbono (menu de energia e avisos da barra lateral) | atrás da janela | por cima |
| Alças invisíveis de redimensionar dos widgets roubando cliques dentro do painel "Adicionar widget" | 652 pontos de uma grade de 6 px | 7 (só os cantos arredondados) |
| Esc fecha os painéis da barra | não | sim |
| Enter na busca de "Adicionar widget" adiciona o primeiro resultado | não | sim (o resultado fica marcado) |
| Foco depois de fechar o painel | perdido (`body`) | volta ao botão que abriu |
| Tela cheia de widgets: o novo caía em parte embaixo da barra | sim (1 de 14 no teste) | não |

### Causa dos painéis atrás da janela

O quadro de cada monitor (`.screen-frame`) tem `transform`, e por isso as camadas de dentro dele (barra
800, painel 810) só valem lá dentro. Para o resto da página o quadro inteiro valia como camada "automática",
abaixo de qualquer janela (que começa em 11). O comentário no código do Carbono já dizia que os painéis
deveriam ficar "acima das janelas". Agora, enquanto um painel está aberto, o quadro sobe para a camada 800
(regra `.screen-frame:has([data-dock-menu])` no `index.css`); fechado, tudo volta como era, então a barra
em repouso continua na mesma ordem de antes em relação às janelas.

### Causa das alças roubando cliques

As alças de redimensionar usam a camada 10 e os widgets não formavam um grupo próprio, então essa camada
valia para a página toda e ficava acima do quadro da barra. A área de trabalho agora é um grupo isolado
(`isolate`): as camadas de dentro dos widgets valem só entre widgets. Efeito colateral intencional: um
widget sendo arrastado não passa mais por cima de janelas abertas.

## Custo das interações (CPU 4× mais lenta que a desta máquina de teste)

Tempo de script por passo de mouse, com a emulação de CPU lenta do Chromium. Orçamento de um quadro a
60 Hz: 16,6 ms.

| Interação | Script | Layout + estilo | Tarefas longas |
| --- | --- | --- | --- |
| Parado | 0,7 ms | 0,0 ms | 0 |
| Mover o mouse sobre a área vazia | 2,1 ms | | |
| Arrastar widget | 10,4 ms/passo | 1,4 ms | 1 (52 ms) |
| Redimensionar widget | 7,9 ms/passo | 1,7 ms | 0 |
| Arrastar janela | 4,3 ms/passo | 1,3 ms | 1 (55 ms) |
| Abrir janela Hoje | 209 ms | 53 ms | 1 (66 ms) |
| Abrir Configurações | 186 ms | 74 ms | 2 (máx 72 ms) |
| Trocar de aba em Configurações (4 abas) | 96 a 161 ms | 32 a 58 ms | 1 cada (máx 141 ms) |
| Abrir "Adicionar widget" | 157 ms | 53 ms | 1 (97 ms) |

Leitura: nada passa de 150 ms numa tarefa só, mesmo 4× mais lento. Arrastar fica dentro do orçamento do
quadro. O custo de arrastar é quase o mesmo para qualquer widget (6 a 10 ms/passo entre 8 tipos), ou seja,
vem da moldura e não do conteúdo; e não muda de forma consistente ao desligar o efeito de cursor ou a
inclinação 3D. Não houve o que otimizar aqui com ganho mensurável, então nada foi mexido.

Outros tempos (sem CPU lenta): abrir "Adicionar widget" 80 a 130 ms; abrir os ajustes de um widget 122 ms.

## Conferido e sem defeito

- O widget novo nunca sobrepõe outro enquanto há espaço, e não sai da tela (teste automático).
- O arrasto guarda a posição só ao soltar: não grava no disco a cada movimento.
- Ajustes do widget: abrem em diálogo arrastável, fecham com Esc, o foco volta.

## Limites

- Tempos medidos em Chromium com renderização por software: servem para comparar e achar tarefas longas,
  não como números do app instalado. Taxa de quadros real e uso de GPU só na máquina.
- Com a tela cheia, o widget novo ainda cai sobre outros (não há onde pôr); ele escolhe a menor sobreposição.
- O diálogo de ajustes escurece o fundo, inclusive o widget que está sendo ajustado. Dá para arrastar o
  diálogo, mas a prévia fica escurecida. Não mexi: é escolha visual.

## Como repetir

`npm run test:flows` confere as camadas (painel acima das janelas, área de trabalho isolada), o Esc e o Enter
dos painéis e a regra de posicionamento do widget novo.
