param(
  [ValidateRange(5, 600)][int]$Seconds = 60,
  [ValidateRange(250, 5000)][int]$IntervalMs = 1000,
  [string]$OutputPath = ".\widgy-performance-live.json"
)
# Diagnóstico somente leitura: não injeta código no Valorant, Vanguard ou Discord.
# Contabiliza memória privada e CPU de toda a família de processos pelo nome.
$ErrorActionPreference = "Stop"
$threads = [Environment]::ProcessorCount
$previousCpu = @{}
$samples = @()
$stopwatch = [Diagnostics.Stopwatch]::StartNew()

function Group-Process([string]$name) {
  if ($name -match '^(Widgy|Agenda|electron)$') { return "Widgy" }
  if ($name -match '^(Discord|DiscordCanary|DiscordPTB)$') { return "Discord" }
  if ($name -match '^(VALORANT|VALORANT-Win64-Shipping|RiotClientServices|RiotClientUx|RiotClientUxRender)$') { return "Valorant + Riot" }
  return $null
}

while ($stopwatch.Elapsed.TotalSeconds -lt $Seconds) {
  $byGroup = @{
    "Widgy" = @{ privateBytes = 0.0; workingBytes = 0.0; cpuSeconds = 0.0; processes = 0 }
    "Discord" = @{ privateBytes = 0.0; workingBytes = 0.0; cpuSeconds = 0.0; processes = 0 }
    "Valorant + Riot" = @{ privateBytes = 0.0; workingBytes = 0.0; cpuSeconds = 0.0; processes = 0 }
  }
  foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
    $group = Group-Process $p.ProcessName
    if (-not $group) { continue }
    $g = $byGroup[$group]
    $g.privateBytes += [double]$p.PrivateMemorySize64
    $g.workingBytes += [double]$p.WorkingSet64
    $g.processes++
    try {
      $cpu = [double]$p.CPU
      $key = [string]$p.Id + "|" + [string]$p.StartTime.Ticks
      if ($previousCpu.ContainsKey($key)) {
        $g.cpuSeconds += [math]::Max(0, $cpu - $previousCpu[$key])
      }
      $previousCpu[$key] = $cpu
    } catch {}
  }
  $values = @{}
  foreach ($name in @("Widgy", "Discord", "Valorant + Riot")) {
    $g = $byGroup[$name]
    $values[$name] = @{
      processes = $g.processes
      privateMB = [math]::Round($g.privateBytes / 1MB, 2)
      workingSetMB = [math]::Round($g.workingBytes / 1MB, 2)
      cpuPercentTotal = [math]::Round(100 * $g.cpuSeconds / ($IntervalMs / 1000) / $threads, 2)
    }
  }
  $samples += @{ elapsedSec = [math]::Round($stopwatch.Elapsed.TotalSeconds, 2); groups = $values }
  Start-Sleep -Milliseconds $IntervalMs
}
$stopwatch.Stop()
$summary = @()
foreach ($name in @("Widgy", "Discord", "Valorant + Riot")) {
  $rows = @($samples | ForEach-Object { $_.groups[$name] } | Where-Object { $_.processes -gt 0 })
  if ($rows.Count -eq 0) {
    $summary += [pscustomobject]@{ application = $name; detected = $false; avgPrivateMB = 0; peakPrivateMB = 0; avgCPUPercent = 0 }
    continue
  }
  $ram = @($rows | ForEach-Object { [double]$_.privateMB })
  $cpu = @($rows | ForEach-Object { [double]$_.cpuPercentTotal })
  $summary += [pscustomobject]@{
    application = $name; detected = $true
    avgPrivateMB = [math]::Round(($ram | Measure-Object -Average).Average, 2)
    peakPrivateMB = [math]::Round(($ram | Measure-Object -Maximum).Maximum, 2)
    avgCPUPercent = [math]::Round(($cpu | Measure-Object -Average).Average, 2)
  }
}
$report = @{
  seconds = $Seconds
  intervalMs = $IntervalMs
  cpuLogicalProcessors = $threads
  method = "Read-only Get-Process counters; private bytes are additive; working sets include shared physical pages; CPU normalized across logical processors."
  notes = "No FPS, GPU or Vanguard instrumentation. Does not measure Widgy's embedded Discord as a separate program."
  summary = $summary
  samples = $samples
}
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8
$summary | Format-Table -AutoSize
Write-Host "Relatório salvo em $OutputPath"
