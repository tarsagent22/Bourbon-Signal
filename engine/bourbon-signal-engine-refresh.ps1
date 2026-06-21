$ErrorActionPreference = 'Continue'

$EngineDir = 'C:\Users\chand\Projects\Bourbon-Signal-inspect\engine'
$LogDir = Join-Path $EngineDir 'out\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogPath = Join-Path $LogDir 'scheduled-refresh.log'
$Node = 'node'

function Write-RefreshLog($Message) {
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $LogPath -Value "[$timestamp] $Message"
}

try {
  Set-Location $EngineDir
  Write-RefreshLog 'Starting scheduled Bourbon Signal engine refresh.'
  $env:BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES = if ($env:BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES) { $env:BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES } else { '30' }
  $env:BOURBON_SIGNAL_BROWSER_PREFLIGHT = if ($env:BOURBON_SIGNAL_BROWSER_PREFLIGHT) { $env:BOURBON_SIGNAL_BROWSER_PREFLIGHT } else { '0' }
  $env:BOURBON_SIGNAL_AUTO_DEPLOY = if ($env:BOURBON_SIGNAL_AUTO_DEPLOY) { $env:BOURBON_SIGNAL_AUTO_DEPLOY } else { '1' }
  $env:BOURBON_SIGNAL_AUTO_DEPLOY_MINUTES = if ($env:BOURBON_SIGNAL_AUTO_DEPLOY_MINUTES) { $env:BOURBON_SIGNAL_AUTO_DEPLOY_MINUTES } else { '30' }
  $env:BOURBON_SIGNAL_HISTORY_DAYS = if ($env:BOURBON_SIGNAL_HISTORY_DAYS) { $env:BOURBON_SIGNAL_HISTORY_DAYS } else { '30' }
  $env:BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS = if ($env:BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS) { $env:BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS } else { '86400000' }
  & $Node 'src/refresh-site.mjs' *>> $LogPath
  $code = $LASTEXITCODE
  Write-RefreshLog "Finished scheduled refresh with exit code $code."
  exit $code
} catch {
  Write-RefreshLog "Scheduled refresh failed: $($_.Exception.Message)"
  exit 1
}
