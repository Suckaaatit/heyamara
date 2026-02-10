param(
  [int]$ApiPort = 3000
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$watchDir = Join-Path $root "watched"

Write-Host "Watcher Daemon demo starting..."
Write-Host "Root: $root"

# Check Ollama availability (optional but recommended for matches)
$ollamaAvailable = $false
try {
  Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 | Out-Null
  $ollamaAvailable = $true
} catch {
  Write-Host "Ollama not detected on http://localhost:11434. Rule evaluation will be paused."
}

# Start daemon
$daemon = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory $root -PassThru -NoNewWindow

try {
  # Wait for API health
  $healthUrl = "http://localhost:$ApiPort/health"
  $deadline = (Get-Date).AddSeconds(20)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
      if ($resp.status -eq "ok") {
        $healthy = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $healthy) {
    Write-Host "API did not become healthy in time. Check logs and port $ApiPort."
  } else {
    Write-Host "API is healthy."
  }

  # Create demo rule
  $ruleBody = @{
    name = "Demo: TS Changes"
    description = "Alert on .ts changes"
    condition = "Alert when TypeScript files change"
  } | ConvertTo-Json

  try {
    $rule = Invoke-RestMethod -Method Post -Uri "http://localhost:$ApiPort/rules" -Body $ruleBody -ContentType "application/json"
    Write-Host "Rule created: $($rule.id)"
  } catch {
    Write-Host "Rule creation failed: $($_.Exception.Message)"
  }

  # Trigger file event
  if (!(Test-Path $watchDir)) {
    New-Item -ItemType Directory -Path $watchDir | Out-Null
  }
  $demoFile = Join-Path $watchDir "demo.ts"
  "// demo change $(Get-Date -Format o)" | Set-Content -Path $demoFile -Encoding UTF8
  Write-Host "Wrote demo file: $demoFile"

  Start-Sleep -Seconds 3

  # Fetch report
  try {
    $report = Invoke-RestMethod -Uri "http://localhost:$ApiPort/report"
    Write-Host "Report:"
    $report | ConvertTo-Json -Depth 6 | Write-Host
  } catch {
    Write-Host "Report fetch failed: $($_.Exception.Message)"
  }

  if (-not $ollamaAvailable) {
    Write-Host "Tip: start Ollama and run a model (e.g. 'ollama run llama2') to see rule matches."
  }
} finally {
  if ($daemon -and !$daemon.HasExited) {
    Stop-Process -Id $daemon.Id -Force
    Write-Host "Daemon stopped."
  }
}

Write-Host "Demo complete."
