# Jogos fechando sozinhos depois de um tempo

## O que foi verificado

Nada no Widgy encerra ou fecha programas por conta própria. O único "fechar" de janela é o botão da prévia da
barra (e o clique com o botão do meio nela), sempre pela mão do usuário. Por isso a busca foi pelas causas
indiretas: o que o Widgy faz periodicamente enquanto um jogo roda e que pode derrubar o jogo, tirá-lo da tela
cheia (o que, em tela cheia exclusiva, parece que ele fechou) ou chamar a atenção de um anti-cheat.

## Causas encontradas e corrigidas

| # | O que acontecia | Por que pode derrubar o jogo | Correção |
| --- | --- | --- | --- |
| 1 | A cada 20 s, a varredura de jogos pedia ao Windows a **linha de comando de todos os processos** | Para ler a linha de comando, o Windows abre cada programa com permissão de ler a memória dele, inclusive o jogo. Anti-cheats vigiam exatamente esse acesso | A linha de comando só é pedida para o `javaw.exe` (Minecraft Java, o único caso que precisa dela) |
| 2 | O atalho de teclado (gancho que pega a tecla Windows) ficava ligado dentro de qualquer jogo que não estivesse numa lista fixa de 17 jogos com anti-cheat | Alguns anti-cheats encerram o jogo ao ver um programa interceptando o teclado ou injetando teclas | O gancho sai com **qualquer jogo detectado na frente** e com **qualquer programa em tela cheia na frente**. O Win+D do próprio Windows continua funcionando |
| 3 | A cada segundo, o ajudante da barra reaplicava estilo, transparência e `ShowWindow` na barra do Windows, mesmo já escondida | Faz o Windows refazer a composição da tela toda hora, inclusive com o jogo em tela cheia | Só mexe na barra do Windows quando ela realmente voltou a aparecer ou perdeu o "invisível" |
| 4 | Quando a tela mudava (resolução, monitor ligado/desligado), o Widgy refazia as barras, re-registrava o espaço reservado (AppBar) e movia a área de trabalho dele **na hora** | Muitos jogos trocam a resolução ao entrar em tela cheia. Reorganizar a tela no meio dessa troca é causa conhecida de jogo saindo da tela cheia, minimizando ou travando | Espera 1,2 a 1,5 s e, se outro programa estiver em tela cheia na frente, deixa para quando ele sair (`electron/fullscreen-state.cjs`) |
| 5 | O Widgy forçava o Wallpaper Engine a voltar a tocar a cada 10 s, a não ser com um jogo da lista dele aberto | Com um jogo que o Widgy não reconhece, o papel de parede animado continuava disputando a placa de vídeo e a memória de vídeo com o jogo | Não força com nenhum programa em tela cheia na frente; o Wallpaper Engine volta a pausar sozinho como ele mesmo faz |
| 6 | Animações, papel de parede em vídeo e efeitos só pausavam com um jogo da lista de jogos conhecidos | Jogos fora da lista ficavam com o Widgy animando ao fundo | Outro programa em tela cheia na frente conta como jogo: as animações e o vídeo pausam pelas mesmas regras de "Pausar animações quando um jogo estiver em primeiro plano" |

## Como o "tela cheia" é detectado

A barra do Widgy já consultava, a cada segundo, qual janela está na frente e se ela cobre o monitor inteiro.
Agora ela publica esse estado num módulo compartilhado (`electron/fullscreen-state.cjs`). Janelas do próprio
Widgy não contam. Sem a barra do Widgy no lugar da do Windows, esse estado não é acompanhado; nesse caso
continuam valendo as regras por jogo detectado (itens 1, 2 e 6 funcionam com a lista de jogos).

## O que não dá para afirmar daqui

- Não reproduzi o jogo fechando: não há Windows nem jogos neste ambiente. As correções atacam todos os
  mecanismos do código que podem causar o sintoma; nenhuma foi confirmada como "a" causa.
- Se o jogo continuar fechando, o que ajuda a descobrir:
  - o nome do jogo e se ele mostra alguma mensagem ao fechar (anti-cheat, "out of video memory", erro do driver);
  - o Visualizador de Eventos do Windows (Logs do Windows › Aplicativo) no horário em que fechou;
  - o registro `%APPDATA%\Widgy\widgy-diagnostics.log` e `%APPDATA%\Widgy\widgy-keys.log`;
  - se acontece também com o Widgy fechado, e se acontece com a barra do Widgy desligada.
- O ajudante de teclado (widgy-keys.exe ou PowerShell) continua aberto durante o jogo, mas sem gancho nenhum.

## Testes

`tests/games-safety.test.cjs` (em `npm run test:taskbar`): pendências durante a tela cheia rodam ao sair dela;
a varredura de jogos só pede a linha de comando do javaw.exe; a barra do Windows só é mexida quando voltou;
barras e área de trabalho esperam a tela cheia acabar; Wallpaper Engine não é forçado durante tela cheia e
volta depois; desempenho trata tela cheia como jogo. `tests/taskbar-foreground-hotkeys.test.cjs`: o gancho sai
com jogo detectado na frente (mesmo em janela) e com qualquer programa em tela cheia; continua no programa da
frente quando o jogo está atrás.
