# Salas: "erro de rede" ao entrar

## Como a sala conecta
1. **Servidor de encontro** (`0.peerjs.com`, gratuito do PeerJS): só faz os amigos se acharem, por WebSocket seguro (porta 443).
   É aqui que aparece o erro "Não deu para falar com o servidor de encontro".
2. **Tela e voz**: vão direto de PC para PC (WebRTC/UDP). Se a rede bloquear, usam retransmissão (TURN).

Se só uma pessoa falha e as outras entram, o problema está no PC ou na rede dessa pessoa:
antivírus com proteção web ou verificação de HTTPS, firewall, filtro de DNS (AdGuard, Pi-hole, NextDNS, controle dos pais),
VPN/proxy, rede de escola/empresa ou relógio do Windows errado.

## O que mudou
- **Testar conexão** (Salas): em ~10 s mostra o que está bloqueando e o que fazer, com "Copiar resultado".
  - Processo principal (`electron/net-probe.cjs`, só endereços fixos, só leitura): DNS de `0.peerjs.com` (detecta filtro que devolve 0.0.0.0),
    HTTPS até `0.peerjs.com` e até `www.gstatic.com` (controle), código de erro do Chromium (DNS, certificado, proxy, conexão recusada/resetada)
    e diferença do relógio (cabeçalho `Date` por HTTP simples).
  - Página (`src/lib/roomsDiag.ts`): o mesmo WebSocket que o PeerJS abre, coleta de rotas STUN (conexão direta) e TURN (retransmissão pública e a sua, se configurada).
  - Veredito em `src/lib/roomsDiag-core.ts` (testado em `tests/rooms-diag.test.mjs`).
- **Entrada mais resistente** (`src/lib/rooms.ts`):
  - até 3 tentativas com espera (1,2 s e 2,4 s) quando a rede pisca ou o servidor demora; limite de 15 s por tentativa;
  - membro usa id próprio aleatório: não depende mais do pedido HTTPS de id do PeerJS, só do WebSocket;
  - a conexão que falhou é destruída (antes ficava aberta);
  - mensagem de erro diz o servidor e aponta o teste.

## Testado
- `npm run test:rooms` (25), `test:security`, `test:a11y`, `test:flows`, `test:templates`, `test:perf`, `test:taskbar`, `test:widgets`, `npm run build`.
- Rede real (deste servidor de testes): sonda do processo principal contra `0.peerjs.com` e `gstatic` (ok, ~400 ms);
  sala criada no servidor real e um segundo navegador entrou como membro com o id próprio.
- `0.peerjs.com` bloqueado no navegador (simulando filtro): erro em ~4 s após 3 tentativas e o teste aponta o bloqueio.

## Limites
- Não dá para "furar" um bloqueio feito no PC do amigo: ele precisa liberar o Widgy/`0.peerjs.com` ou trocar de rede/DNS.
- Não testado em Windows real com antivírus de verdade; os códigos de erro vêm do Chromium do Electron.
- A retransmissão pública do PeerJS é gratuita e sem garantia; para redes muito fechadas, configure um TURN próprio (de preferência `turns:…:443`).
