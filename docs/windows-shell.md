# Agenda como interface principal do PC

O modo Área de trabalho agora pode substituir a barra principal usando uma AppBar registrada no Windows. O Explorer continua ativo para arquivos, bandeja e recursos do sistema; a alteração não troca o shell de login do Windows e não exige Windhawk.

## Ativar

1. Compile a versão desta branch com `npm ci` e `npm run build`, ou gere a distribuição com `npm run dist`.
2. Em Configurações → Modo de uso, selecione Área de trabalho e o monitor principal. Aplique a mudança.
3. Ative “Usar a barra do Agenda como barra principal do Windows”. A barra original só é escondida depois de carregar a interface, iniciar a recuperação independente e obter a reserva do Windows.
4. Em Sistema, habilite iniciar com o Windows se desejar.

Ctrl+Alt+Home abre o menu Iniciar do Agenda. Ctrl+Alt+Backspace desativa a substituição e restaura a barra do Windows. Os atalhos são registrados apenas enquanto a barra está ativa e dependem de não estarem ocupados por outro aplicativo. A tecla Windows e suas combinações continuam com o comportamento original.

A seta da bandeja mostra temporariamente a barra original para acessar seus ícones; ela volta a ser escondida após 12 segundos. Som e rede abrem as configurações do Windows. Notificações do sistema, jump lists, prévias de janelas e desktops virtuais não foram reimplementados.

## Implementação

- `electron/native/AgendaShell.cs`: SHAppBarMessage (NEW/QUERYPOS/SETPOS/REMOVE), monitoramento WinEvent em uma thread com loop de mensagens, tratamento de TaskbarCreated, DPI por monitor e comandos Win32 existentes.
- `electron/native/host.ps1`: compila a DLL C# em cache versionado no perfil do usuário e inicia o componente. Os arquivos nativos são extraídos do ASAR na distribuição.
- `electron/native/watchdog.ps1`: processo independente que observa os processos do Agenda e do ajudante, recuperando a barra por um journal salvo antes de alterar o Explorer.
- `electron/native-client.cjs`: respostas identificadas, eventos separados de comandos, timeout de inicialização e comandos. Falhas não deixam promises aguardando indefinidamente.
- `electron/bar.cjs`: ativação após confirmação, atualização de programas por eventos agrupados, reconciliação a cada 30 segundos e retorno à navegação interna quando há falha.

O journal registra o estado original de auto-ocultação da barra do Explorer e a janela registrada. A recuperação remove a AppBar, restaura esse estado e mostra a barra original. Um mutex entre processos evita disputa entre recuperação e nova ativação. Ao reiniciar, journals de ajudantes que já não existem são recuperados. Se o processo principal deixar de enviar heartbeat por 30 segundos, o ajudante também abandona a substituição.

O ajudante e o guardião usam processos PowerShell persistentes com DLL C# em cache; essa recuperação independente tem custo de memória, que deve entrar na comparação de desempenho no Windows.

A implementação substitui a barra **do monitor principal**. As barras secundárias do Windows permanecem disponíveis. Não usa SPI_SETWORKAREA, não mata o Explorer e não injeta código nele. Apenas uma instância do Agenda pode assumir o perfil.

## Verificar

- `npm test`: persistência, timers, protocolo nativo, comandos fora de ordem, timeouts, agrupamento de eventos, ativação/erro/recuperação da barra com dependências simuladas. Inclui desligar/religar durante a abertura e encerrar com uma gravação em disco em andamento.
- `npm run build`: TypeScript e bundle de produção.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests/windows-native.ps1`: compila C# no Windows e exercita inicialização, heartbeat, listagem real de janelas, rejeição de HWND inválido, encerramento por EOF e processo de recuperação. Não assume a barra do computador usado no teste.
- O workflow `Windows shell checks` executa essas verificações no Windows.

## Validação interativa necessária no Windows 10/11

1. Ativar/desativar a barra; maximizar Bloco de Notas e Explorer e confirmar que não cobrem a AppBar.
2. Abrir, alternar, minimizar e fechar programas; conferir atualização da barra e programas fixados.
3. Entrar e sair de jogo/vídeo em tela cheia no monitor principal; repetir no secundário, onde não deve esconder a barra principal.
4. Testar escalas 100%, 125%, 150%; trocar o monitor principal e desconectar um monitor.
5. Reiniciar o Explorer pelo Gerenciador de Tarefas e verificar o novo registro da AppBar.
6. Em perfil de teste, encerrar o ajudante nativo, depois o Agenda, e conferir a restauração da barra e da área útil; testar o atalho de recuperação.
7. Suspender/desbloquear, usar a bandeja temporária e iniciar junto com o Windows.
8. Testar a distribuição empacotada, incluindo a extração dos arquivos nativos e permissões do PowerShell.

Esses testes interativos ainda são necessários antes de tratar a substituição como pronta para uso diário. O CI valida compilação/protocolo, mas não comprova a integração visual com o Explorer, jogos ou vários monitores.
