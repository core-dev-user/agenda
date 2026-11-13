# Tecla Windows abrindo o Iniciar do Widgy

## Por que ela abria o Iniciar original

Três problemas, cada um sozinho já fazia a tecla cair no Iniciar do Windows:

1. **Opção desligada por padrão.** Uma atualização anterior (migração "v2" em `electron/bar.cjs`) voltou a
   tecla Windows para o Iniciar do Windows em todas as instalações. Agora a migração "v3" liga de novo o
   Iniciar do Widgy uma vez; continua dando para trocar em Configurações.
2. **Atalho desligado justamente na área de trabalho.** O atalho fica desligado quando há um jogo protegido
   ou um programa em tela cheia não identificado na frente. A área de trabalho do Widgy ocupa a tela toda e
   não aparece na lista de janelas da barra, então era tratada como "tela cheia não identificada": com o
   Widgy na frente (o caso mais comum, ao clicar na área de trabalho), o atalho era desligado. Agora o
   ajudante informa o programa da janela da frente (`fx`), e o Widgy reconhece as próprias janelas.
3. **Teclas injetadas eram ignoradas.** O gancho ignorava qualquer tecla marcada como "injetada". Software de
   teclado gamer (Razer Synapse, Logitech G Hub, Corsair iCUE), macros e acesso remoto mandam as teclas
   assim, e com eles a tecla Windows passava direto para o Iniciar original. Agora só são ignoradas as teclas
   que o próprio Widgy manda (marcadas com uma assinatura); o botão "Iniciar do Windows" da barra do Widgy
   usa essa marca e continua abrindo o Iniciar do Windows.

## Ajudante próprio

O gancho de teclado rodava dentro do PowerShell, compilado a cada início (alguns segundos sem atalho) e
sujeito à checagem de scripts do antivírus e a políticas de empresa, que costumam barrar um script com
gancho de teclado. Agora o mesmo código C# (aberto, em `electron/keys.cjs`) é compilado **uma vez** com o
compilador que já vem no Windows 10 e 11 (`csc.exe` do .NET Framework 4) e guardado em
`%APPDATA%\Widgy\native\widgy-keys-<versão>.exe`, junto do `.cs` de onde saiu. Na primeira vez o Widgy usa
o PowerShell enquanto compila e troca sozinho quando o programa fica pronto. Se o compilador não existir
ou o programa não abrir duas vezes seguidas, continua com o PowerShell.

A técnica para o Windows não abrir o Iniciar dele é a mesma do AutoHotkey e do PowerToys: o gancho segura o
soltar da tecla Windows, manda uma tecla sem uso (0xE8) e só então solta a tecla Windows. O Windows entende
que foi um atalho e não abre o Iniciar.

## Como ver o que está acontecendo

Configurações › Modo de uso (com a barra do Widgy no lugar da do Windows), logo abaixo de "Tecla Windows
abre o Iniciar do Widgy", aparece o estado do atalho, atualizado sozinho:

- **Pronto**: está pegando a tecla. Aparece também o que aconteceu na última vez que ela foi apertada.
- **Desligado agora: …**: diz o motivo (barra do Widgy desligada, jogo com anti-cheat na frente, etc.).
- **Erro**: o Windows ou o antivírus recusou. Aparece o caminho do registro.

O botão **Reiniciar** desliga e liga o atalho de novo. O registro fica em `%APPDATA%\Widgy\widgy-keys.log`.

## O que precisa ser verdade para funcionar

- Modo "Área de trabalho", com "Substituir a barra do Windows pela do Widgy" ligado.
- "Win+S abre a pesquisa do Widgy" ligado (é ele que liga o gancho de teclado).
- Nenhum jogo com anti-cheat na frente (de propósito: o Widgy não instala gancho de teclado sobre esses jogos).
- Programas abertos como administrador na frente: o Windows não entrega a tecla a programas comuns quando
  a janela da frente é de administrador. Nesse caso a tecla abre o Iniciar do Windows. Isso vale para
  qualquer programa que faça o mesmo (AutoHotkey, PowerToys), a não ser rodando o Widgy como administrador.

## Testado aqui e não testado

- A decisão de cada tecla (Windows sozinha, Win+S, Win+D, Ctrl+Esc, Win+E, Win+Shift+S, Win+V, opção
  desligada) é testada fora do Windows com o mesmo código C# (`tests/keys-native.test.cjs`, com Mono).
- O ajudante e o código do helper da barra compilam.
- **Não testado:** o comportamento no Windows de verdade (instalar o gancho, compilar com o `csc.exe`, o
  Iniciar do Windows não abrir). Isso só dá para ver na máquina.
