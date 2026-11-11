param(
 [Parameter(Mandatory)][string]$BaselineDir,
 [Parameter(Mandatory)][string]$CandidateDir,
 [Parameter(Mandatory)][string]$OutputDir,
 [ValidateSet("quality", "auto", "gaming")][string]$CandidateProfile = "quality"
)
$ErrorActionPreference = "Stop"
$BaselineDir = (Resolve-Path $BaselineDir).Path
$CandidateDir = (Resolve-Path $CandidateDir).Path
New-Item -ItemType Directory -Force $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$results = @()

function Median([double[]]$values) {
 if ($values.Count -eq 0) { return 0.0 }
 $sorted = @($values | Sort-Object)
 $i = [int][math]::Floor($sorted.Count / 2)
 if ($sorted.Count % 2 -eq 0) { return ($sorted[$i - 1] + $sorted[$i]) / 2 }
 return $sorted[$i]
}

function New-Fixture([string]$dir, [string]$layout, [string]$profile) {
 $userDir = Join-Path $dir "userdata"
 New-Item -ItemType Directory -Force $userDir | Out-Null
 [ordered]@{ mode = "screen"; display = 0; span = $false } |
   ConvertTo-Json | Set-Content -Path (Join-Path $userDir "mode.json") -Encoding utf8
 $settings = [ordered]@{
   shell = [ordered]@{ pack = $(if ($layout -eq "carbono") { "carbono" } else { "none" }); accent = "rose"; frame = $true; hoverTop = $true; side = "left" }
   sakura = [ordered]@{ ambient = $false; density = 0; splash = $false; splashSeconds = 0 }
   overlay = [ordered]@{ scanlines = $false; grain = $false; vignette = $false }
   animations = $false
   musicAutostart = $false
   weatherCity = "Sao Paulo"
   todayOnStart = $false
   perfPreset = $profile
 }
 $widgets = @(
   [ordered]@{ id = "bench-clock"; type = "clock"; x = 42; y = 42; w = 360; h = 180; config = [ordered]@{ style = "digital"; seconds = $true } },
   [ordered]@{ id = "bench-weather"; type = "weather"; x = 42; y = 245; w = 320; h = 205; config = @{} },
   [ordered]@{ id = "bench-pcmusic"; type = "pcmusic"; x = 390; y = 42; w = 440; h = 220; config = @{} }
 )
 [ordered]@{ state = [ordered]@{ settings = $settings; widgets = $widgets }; version = 1 } |
   ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $userDir "agenda-data.json") -Encoding utf8
}

function Get-Tree([int]$rootPid) {
 $infos = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue)
 $ids = [System.Collections.Generic.HashSet[int]]::new()
 [void]$ids.Add($rootPid)
 for ($i = 0; $i -lt 8; $i++) {
   $before = $ids.Count
   foreach ($info in $infos) {
     if ($ids.Contains([int]$info.ParentProcessId)) { [void]$ids.Add([int]$info.ProcessId) }
   }
   if ($before -eq $ids.Count) { break }
 }
 $list = @()
 foreach ($pidValue in $ids) {
   $p = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
   if ($null -ne $p) { $list += $p }
 }
 return $list
}

function Measure-Run([string]$label, [string]$appDir, [string]$layout, [int]$iteration) {
 $caseDir = Join-Path $OutputDir "$label-$layout-$iteration"
 New-Item -ItemType Directory -Force $caseDir | Out-Null
 New-Fixture -dir $caseDir -layout $layout -profile $(if ($label -eq "baseline") { "quality" } else { $CandidateProfile })
 $exe = Join-Path $appDir "node_modules\electron\dist\electron.exe"
 if (-not (Test-Path $exe)) { throw "Electron nao instalado: $exe" }
 $env:AGENDA_SHOT = $caseDir
 $env:AGENDA_MODE = "screen"
 $env:AGENDA_SHOT_STEPS = "void 0"
 $clock = [Diagnostics.Stopwatch]::StartNew()
 $samples = @()
 $cpuMax = @{}
 $appProcess = $null
 try {
   $appProcess = Start-Process -FilePath $exe -ArgumentList "." -WorkingDirectory $appDir -PassThru -RedirectStandardOutput (Join-Path $caseDir "stdout.log") -RedirectStandardError (Join-Path $caseDir "stderr.log")
   while ($clock.Elapsed.TotalSeconds -lt 17) {
     Start-Sleep -Milliseconds 600
     $processes = @(Get-Tree -rootPid $appProcess.Id)
     $private = 0.0
     $working = 0.0
     foreach ($p in $processes) {
       $private += [double]$p.PrivateMemorySize64 / 1MB
       $working += [double]$p.WorkingSet64 / 1MB
       try {
         $cpu = [double]$p.CPU
         if (-not $cpuMax.ContainsKey($p.Id) -or $cpuMax[$p.Id] -lt $cpu) { $cpuMax[$p.Id] = $cpu }
       } catch {}
     }
     $samples += [ordered]@{ seconds = [math]::Round($clock.Elapsed.TotalSeconds, 2); processes = $processes.Count; privateMB = [math]::Round($private, 2); workingMB = [math]::Round($working, 2) }
     if ($appProcess.HasExited) { break }
   }
 } finally {
   if ($null -ne $appProcess) {
     foreach ($p in @(Get-Tree -rootPid $appProcess.Id)) {
       try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
     }
   }
   Remove-Item Env:AGENDA_SHOT,Env:AGENDA_MODE,Env:AGENDA_SHOT_STEPS -ErrorAction SilentlyContinue
 }
 $clock.Stop()
 $imagePath = Join-Path $caseDir "1-desktop.png"
 $rendered = (Test-Path $imagePath) -and ((Get-Item $imagePath).Length -gt 1024)
 $steady = @($samples | Where-Object { $_.seconds -ge 2 -and $_.seconds -le 7 -and $_.processes -gt 0 })
 if ($steady.Count -eq 0) { $steady = @($samples | Where-Object { $_.processes -gt 0 }) }
 $cpuSeconds = 0.0
 foreach ($key in $cpuMax.Keys) { $cpuSeconds += [double]$cpuMax[$key] }
 $result = [ordered]@{
   label = $label; layout = $layout; iteration = $iteration; rendered = $rendered
   elapsedSec = [math]::Round($clock.Elapsed.TotalSeconds, 2)
   stableSamples = $steady.Count
   medianPrivateMB = [math]::Round((Median @($steady | ForEach-Object { [double]$_.privateMB })), 2)
   peakPrivateMB = [math]::Round((@($samples | ForEach-Object { [double]$_.privateMB }) | Measure-Object -Maximum).Maximum, 2)
   medianWorkingSetMB = [math]::Round((Median @($steady | ForEach-Object { [double]$_.workingMB })), 2)
   cpuCorePercent = [math]::Round(($cpuSeconds / [math]::Max(1, $clock.Elapsed.TotalSeconds)) * 100, 2)
   samples = @($samples)
 }
 Write-Host ("RESULT " + ($result | ConvertTo-Json -Depth 7 -Compress))
 return $result
}

