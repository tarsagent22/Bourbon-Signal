$ErrorActionPreference = 'Stop'

$EngineDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $EngineDir
$LogDir = Join-Path $EngineDir 'out\logs'
$OperationsDir = Join-Path $EngineDir 'out\operations'
New-Item -ItemType Directory -Force -Path $LogDir, $OperationsDir | Out-Null
$LogPath = Join-Path $LogDir 'scheduled-refresh.log'
$Node = 'node'
$Mutex = New-Object System.Threading.Mutex($false, 'Local\BourbonSignalEngineRefresh')
$LockAcquired = $false

function Write-RefreshLog($Message) {
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $LogPath -Value "[$timestamp] $Message"
}

function Import-SnapshotCredentials {
  $KeyPath = Join-Path $HOME '.bourbon-signal\snapshot-key.dpapi'
  if (-not (Test-Path $KeyPath)) { throw "Snapshot encryption credential is missing: $KeyPath" }
  $Secure = Get-Content $KeyPath | ConvertTo-SecureString
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { $env:ENGINE_SNAPSHOT_ENCRYPTION_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }

  $TempEnv = Join-Path $OperationsDir "publisher-env-$PID"
  Push-Location $ProjectRoot
  try {
    & vercel env pull $TempEnv --environment production --yes *>> $LogPath
    if ($LASTEXITCODE -ne 0) { throw "Vercel environment pull failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
  return $TempEnv
}

try {
  $LockAcquired = $Mutex.WaitOne(0)
  if (-not $LockAcquired) {
    Write-RefreshLog 'Skipped refresh because another engine refresh is running.'
    exit 0
  }

  Set-Location $EngineDir
  Write-RefreshLog 'Starting scheduled Bourbon Signal engine refresh.'
  $env:BOURBON_SIGNAL_REFRESH_CADENCE_MINUTES = if ($env:BOURBON_SIGNAL_REFRESH_CADENCE_MINUTES) { $env:BOURBON_SIGNAL_REFRESH_CADENCE_MINUTES } else { '30' }
  $env:BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES = if ($env:BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES) { $env:BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES } else { '240' }
  $env:BOURBON_SIGNAL_RUN_STEP_TIMEOUT_MS = if ($env:BOURBON_SIGNAL_RUN_STEP_TIMEOUT_MS) { $env:BOURBON_SIGNAL_RUN_STEP_TIMEOUT_MS } else { '2100000' }
  $env:BOURBON_SIGNAL_FWGS_BROWSER_STEP_TIMEOUT_MS = if ($env:BOURBON_SIGNAL_FWGS_BROWSER_STEP_TIMEOUT_MS) { $env:BOURBON_SIGNAL_FWGS_BROWSER_STEP_TIMEOUT_MS } else { '1320000' }
  $env:BOURBON_SIGNAL_BROWSER_PREFLIGHT = if ($env:BOURBON_SIGNAL_BROWSER_PREFLIGHT) { $env:BOURBON_SIGNAL_BROWSER_PREFLIGHT } else { '0' }
  $env:BOURBON_SIGNAL_AUTO_DEPLOY = '0'
  $env:BOURBON_SIGNAL_AUTO_DEPLOY_MINUTES = '0'
  $env:BOURBON_SIGNAL_HISTORY_DAYS = if ($env:BOURBON_SIGNAL_HISTORY_DAYS) { $env:BOURBON_SIGNAL_HISTORY_DAYS } else { '30' }
  $env:BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS = if ($env:BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS) { $env:BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS } else { '86400000' }

  & $Node 'src/refresh-site.mjs' *>> $LogPath
  $RefreshCode = $LASTEXITCODE
  if ($RefreshCode -ne 0) { throw "Scheduled refresh failed with exit code $RefreshCode" }

  $TempEnv = Import-SnapshotCredentials
  try {
    & $Node "--env-file=$TempEnv" 'src/data-plane/publish-site-snapshot.mjs' '--site-dir' (Join-Path $EngineDir 'out\site') *>> $LogPath
    $PublishCode = $LASTEXITCODE
    if ($PublishCode -ne 0) { throw "Snapshot publication failed with exit code $PublishCode" }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $TempEnv
    Remove-Item Env:ENGINE_SNAPSHOT_ENCRYPTION_KEY -ErrorAction SilentlyContinue
  }

  Write-RefreshLog 'Finished scheduled refresh and atomic snapshot activation successfully.'
  exit 0
} catch {
  Write-RefreshLog "Scheduled refresh failed: $($_.Exception.Message)"
  exit 1
} finally {
  if ($LockAcquired) { $Mutex.ReleaseMutex() }
  $Mutex.Dispose()
}
