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

## Testes de desempenho e persistência

Execute `npm test` com Node 22.18+ ou Node 24. Os cenários e os limites desta primeira rodada estão em [docs/performance.md](docs/performance.md).
