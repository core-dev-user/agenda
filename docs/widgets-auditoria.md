# Auditoria dos widgets

Página de teste: `npx vite` e abrir `http://localhost:5173/tools/widgets.html`. Ela desenha os 26 widgets com o
Widgy real, fora do Electron (os serviços do Windows respondem "indisponível", como num PC sem eles).

- `?only=clock,weather` mostra só alguns.
- `?net=fail` faz toda busca na internet falhar (testa as mensagens de erro).

## Resultado (12/11/2026)

Todos os 26 desenham sem erro nos três estados testados: sem dados, internet falhando e dados simulados.

| Widget | Estado | Observação |
| --- | --- | --- |
| Relógio | corrigido | Data com maiúsculas erradas ("Quinta-Feira, 12 De Novembro"); o mesmo em 16 lugares do app |
| Notícias | corrigido | Ficava em branco quando o endereço respondia sem notícias |
| Agente do Valorant | corrigido | "Carregando agentes…" para sempre sem internet; redesenhava todo segundo sem partida |
| Jogando agora | corrigido | Redesenhava todo segundo sem jogo aberto |
| Monitor do sistema | melhorado | Barras animadas por transform (antes: largura, com layout a cada quadro); o anel segue com transição de traço |
| WhatsApp, YouTube Music (fila), iFood (mapa) | melhorado | Não consultam a página do serviço com o Widgy escondido ou em pausa por jogo |
| Clima | ok | Mostra o erro e "Tentar novamente" |
| Cronômetro, Contagem regressiva, Calendário, Nota, Tarefas, Hábitos/atalhos, Fotos, Finanças, Agenda, Estatísticas de música, Letras, Clipe, Discord, CS2, Valorant, Futebol | ok no teste | Sem erro; estados vazios com orientação |
| Spotify e música do PC | fora do alcance aqui | Depende da central de mídia do Windows; validar no PC |

## Custo parado (um widget por vez, % de um núcleo, navegador sem placa de vídeo)

Base sem widgets: 0,5%. Monitor do sistema +2,5% (transições a cada leitura); relógio +0,5%; todos os outros entre 0 e +0,3%.

## Só dá para validar no Windows

Spotify/música do PC (sessões, capa), Discord, WhatsApp e iFood conectados, monitor do sistema com dados reais, e
a troca automática do agente do Valorant.
