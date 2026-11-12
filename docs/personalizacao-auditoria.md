# Auditoria da personalização

Objetivo: confirmar que cada ajuste de Configurações muda de fato alguma coisa, e corrigir ou
sinalizar os que não mudam. Tudo abaixo foi medido no app rodando (interface real no Chromium,
fora do Electron), comparando a tela antes e depois de cada ajuste. O que depende do Windows
está listado no fim como não verificado.

## Como foi medido

1. **Leitura do código**: as 77 chaves de `Settings` foram procuradas no código, uma a uma.
2. **Sonda funcional**: para 45 ajustes, o valor foi trocado e a tela comparada (variáveis de estilo, classes,
   estrutura e estilos de tudo que está desenhado, mais a contagem de canvases).
3. **Sonda condicional**: os que não mudaram nada na primeira passada foram repetidos na condição em que
   deveriam valer (ex.: cor do cursor só com um cursor do Widgy escolhido).
4. **Persistência**: 26 valores de tipos variados (tema, cores, fontes, barra, papel de parede, efeitos,
   sakura, ícones, pacote Carbono) foram gravados, a página recarregada e os valores lidos de volta.

## Resultado

| Verificação | Resultado |
| --- | --- |
| Chaves de `Settings` sem nenhuma leitura no código | 1 de 77: `depth` (ver abaixo) |
| Ajustes que mudam a tela na hora | 30 de 45 |
| Ajustes que só valem numa condição, e valem nela | 10 de 45 (cor, tamanho, efeito e densidade do cursor; efeito de clique; cor do papel de parede; paralaxe; inclinação 3D; lupa da barra; densidade da sakura) |
| Ajustes que dependiam do estilo de ícone sem a tela avisar | 2 de 45 (formato e cor por app), corrigido abaixo |
| Valor guardado que nada lê | 1 de 45 (`depth`) |
| Ajustes que valem só na barra que substitui a do Windows (outra janela) | 2 de 45 (`taskbar.pcOpen`, `taskbar.smartHide`), não verificáveis fora do Windows |
| Valores que sobreviveram ao recarregar | 26 de 26, e a tela ficou idêntica à de antes |

### Controles que não faziam nada (corrigido)

"Formato" e a cor de cada app apareciam sempre, mas dependem do estilo de ícone:

| Estilo de ícone | Formato | Cor por app |
| --- | --- | --- |
| Colorido, Vidro líquido, Metal, Neon, Chapado | funciona | funciona |
| Contorno | funciona | sem efeito |
| Retrô pixel | sem efeito | funciona |
| Logos (o padrão) | sem efeito | sem efeito |
| Qualquer pacote de ícones | sem efeito | sem efeito |

Ou seja: na instalação padrão, os dois controles não mudavam nada. Agora a regra fica em
`src/lib/iconSupport.ts` (com teste em `tests/icon-support.test.mjs`) e a tela:

- desativa "Formato" quando ele não se aplica (sem clique, sem foco pelo teclado, marcado para leitores de tela);
- esconde o seletor de cor de cada app quando ele não se aplica;
- mostra uma frase curta dizendo por quê.

Os valores guardados não são apagados: ao voltar para um estilo que os usa, eles reaparecem.

### `depth`: valor guardado que nada usa (mantido, documentado)

`Settings.depth` (número, padrão 1) é gravado e viaja nos templates, mas nenhum código o lê e não existe
controle para ele em Configurações. Não é uma opção fictícia, porque o usuário nunca a vê. Foi mantido
como está para não mudar o formato dos dados e dos templates já compartilhados. Não confundir com a
"Profundidade" do relógio da tela (`lockClock.depth`), que funciona.

### Nome antigo em textos visíveis (corrigido)

11 textos ainda chamavam o app de "Agenda" (ex.: "Logos do Agenda", "Abrir o Agenda ao ligar o
computador", o título das janelas do YouTube Music e do iFood). Passaram a dizer "Widgy". Nomes de
pasta reais (`%APPDATA%\Agenda`, "Agenda backup") e a Agenda do Google não foram tocados.

## Gravação em disco (lida no código, não executada aqui)

`electron/main.cjs` grava num arquivo temporário, força a escrita física e só então troca o arquivo;
recusa gravar dados inválidos por cima dos bons; guarda até 30 cópias (uma a cada 10 minutos) e, ao
abrir, recupera da cópia boa mais recente se o arquivo principal estiver corrompido; grava o que
estiver pendente ao fechar, desligar ou sair da sessão. Não foi encontrado defeito nessa parte.

## Não verificado aqui

- Qualquer ajuste que dependa do Windows: barra que substitui a do Windows, tecla Windows, iniciar com
  o sistema, bandeja, monitores, Wallpaper Engine.
- A gravação em disco no Windows com antivírus ou indexador segurando o arquivo (o código tenta de novo
  até 5 vezes, mas isso só se confirma na máquina).
- `scripts/perf-live.ps1` continua sem contar os processos auxiliares do Widgy (os PowerShell que ele
  abre). A alteração não foi feita porque não há PowerShell neste ambiente para testá-la.
