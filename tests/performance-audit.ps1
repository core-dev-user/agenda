param(
  [string]$OutputDir = "perf-results",
  [int]$HoldSeconds = 28
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = (Resolve-Path ".").Path
$target = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $target | Out-Null
$electron = Join-Path $root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electron)) { throw "Electron executable missing: $electron" }
$logicalCpu = [Environment]::ProcessorCount
$cases = @(
 @{ id="idle"; total=0; ambient=$false; splash=$false; types=@(); note="no widgets; animations off" },
 @{ id="normal"; total=7; ambient=$true; splash=$true; types=@("clock","weather","calendar","tasks","note","pcmusic","sysmon"); note="7 mixed widgets including Spotify and system monitor" },
 @{ id="busy"; total=22; ambient=$true; splash=$true; types=@("clock","weather","calendar","tasks","note","pcmusic","sysmon","countdown","finance","agenda","photo","stopwatch","clock","tasks","clock","countdown","calendar","note","tasks","musicstats","clock","note"); note="22 synthetic widgets, mixed display+refresh" }
)
function Create-Data($case, $profile) {
  New-Item -ItemType Directory -Force -Path (Join-Path $profile "userdata") | Out-Null
  $widgets = @()
  for ($i=0; $i -lt $case.types.Count; $i++) {
    $type = $case.types[$i]
    $config = @{}
    if ($type -eq "clock") { $config = @{ style="digital"; seconds=$true } }
    if ($type -eq "pcmusic") { $config = @{ app="spotify"; pcLayout="auto" } }
    if ($type -eq "countdown") { $config = @{ title="Stress test"; target="2027-01-01" } }
    $widgets += @{
      id="audit-widget-$i"
      type=$type
      x=40+($i%5)*285
      y=50+([math]::Floor($i/5))*165
      w=268
      h=155
      config=$config
    }
  }
  $state = @{
    version=1
    state=@{
      settings=@{
        sakura=@{ ambient=[bool]$case.ambient; splash=[bool]$case.splash; splashSeconds=4; density=0.5 }
        musicAutostart=$false
        todayOnStart=$false
        perfPauseInGame=$true
        weatherCity="São Paulo"
      }
      widgets=@($widgets)
    }
  }
  $json = ConvertTo-Json -InputObject $state -Depth 20 -Compress
  [IO.File]::WriteAllText((Join-Path $profile "userdata\agenda-data.json"), $json, (New-Object System.Text.UTF8Encoding($false)))
}
function Get-TreeStats([int]$rootPid) {
  $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
  $ids = New-Object "System.Collections.Generic.HashSet[int]"
  [void]$ids.Add($rootPid)
  for ($r=0; $r -lt 8; $r++) {
    $before = $ids.Count
    foreach ($it in $rows) {
      if ($ids.Contains([int]$it.ParentProcessId)) { [void]$ids.Add([int]$it.ProcessId) }
    }
    if ($ids.Count -eq $before) { break }
  }
  $all = @()
  foreach ($id in $ids) {
    try { $all += Get-Process -Id $id -ErrorAction Stop } catch {}
  }
  if (-not $all.Count) { return $null }
  $private = [double](($all | Measure-Object -Property PrivateMemorySize64 -Sum).Sum)
  $working = [double](($all | Measure-Object -Property WorkingSet64 -Sum).Sum)
  $cpu = [double](($all | Measure-Object -Property CPU -Sum).Sum)
  return @{
    processCount=$all.Count
    privateMB=[math]::Round($private/1MB, 1)
    workingSetMB=[math]::Round($working/1MB, 1)
    cpuSeconds=[math]::Round($cpu, 3)
    childNames=@($all | ForEach-Object { $_.ProcessName } | Sort-Object)
  }
}
function NumberStats($measurements, $field) {
  $numbers = @($measurements | ForEach-Object { [double]$_.$field } | Sort-Object)
  if (-not $numbers.Count) { return @{ min=0; median=0; peak=0; last=0 } }
  return @{
    min=[math]::Round($numbers[0],1)
    median=[math]::Round($numbers[[math]::Floor(($numbers.Count-1)/2)],1)
    peak=[math]::Round($numbers[-1],1)
    last=[math]::Round([double]$measurements[-1].$field,1)
  }
}
$results=@()
foreach($case in $cases){
  Write-Host "WIDGY_BENCH_START:$($case.id)"
  $dir = Join-Path $target $case.id
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Create-Data $case $dir
  $env:AGENDA_SHOT = $dir
  $env:AGENDA_SHOT_STEPS = "new Promise(resolve => setTimeout(resolve, $($HoldSeconds * 1000)))"
  $logOut=Join-Path $dir "stdout.log"
  $logErr=Join-Path $dir "stderr.log"
  $start=[DateTime]::UtcNow
  $p=Start-Process -FilePath $electron -ArgumentList "." -WorkingDirectory $root -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
  $samples=@()
  $maxTime=[DateTime]::UtcNow.AddSeconds($HoldSeconds+20)
  $prevCpu=0
  $prevAt=$null
  try{
    while([DateTime]::UtcNow -lt $maxTime){
      Start-Sleep -Milliseconds 2200
      $snapshot=Get-TreeStats -rootPid $p.Id
      if(-not $snapshot){ break }
      $elapsed=([DateTime]::UtcNow-$start).TotalSeconds
      $cpuPct=0
      if($null -ne $prevAt){
        $delta=($elapsed-$prevAt)
        if($delta -gt 0){ $cpuPct=[math]::Round([math]::Max(0,($snapshot.cpuSeconds-$prevCpu)/$delta/$logicalCpu*100),1) }
      }
      $prevCpu=$snapshot.cpuSeconds
      $prevAt=$elapsed
      $samples+=@{ elapsedSec=[math]::Round($elapsed,1); privateMB=$snapshot.privateMB; workingSetMB=$snapshot.workingSetMB; cpuPct=$cpuPct; processCount=$snapshot.processCount }
      if ($p.HasExited) { break }
    }
  } finally {
    $snapshot=Get-TreeStats -rootPid $p.Id
    if($snapshot) {
      # Kill children before the root so orphaned Electron subprocesses cannot survive between cases.
      $list=@(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
      $ids=New-Object "System.Collections.Generic.HashSet[int]"
      [void]$ids.Add([int]$p.Id)
      for($r=0;$r -lt 8;$r++){ foreach($it in $list){if($ids.Contains([int]$it.ParentProcessId)){[void]$ids.Add([int]$it.ProcessId)}} }
      foreach($id in $ids){try{Stop-Process -Id $id -Force -ErrorAction Stop}catch{}}
    }
  }
  Remove-Item Env:\AGENDA_SHOT -ErrorAction SilentlyContinue
  Remove-Item Env:\AGENDA_SHOT_STEPS -ErrorAction SilentlyContinue
  if($samples.Count -lt 3){ Write-Host "WIDGY_ERROR:$($case.id):Not enough process samples" }
  $steady=@($samples | Where-Object { $_.elapsedSec -gt 8 })
  if($steady.Count -lt 2){$steady=$samples}
  $cpuSamples=@($steady | Where-Object {$_.cpuPct -ge 0})
  $firstDesktop=Get-Item (Join-Path $dir "1-desktop.png") -ErrorAction SilentlyContinue
  $firstSplash=Get-Item (Join-Path $dir "0-splash.png") -ErrorAction SilentlyContinue
  $result=[ordered]@{
    scenario=$case.id
    note=$case.note
    widgetCount=$case.total
    cpuLogical=$logicalCpu
    samples=$samples.Count
    screenshotCaptured=[bool]$firstDesktop
    splashCaptured=[bool]$firstSplash
    desktopMs=if($firstDesktop){[math]::Round(($firstDesktop.LastWriteTimeUtc-$start).TotalMilliseconds)}else{$null}
    private=NumberStats $steady "privateMB"
    workingSet=NumberStats $steady "workingSetMB"
    cpuPct=NumberStats $cpuSamples "cpuPct"
    processCount=NumberStats $steady "processCount"
    records=$samples
    errors=(Get-Content $logErr -ErrorAction SilentlyContinue | Select-Object -Last 15)
  }
  Write-Host ("WIDGY_BENCH_RESULT:"+(ConvertTo-Json -InputObject $result -Compress -Depth 10))
  $results+=$result
}
$distBytes=(Get-ChildItem -LiteralPath (Join-Path $root "dist") -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$iconsBytes=(Get-ChildItem -LiteralPath (Join-Path $root "dist\icon-packs") -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$summary=@{
  environment=@{runner="GitHub Actions windows-latest"; accelerated=$false; shotMode=$true; logicalCpu=$logicalCpu; version=(Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version}
  build=@{ distMB=[math]::Round($distBytes/1MB,2); bundledIconsMB=[math]::Round($iconsBytes/1MB,2) }
  cases=$results
}
$summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $target "benchmark.json") -Encoding UTF8
Write-Host ("WIDGY_BENCH_SUMMARY:"+(ConvertTo-Json -InputObject $summary -Compress -Depth 4))
