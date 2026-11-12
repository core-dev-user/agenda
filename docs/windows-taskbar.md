# Integração com a barra do Windows

No Windows, selecione o modo Área de trabalho e ative a substituição da barra de tarefas nas configurações do Agenda. Esta atualização seleciona uma vez o Iniciar do Agenda e habilita os atalhos; depois disso, suas preferências continuam editáveis.

| Teclas | Ação com a substituição ativa |
| --- | --- |
| Win+D | Alterna a área de trabalho mantendo a barra Widgy visível nos aplicativos comuns |
| Ctrl+Alt+D | Alternativa global para mostrar/restaurar a área de trabalho, inclusive quando o capturador de teclas do Widgy está desligado |
| Windows ou Ctrl+Esc | Iniciar do Agenda |
| Win+S / Win+Q | Pesquisa do Agenda |
| Win+I | Configurações do Agenda |
| Win+A / Win+N | Notificações do Agenda |
| Win+C | Assistente do Agenda |
| Win+1 até Win+9 | Abrir o programa fixado na posição correspondente |
| Ctrl+Alt+Backspace | Desativar a substituição e restaurar a barra original |

Iniciar, pesquisa e painéis usam o monitor onde está o mouse. As combinações com modificadores adicionais, como Win+Shift+S, continuam chegando ao Windows. Alt+Tab, Win+Tab, Win+E, Win+R, Win+L, Win+V e os atalhos de posicionamento de janelas permanecem nativos. Ctrl+Alt+Del pertence à área protegida do Windows. O Agenda não substitui o shell nem intercepta literalmente todos os atalhos. O capturador deixa de ser desativado só porque algum jogo está aberto em segundo plano. Em programas comuns e jogos sem proteção identificada, os atalhos do Widgy funcionam mesmo com a janela em primeiro plano. Em jogos conhecidos com anti-cheat, como VALORANT, Fortnite, CS2 e Roblox, o capturador é desativado quando o jogo está efetivamente em primeiro plano, e os atalhos nativos do Windows têm prioridade. Ctrl+Alt+D é uma alternativa global sem gancho de teclado, quando o sistema permitir o registro e o jogo não bloquear a combinação. Não é possível garantir atalhos globais em telas exclusivas, aplicativos elevados ou jogos que os bloqueiem.

A barra original é ocultada em todos os monitores. Ela some de novo no instante em que o Windows a reexibe (gancho de eventos `EVENT_OBJECT_SHOW` no ajudante) e, por garantia, na atualização periódica das janelas. O acesso temporário à bandeja original dura no máximo dez segundos. Se o renderizador da barra travar, a barra original aparece só durante a pausa de recuperação: três tentativas rápidas (1,5 s, 3 s, 6 s) e depois novas tentativas a cada 1 a 5 minutos, sem nunca desligar a opção escolhida. Um ajudante Win32 lento (por exemplo, com um jogo pesado) não derruba a barra. O atalho de recuperação depende do processo principal do Agenda estar responsivo e de a combinação estar disponível.

## Validação

Execute `npm run test:taskbar` e `npm run build`. O workflow também compila os dois auxiliares C# no Windows PowerShell.

Depois do build, execute `npm run test:taskbar:windows` em uma sessão Windows. Esse teste abre uma janela de teste e as prévias reais (Electron/React e miniaturas DWM), verifica a primeira abertura, reabertura com `requestAnimationFrame` suspenso, janela minimizada e remoção dos overlays. Ele usa um perfil temporário, não oculta a barra do sistema e não instala ganchos de teclado.

As prévias confirmam a assinatura do canal IPC antes de receber os dados e confirmam a atualização do DOM sem esperar quadros de animação de uma janela oculta. Pedidos antigos são descartados ao fechar ou trocar a prévia; o monitor também faz parte da identificação do pedido.

No modo Área de trabalho, o fundo cobre os limites inteiros de cada monitor, inclusive atrás da dock transparente. A área útil dos widgets e a reserva AppBar continuam separadas do fundo. A recuperação periódica também restaura a auto-ocultação caso o Explorer perca esse estado.

Antes de publicar um instalador, validar em Windows 10/11:

- Ativar/desativar, reiniciar o Agenda e verificar a restauração da barra original.
- Pressionar e manter os atalhos da tabela; conferir que o Iniciar original não aparece junto e que soltar teclas não deixa modificadores presos.
- Testar Win+D e Win+S com Chrome/VS Code na frente enquanto um jogo está aberto em segundo plano.
- Testar Win+D nativo e Ctrl+Alt+D com VALORANT/Roblox em primeiro plano; não fazer captura do teclado em processos protegidos.
- Testar Ctrl+Esc, Win+Shift+S, Alt+Tab, Win+L e jogos detectados.
- Repetir com dois monitores, escalas diferentes e desconexão de monitor.
- Reiniciar o Explorer; verificar ocultação e área reservada das janelas maximizadas.
- Abrir a bandeja original e aguardar dez segundos.
- Encerrar o renderizador da barra e usar Ctrl+Alt+Backspace para verificar recuperação.

A compilação e os testes de processos simulados não comprovam o comportamento interativo do Explorer ou do gancho de teclado.

## Resiliência e catálogo de aplicativos

O auxiliar de teclado reinicia se o PowerShell encerrar, e o auxiliar Win32 reaplica a ocultação da barra e reservas AppBar após falha. O renderizador tem tolerância a pausas temporárias; se ocorrerem cinco falhas em 45 segundos, a barra original é restaurada por segurança.

O catálogo de aplicativos usa atalhos do Menu Iniciar e da Área de Trabalho, AppsFolder (Microsoft Store/MSIX) e entradas registradas em App Paths. Programas portáteis sem atalhos ou registro podem precisar de fixação manual.


## Recuperação temporária da barra

Falhas repetidas do auxiliar nativo ou renderizador acionam primeiro a **restauração segura da barra do Windows** e depois até três tentativas automáticas de retorno do Widgy (1,5 s, 3 s e 6 s). A preferência `substituir barra` permanece marcada durante as tentativas. Se houver novas falhas na mesma janela de cinco minutos, a substituição é desativada para deixar a barra do Windows acessível. As tentativas são canceladas quando o usuário desativa a função ou fecha o aplicativo. O atalho de recuperação manual `Ctrl+Alt+Backspace` continua disponível. Os testes unitários estão em `tests/taskbar-recovery.test.cjs`.
