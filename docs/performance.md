# Primeira rodada de otimização

Base analisada: `cb1f180` (main em 09/11/2026).

## Mudanças

- Compara os campos persistidos antes de serializar. Atualizações temporárias (janelas, dados de calendário carregados, etc.) não reenviam o mesmo documento.
- Agrupa alterações por até 250 ms. Edições contínuas continuam sendo gravadas periodicamente; não é um debounce que espera o usuário parar.
- O salvamento periódico drena apenas alterações pendentes. Fechamento, troca de modo/barra, conclusão do onboarding e backup manual drenam a fila antes de prosseguir. O formato JSON e os backups existentes foram preservados.
- A barra só agenda sincronização se aparência, fixados ou quantidade de avisos não lidos mudarem, com no máximo um envio pendente.
- O cronômetro troca a frequência do próprio timer: 33 ms quando visível, 1 s em segundo plano. A contagem regressiva, que mostra segundos, usa 1 s e antecipa a próxima execução quando seu prazo chega antes disso. O tempo continua sendo calculado por timestamp.
- A barra interna continua disponível se a substituição da barra do Windows estiver habilitada, mas indisponível no monitor selecionado. A decisão usa `available`, porque a barra externa é criada com atraso na inicialização e `active` pode ainda ser falso.

## Verificação

`npm test` (Node 22.18+ ou Node 24) executa oito testes com relógio controlado e integração com o middleware real do Zustand.

| Cenário controlado | Antes | Depois |
| --- | ---: | ---: |
| 1.000 atualizações temporárias após um salvamento inicial | 1.000 serializações/envios | 0 serializações/envios adicionais |
| 100 edições espaçadas em 10 ms | um envio por edição | 4 envios, mantendo a última edição |
| Cronômetro em segundo plano por 10 s | aproximadamente 303 callbacks de intervalo | 10 callbacks |

Esses números contam operações nos cenários de teste; não são percentuais de CPU/RAM ou medições do Windows.

Também verificado:

- Build TypeScript + Vite de produção.
- Chromium/Playwright: editar nota, recarregar antes de 250 ms e recuperar a última edição; iniciar, disparar e zerar timer; nenhuma exceção de página.
- Electron 45 em Linux headless, usando o modo de captura já existente: alterar uma nota e encerrar imediatamente pelo IPC do app; verificar o JSON em disco e o backup; reabrir e conferir a hidratação.
- Retry de envio que falha, limpeza da fila ao apagar armazenamento, versão e formato dos dados existentes.

## Ainda precisa de validação no Windows

- Comparar CPU, RAM e tempo de abertura com o mesmo perfil: repouso, música/chamada, jogo em primeiro plano e uso prolongado.
- Testar dois monitores, mudança de monitor principal, desconexão de monitor e restauração da barra original ao sair.
- Conferir aviso sonoro do timer com o app na bandeja e recuperação após suspensão do computador.
- Conferir onboarding, troca de modo e cópia manual para uma pasta sincronizada com a nuvem.

Pré-carregamento das abas, custo das integrações e tamanho dos bundles ficam para a próxima rodada, guiada por medições. O build ainda avisa sobre chunks grandes e um import dinâmico já existente que também é estático.
