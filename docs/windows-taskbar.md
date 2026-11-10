# Integração com a barra do Windows

No Windows, selecione o modo Área de trabalho e ative a substituição da barra de tarefas nas configurações do Agenda. Esta atualização seleciona uma vez o Iniciar do Agenda e habilita os atalhos; depois disso, suas preferências continuam editáveis.

| Teclas | Ação com a substituição ativa |
| --- | --- |
| Windows ou Ctrl+Esc | Iniciar do Agenda |
| Win+S / Win+Q | Pesquisa do Agenda |
| Win+I | Configurações do Agenda |
| Win+A / Win+N | Notificações do Agenda |
| Win+C | Assistente do Agenda |
| Win+1 até Win+9 | Abrir o programa fixado na posição correspondente |
| Ctrl+Alt+Backspace | Desativar a substituição e restaurar a barra original |

Iniciar, pesquisa e painéis usam o monitor onde está o mouse. As combinações com modificadores adicionais, como Win+Shift+S, continuam chegando ao Windows. Alt+Tab, Win+Tab, Win+E, Win+R, Win+L, Win+V e os atalhos de posicionamento de janelas permanecem nativos. Ctrl+Alt+Del pertence à área protegida do Windows. O Agenda não substitui o shell nem intercepta literalmente todos os atalhos. Durante jogos detectados pelo aplicativo, o gancho de teclado continua desativado para compatibilidade com anti-cheat.

A barra original é ocultada em todos os monitores e a ocultação é reaplicada na atualização periódica das janelas. O acesso temporário à bandeja original dura no máximo dez segundos. Uma falha ou travamento detectado no renderizador da barra desativa a substituição. O atalho de recuperação depende do processo principal do Agenda estar responsivo e de a combinação estar disponível.

## Validação

Execute `npm run test:taskbar` e `npm run build`. O workflow também compila os dois auxiliares C# no Windows PowerShell.

Depois do build, execute `npm run test:taskbar:windows` em uma sessão Windows. Esse teste abre uma janela de teste e as prévias reais (Electron/React e miniaturas DWM), verifica a primeira abertura, reabertura com `requestAnimationFrame` suspenso, janela minimizada e remoção dos overlays. Ele usa um perfil temporário, não oculta a barra do sistema e não instala ganchos de teclado.

As prévias confirmam a assinatura do canal IPC antes de receber os dados e confirmam a atualização do DOM sem esperar quadros de animação de uma janela oculta. Pedidos antigos são descartados ao fechar ou trocar a prévia; o monitor também faz parte da identificação do pedido.

No modo Área de trabalho, o fundo cobre os limites inteiros de cada monitor, inclusive atrás da dock transparente. A área útil dos widgets e a reserva AppBar continuam separadas do fundo. A recuperação periódica também restaura a auto-ocultação caso o Explorer perca esse estado.

Antes de publicar um instalador, validar em Windows 10/11:

- Ativar/desativar, reiniciar o Agenda e verificar a restauração da barra original.
- Pressionar e manter os atalhos da tabela; conferir que o Iniciar original não aparece junto e que soltar teclas não deixa modificadores presos.
- Testar Ctrl+Esc, Win+Shift+S, Alt+Tab, Win+L e jogos detectados.
- Repetir com dois monitores, escalas diferentes e desconexão de monitor.
- Reiniciar o Explorer; verificar ocultação e área reservada das janelas maximizadas.
- Abrir a bandeja original e aguardar dez segundos.
- Encerrar o renderizador da barra e usar Ctrl+Alt+Backspace para verificar recuperação.

A compilação e os testes de processos simulados não comprovam o comportamento interativo do Explorer ou do gancho de teclado.
