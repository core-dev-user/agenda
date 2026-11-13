# Auditoria das Configurações, aba por aba

As 14 abas foram abertas no app rodando (página real no Chromium, fora do Electron), medidas e lidas uma
a uma. Este documento lista o que foi encontrado, o que foi corrigido e o que ficou como está.

## Defeitos corrigidos

### 1. "Importar backup" aceitava qualquer arquivo (Sistema)

O arquivo escolhido era gravado direto no estado do app, sem conferir nada. Teste pela própria interface,
com cinco arquivos:

| Arquivo | Antes | Depois |
| --- | --- | --- |
| Configurações nulas (`{"settings":null}`) | tela inteira em branco, 4 erros | recusado com mensagem |
| Configurações pela metade (barra nula, papel de parede errado) | tela inteira em branco, 3 erros | aceito; os 2 ajustes ruins voltam ao padrão, com aviso |
| Widget de tipo desconhecido | entrava um widget quebrado | fica de fora; os widgets atuais são mantidos |
| Arquivo de outro programa (`package.json`) | perguntava se queria substituir tudo | recusado: "não é um backup do Widgy" |
| Texto que não é JSON | "Arquivo inválido" | "O arquivo não é um JSON válido." |

A conferência fica em `src/lib/backup.ts`, com 9 testes: só entram dados conhecidos, cada um no formato
certo; as configurações são completadas com os padrões (um backup antigo não tem os ajustes novos); nada
do estado interno do app (janelas abertas, busca) pode ser injetado por um arquivo; uma lista sem nenhum
item aproveitável nunca apaga o que o usuário já tem.

### 2. "Exportar backup" deixava dados de fora (Sistema)

Não entravam o histórico de música, o registro de jogos, as galerias de fotos e os modelos do widget de
agente. Agora entram. O arquivo passa a se chamar `widgy-backup-AAAA-MM-DD.json` e a descrição diz o que
entra e o que não entra (imagens e Finanças).

### 3. Sem proteção contra erro na raiz

Qualquer erro ao desenhar a tela principal deixava tudo em branco; no modo área de trabalho isso significa
PC sem fundo e sem barra. Agora aparece um cartão com três saídas: tentar de novo, reiniciar a tela e voltar
as configurações ao padrão. Testado provocando o erro: o cartão aparece, e "Configurações padrão" devolve
o app com os 4 widgets do teste intactos.

### 4. Confirmação enganosa em "Configurações padrão" (Sistema)

A pergunta dizia "configurações visuais", mas o botão zera todas (avisos, agendas conectadas, times
favoritos). O texto agora diz o que de fato acontece e o que não muda (widgets e dados).

### 5. Ajuste sem efeito (Barra e ícones)

"Esconder a barra do PC quando um programa estiver maximizado" aparecia sempre, mas só vale quando a barra
do Widgy está no lugar da do Windows. Agora só aparece nesse caso.

### 6. Duas abas fora do padrão e fora da busca

Templates e Bichinho ainda usavam caixas com título serifado grande, enquanto as outras 12 abas usam seções
planas. Foram convertidas. Com isso, e com as seções de Fontes que faltavam no índice, a busca de
Configurações passa a encontrar todas as seções:

| | Antes | Depois |
| --- | --- | --- |
| Abas sem nenhuma seção na busca | 3 de 14 (Templates, Fontes, Bichinho) | 0 |
| Seções no código que a busca não achava | 9 | 0 (teste automático) |

### 7. Ajustes menores

- Barra e ícones: a seção "Barra de tarefas" vem primeiro (antes ficava depois de uma tela e meia de ícones).
- "Mostrar nomes das seções" virou "Mostrar o nome dos apps na barra" (o resto da tela fala em apps).
- Integrações: a descrição dizia "me conte o nome que aparece aqui"; agora "o nome que aparece aqui é o que
  precisa de conserto". A verificação ganhou limite de 45 s e não fica mais presa se algo der erro no meio
  (proteção: não reproduzi a verificação presa).
- Rotina e avisos: o WhatsApp usava um emoji no lugar do ícone; o campo da playlist do foco era estreito e
  cortava o texto; as caixas de marcar passam a usar a cor de destaque do tema.
- Bichinho: descrição de 321 letras reduzida para 221.

## Medidas por aba (janela de 1100 × 720)

| Aba | Telas de rolagem | Controles | Seções |
| --- | --- | --- | --- |
| Modo de uso | 1,0 | 22 | 2 |
| Templates | 1,2 | 6 | 3 |
| Pacotes | 1,7 | 29 | 2 |
| Aparência | 1,6 | 28 | 4 |
| Fontes | 1,0 | 22 | 3 |
| Cursor | 1,9 | 48 | 4 |
| Papel de parede | 2,2 | 27 | 4 |
| Sakura e efeitos | 1,0 | 26 | 2 |
| Barra e ícones | 3,0 | 48 | 3 |
| Widgets | 1,0 | 22 | 1 |
| Bichinho | 1,9 | 22 | 3 |
| Rotina e avisos | 2,6 | 36 | 5 |
| Integrações | 1,0 | 19 | 1 |
| Sistema | 2,8 | 16 | 8 |

Nenhum controle sem nome para leitor de tela nas 14 abas (0 de 1065).

## Visto e mantido

- Barra e ícones (3 telas) e Sistema (2,8 telas) são longas. Dividir em mais abas mudaria onde o usuário
  já sabe achar as coisas; a busca e a nova ordem resolvem o acesso. Não dividi.
- Em Sistema, "Backup na nuvem" e "Backup" ficam separados por três seções. Juntá-los exigiria mover
  seções entre dois arquivos; ficou para depois.
- "Abrir o Widgy ao ligar o computador" aparece ligável fora do app instalado, com o aviso "Disponível no
  app desktop". No app instalado o aviso não aparece.

## Não verificado aqui

- O que depende do Windows: iniciar com o sistema, bandeja, atalho global, pasta do backup na nuvem,
  escolha de monitor, barra do PC.
- A importação com um backup real e grande (com imagens e muitos dados) no app instalado.

## Como repetir

`npm run test:security` (inclui os testes do backup) e `npm run test:templates` (índice da busca).
