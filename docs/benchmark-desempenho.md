# Widgy — benchmark de CPU e RAM

Comparação entre a release **v0.3.12** e o código otimizado. Foram realizadas
duas inicializações por versão/visual (clássico e Carbono) em runner Windows.
As capturas precisam renderizar; a coleta é feita em modo de screenshot com
aceleração de GPU desativada. O benchmark **puro** usa o perfil `quality`
no candidato; `auto` e `gaming` são experiências **separadas**, nunca
misturadas na mesma média.

## Resultados Windows (RAM privada média de cada cenário)

| Perfil do candidato | Visual | v0.3.12 (MB) | Otimizado (MB) | Δ RAM | CPU original (% de núcleo) | CPU novo (% de núcleo) | Δ CPU |
|---|---|---:|---:|---:|---:|---:|---:|
| Qualidade (puro) | Clássico | 210,03 | 201,39 | -4,11% | 50,43 | 39,33 | -22,02% |
| Qualidade (puro) | Carbono | 196,02 | 184,01 | -6,12% | 36,23 | 35,06 | -3,24% |
| Automático | Clássico | 213,18 | 193,75 | -9,11% | 37,16 | 35,38 | -4,76% |
| Automático | Carbono | 194,16 | 180,08 | -7,25% | 31,60 | 32,47 | +2,74% |
| Jogos | Clássico | 210,38 | 193,84 | -7,86% | 48,53 | 35,52 | -26,79% |
| Jogos | Carbono | 193,12 | 179,01 | -7,31% | 35,16 | 34,18 | -2,79% |

Execução com logs e amostras: https://github.com/core-dev-user/agenda/actions/runs/43066613118

**Interpretação:** as reduções de memória aparecem nos seis cenários
comparados, mas não demonstram economia permanente de RAM; o Carbono no
Automático teve CPU 2,74% maior nesta amostra. Não há equivalência entre
`cpuCorePercent` (por um núcleo lógico) e ocupação total do processador.
Com duas repetições, diferenças pequenas podem ser ruído.

## Perfis configuráveis no aplicativo

Em **Configurações → Sistema → Desempenho e consumo**, escolher:
- **Automático:** visual 30 FPS; reduz para 12 FPS ao detectar jogo, e diminui amostragens do monitor
- **Qualidade:** 60 FPS, pré-carrega todas as abas (preserva fluidez)
- **Equilibrado:** 30 FPS
- **Economia:** 15 FPS; não pré-carrega abas
- **Jogos:** 12 FPS; consultas leves, sem pré-carregar abas
- **Personalizado:** FPS, frequência dos painéis web, monitor de CPU/GPU e pré-carregamento ajustáveis

Esse FPS é de **efeitos visuais do Widgy**, nunca do jogo.

## Como medir com Discord + Valorant realmente abertos

O runner CI não contém Discord, conta Spotify, Wallpaper Engine ou Valorant.
Portanto, **os dados de CI acima não são o consumo combinado com esses apps**.

No computador Windows com o jogo aberto e o Discord no cenário que interessa,
execute pelo PowerShell (na pasta do repositório):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\perf-live.ps1 -Seconds 60 -IntervalMs 1000 -OutputPath .\widgy-discord-valorant.json
```

O relatório local grava amostras de memória privada, conjunto de trabalho
e CPU, identificando processos Widgy, Discord e Valorant/Riot.
**Não injeta código nem interage com Vanguard**, e não coleta FPS/GPU.
Somar `privateMB` é uma estimativa aditiva de memória reservada, não a
memória física total do PC; `workingSetMB` pode contar páginas compartilhadas
em mais de um processo. A métrica `combined.appPrivateMB` soma médias
individuais dos grupos, e **não** é o pico simultâneo.

Para medir GPU/FPS e eventuais quedas de frames, usar ferramentas de
monitoramento do Windows/driver, sem injeção no anti-cheat.
