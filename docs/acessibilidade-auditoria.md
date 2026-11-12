# Auditoria de acessibilidade e movimento

Medido no app rodando (página real `index.html` no Chromium, fora do Electron). Cada número abaixo
saiu de uma sonda automática, antes e depois das correções. O que depende do Windows está no fim.

## Resultado

| Verificação | Antes | Depois |
| --- | --- | --- |
| Controles sem nome para leitor de tela, área de trabalho | 38 de 56 | 0 de 38 |
| Paradas de Tab duplicadas na barra (ícone focável dentro do botão) | 18 | 0 |
| Controles sem nome, 14 abas de Configurações | 39 de 1066 | 0 de 1066 |
| Controles sem nome, abas do app abertas pela barra | 36 botões só com ícone no código | 0 de 3029 visíveis |
| Diálogos: papel `dialog`, nome, Esc fecha, Tab preso, foco volta ao botão | nenhum dos cinco | os cinco (20 diálogos usam o mesmo componente) |
| Interruptores com papel e estado (`switch`, marcado ou não) | 0 | todos |
| Controles deslizantes com nome e valor falado | 0 | todos |
| Anel de foco ao navegar com Tab | padrão do navegador, ausente nos deslizantes | anel na cor de destaque em tudo que é clicável |
| "Animações" desligado: quadros de movimento ao abrir janela / diálogo | 4 / 2 | 1 / 1 (parado) |
| Sistema com "reduzir movimento": idem | 4 / 3 | 1 / 1 |
| Tema Terminal com modo escuro desligado, contraste do texto | 1,16 (ilegível) | 7,1 principal, 4,9 secundário |
| Configurações em 1920×1080, 1366×768, 1280×720, 1024×600 e texto a 130% | cabe, sem rolagem lateral nem vazamento | sem mudança (nada a corrigir) |

## O que foi corrigido

1. **Nomes**: 36 botões só com ícone ganharam `aria-label`; botões da barra (do Widgy e a que substitui a
   do Windows) passam a ter o nome do app; amostras de cor, caixas de aviso e o campo da pasta de backup também.
2. **Barra**: o ícone animado dentro de cada botão recebia foco próprio (efeito colateral do `whileTap`
   do framer-motion). Era preciso apertar Tab duas vezes por ícone. Agora é uma parada por botão.
3. **Diálogos** (`Modal`): `role="dialog"`, `aria-modal`, nome pelo título, Esc fecha só o diálogo de cima,
   Tab fica preso dentro e o foco volta para o botão que abriu.
4. **Controles**: `Switch` com `role="switch"` e `aria-checked`; `Slider` com nome e valor falado;
   `Segmented` com `aria-pressed`.
5. **Foco visível**: anel de 2 px na cor de destaque para botões, links, interruptores, deslizantes e
   caixas. Só aparece ao navegar com Tab; clicar com o mouse não muda nada. Campos de texto ficam de fora
   porque já têm o próprio realce.
6. **Movimento**: o ajuste "Animações" só desligava animações de CSS; as do framer-motion (abrir janela,
   diálogo, barra) continuavam. Agora ele vale para as duas. Com "Animações" ligado, o app passa a seguir
   a preferência "reduzir movimento" do sistema: deslocamentos viram troca direta, o esmaecer continua.
7. **Tema Terminal no modo claro**: as cores gerais do modo claro (texto azul-escuro) ganhavam das cores
   do tema, por cima do fundo preto. Texto ilegível. O Terminal passa a ser sempre escuro e, em
   Configurações, o interruptor "Modo escuro" fica desativado com a explicação.
8. **Tema Retrô no modo claro** (o padrão dele): mesma causa. As cores próprias do tema (texto preto,
   secundário cinza-escuro, campos brancos) nunca valiam no modo claro. Agora valem.
9. **Texto secundário**: a opacidade subiu de 0,60–0,62 para 0,74–0,76, e os títulos de grupo da lateral
   de Configurações deixaram de ser ainda mais apagados.

## Contraste medido (aba Sistema de Configurações, papel de parede padrão)

Método: cor do texto pelo estilo computado, contra a cor mais comum atrás dele lida da captura da tela.
"Secundário" é o texto com transparência. Referência usual: 4,5 para texto pequeno, 3 para texto grande.

| Tema | Principal (mediana) | Secundário antes | Secundário depois |
| --- | --- | --- | --- |
| Vidro, escuro | 8,2 | 3,3 | 4,0 |
| Vidro, claro | 4,2 | 2,7 | 3,9 |
| Metal, escuro | 11,8 | 5,2 | 6,8 |
| Metal, claro | 10,3 | 3,5 | 5,3 |
| Retrô, escuro | 4,8 | (cor sólida) | 4,8 |
| Retrô, claro | 4,3 | 2,7 | 4,3 |
| Terminal, escuro | 7,8 | 3,6 | 4,9 |
| Terminal, claro | 1,2 | 1,1 | 4,9 |
| Minimal, escuro | 16,0 | 6,4 | 8,6 |
| Minimal, claro | 5,7 | 3,2 | 4,7 |

## Limites conhecidos (não corrigidos)

- **Vidro no modo claro sobre papel de parede escuro** continua abaixo de 4,5 (principal 4,2, secundário
  3,9). O painel é translúcido: o fundo real depende da imagem atrás. Resolver de vez exigiria tirar a
  transparência, o que mudaria o visual do tema. Com papel de parede claro o contraste sobe.
- **Botões do tema Metal**: texto branco sobre cinza metálico mede 2,3 a 3,0 (14 px, com sombra). Legível,
  mas abaixo da referência.
- **Retrô**: mede 4,3 a 4,8 com as linhas de varredura ligadas (efeito do tema), um pouco menos sem elas.
- O campo de texto do widget de nota não mostra anel de foco (só o cursor de texto).
- A medição de contraste usa uma aba e o papel de parede padrão. Outras imagens dão outros números.

## Não verificado aqui

- Leitores de tela reais (Narrador, NVDA): só nomes, papéis e estados foram conferidos pelo código da página.
- Modo de alto contraste do Windows e escala de tela do Windows (125%, 150%) na janela real do Electron.
- A janela separada da barra que substitui a do Windows: recebeu os nomes nos botões, mas não a
  configuração de movimento (ela é outra página, `src/bar/main.tsx`).

## Como repetir

`npm run test:a11y` confere pelo código: nenhum botão só com ícone sem nome, papéis dos controles,
anel de foco, movimento reduzido e as cores dos temas Terminal e Retrô.
