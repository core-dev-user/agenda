# 🌸 Agenda

Sua área de trabalho personalizada: widgets, hábitos, estudos, serviços, listas e galeria com upscale até 8K.

## Usar

- **Abrir o app:** atalho **Agenda** na área de trabalho. Ele roda `node_modules/electron/dist/electron.exe` apontando para esta pasta, porque o Smart App Control do Windows bloqueia o `Agenda.exe` empacotado (sem assinatura digital).
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