foreach ($layout in @("classic", "carbono")) {
 foreach ($round in @(1, 2)) {
   $order = if ($round -eq 1) { @("baseline", "optimized") } else { @("optimized", "baseline") }
   foreach ($label in $order) {
     $dir = if ($label -eq "baseline") { $BaselineDir } else { $CandidateDir }
     $results += Measure-Run -label $label -appDir $dir -layout $layout -iteration $round
   }
 }
}

$comparison = @()
foreach ($layout in @("classic", "carbono")) {
 $b = @($results | Where-Object { $_.layout -eq $layout -and $_.label -eq "baseline" -and $_.rendered })
 $o = @($results | Where-Object { $_.layout -eq $layout -and $_.label -eq "optimized" -and $_.rendered })
 if ($b.Count -ne 2 -or $o.Count -ne 2) { continue }
 $bm = [double](($b | ForEach-Object { [double]$_.medianPrivateMB } | Measure-Object -Average).Average)
 $om = [double](($o | ForEach-Object { [double]$_.medianPrivateMB } | Measure-Object -Average).Average)
 $bc = [double](($b | ForEach-Object { [double]$_.cpuCorePercent } | Measure-Object -Average).Average)
 $oc = [double](($o | ForEach-Object { [double]$_.cpuCorePercent } | Measure-Object -Average).Average)
 if ($bm -le 0 -or $om -le 0) { throw "Resumo invalido: memoria privada nao pode ser zero em uma renderizacao real" }
 $comparison += [ordered]@{
   layout = $layout; baselineRAMMB = [math]::Round($bm, 2); optimizedRAMMB = [math]::Round($om, 2)
   ramChangePct = $(if ($bm -gt 0) { [math]::Round(($om / $bm - 1) * 100, 2) } else { $null })
   baselineCPUCorePct = [math]::Round($bc, 2); optimizedCPUCorePct = [math]::Round($oc, 2)
   cpuChangePct = $(if ($bc -gt 0) { [math]::Round(($oc / $bc - 1) * 100, 2) } else { $null })
 }
}
$report = [ordered]@{
 baseline = "v0.3.12"
 candidate = $env:GITHUB_SHA
 candidateProfile = $CandidateProfile
 benchmarkKind = $(if ($CandidateProfile -eq "quality") { "pure" } else { "profile" })
 dateUTC = (Get-Date).ToUniversalTime().ToString("o")
 method = "Windows GitHub-hosted runner; screenshot-mode Electron; GPU acceleration disabled; baseline uses v0.3.12; pure means candidate quality with no FPS caps; two runs per layout and version"
 caveats = "Spotify session and Wallpaper Engine are not installed; this is a short-duration startup benchmark, not steady-state or real-user GPU profiling"
 gpuMeasured = $false
 comparison = $comparison
 results = $results
}
$reportPath = Join-Path $OutputDir "performance-comparison.json"
$report | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 -Path $reportPath
Write-Host ("COMPARISON " + ($comparison | ConvertTo-Json -Depth 5 -Compress))
Write-Host "Report: $reportPath"
if ($comparison.Count -ne 2) { throw "Benchmark incompleto: imagens ou medidas ausentes. Inspecione stdout/stderr e relatorio." }
