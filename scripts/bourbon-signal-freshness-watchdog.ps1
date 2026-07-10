$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OperationsDir = Join-Path $ProjectRoot 'engine\out\operations'
$LogDir = Join-Path $ProjectRoot 'engine\out\logs'
New-Item -ItemType Directory -Force -Path $OperationsDir, $LogDir | Out-Null
$LogPath = Join-Path $LogDir 'freshness-watchdog.log'
$TempEnv = Join-Path $OperationsDir "watchdog-env-$PID"

try {
  $KeyPath = Join-Path $HOME '.bourbon-signal\snapshot-key.dpapi'
  if (-not (Test-Path $KeyPath)) { throw "Snapshot encryption credential is missing: $KeyPath" }
  $Secure = Get-Content $KeyPath | ConvertTo-SecureString
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { $env:ENGINE_SNAPSHOT_ENCRYPTION_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }

  Push-Location $ProjectRoot
  try {
    & vercel env pull $TempEnv --environment production --yes *>> $LogPath
    if ($LASTEXITCODE -ne 0) { throw "Vercel environment pull failed with exit code $LASTEXITCODE" }
    & node "--env-file=$TempEnv" 'scripts/engine-freshness-watchdog.mjs' $ProjectRoot *>> $LogPath
    exit $LASTEXITCODE
  } finally { Pop-Location }
} catch {
  Add-Content -Path $LogPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Freshness watchdog failed: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $TempEnv
  Remove-Item Env:ENGINE_SNAPSHOT_ENCRYPTION_KEY -ErrorAction SilentlyContinue
}
