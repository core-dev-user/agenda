# Widgy

Sua área de trabalho personalizada: widgets, hábitos, estudos, serviços, listas e galeria com upscale até 8K.

## Usar

- **Abrir o app:** atalho **Widgy** na área de trabalho. Ele roda `node_modules/electron/dist/electron.exe` apontando para esta pasta, porque o Smart App Control do Windows bloqueia o `Widgy.exe` empacotado (sem assinatura digital).
- **Depois de mudar o código:** `npm run build` (o atalho já usa a versão nova)
- **Desenvolver (com recarregamento automático):** `npm run dev`
- **Gerar um .exe separado:** `npm run dist` (pode ser bloqueado pelo Windows sem assinatura)

## Onde ficam seus dados

`%APPDATA%\agenda\` → `agenda-data.json` (tudo que você anota) e `media\` (suas imagens).
Faça backup em **Configurações → Sistema → Exportar backup**.

## Estrutura

```
electron/          processo principal (janela, arquivos, upscale 8K, RSS)
src/components/ui  componentes shadcn (liquid-glass-button.tsx = botões vidro/metal)
src/components     abertura sakura, logo, cursor, barra de tarefas, janelas
src/widgets        relógio, cronômetro, clima, notícias, fotos, calendário, nota
src/sections       Hábitos, Estudos, Serviços, Listas, Imagens, Configurações
src/lib            estado (zustand), temas, fontes, tipos
```

## Upscale 8K

- Padrão: Lanczos3 + nitidez suave (mantém a foto idêntica, só mais definida).
- Com IA: em **Imagens → Instalar motor de IA** baixa o Real-ESRGAN (usa a placa de vídeo), que reconstrói detalhes de verdade.


## Biblioteca de fontes

Em **Configurações → Fontes**, escolha a tipografia da interface, dos números e dos títulos por uma **roda de seleção** com pesquisa e filtros por categoria. A mesma biblioteca funciona no relógio do papel de parede, nos relógios dos widgets, nas letras e na aparência individual de cada widget.

- As 14 fontes originais permanecem empacotadas e funcionam sem internet. As outras são baixadas sob demanda de **Google Fonts** (domínios permitidos na política de segurança do aplicativo); sem conexão, o texto usa a fonte de fallback até que a escolhida carregue.
- Abrir o seletor **não baixa a biblioteca inteira**: só as fontes próximas da região visível da roda e a fonte selecionada são carregadas. O cache é gerenciado pelo Chromium/Electron.
- As preferências continuam salvas por ID nas configurações e nos templates já existentes. A aparência também é sincronizada com a barra e os monitores adicionais.


## Pacote de ícones e fundos integrado

Em **Configurações → Barra e ícones → Ícones dos apps**, escolha entre os ícones originais e cinco coleções: **Vidro líquido, Neon noturno, Metal escovado, Minimal e Retrô 95**. O pacote inclui **169 aplicativos × 5 estilos = 845 ícones SVG**; a galeria permite buscar por nome e categoria. Os ícones de programas conhecidos podem substituir visualmente os ícones nativos na barra de tarefas e no menu Iniciar do Widgy. Programas não reconhecidos mantêm o ícone original do Windows; nada é alterado no sistema operacional.

Os **17 fundos padrão** continuam em **Papel de parede → Degradê**. Eles já eram incluídos como CSS (sem dependência de internet, adaptáveis a qualquer resolução) e não precisam ser duplicados como PNGs no instalador.

**Empacotamento:** o script `scripts/generate-icon-pack.mjs` gera as imagens SVG durante `npm run build` a partir do pacote `@fortawesome/fontawesome-free@6.7.2`. A pasta gerada `public/icon-packs/` é copiada para `dist/` pelo Vite e incorporada ao instalador pelo electron-builder. A licença do Font Awesome é copiada para `icon-packs/FONT-AWESOME-LICENSE.txt`. Em desenvolvimento, `npm run dev` gera as imagens automaticamente via `predev`.


## Identidade Widgy

A marca oficial é o **calendário azul com sakura de cinco pétalas**. O SVG canônico é `public/logos/widgy.svg` e o alias `public/logos/agenda.svg` foi mantido para compatibilidade. `npm run icon` gera o ícone do app em PNG, ICO e favicon a partir do SVG. A abertura inicial utiliza o mesmo símbolo, azul-marinho, tipografia Widgy e uma animação discreta, com suporte a movimento reduzido.

**Dados e atualização:** o nome público, atalho e instalador mudam para Widgy, mas o `appId` (`com.agenda.desktop`), o protocolo interno `agenda://`, a chave `agenda` e a pasta de dados legada (`%APPDATA%\\Agenda`) são mantidos deliberadamente. O instalador novo continua vindo do repositório `core-dev-user/agenda` e pode atualizar uma instalação existente sem apagar notas, widgets e personalizações. Não renomeie esses identificadores sem migrar os dados.

**Estilo inicial:** azul `#238DFF`, papel de parede Oceano noturno e pétalas azuladas. As preferências já salvas continuam respeitadas; para voltar ao visual de marca novo, restaure as configurações visuais em Configurações → Sistema.
