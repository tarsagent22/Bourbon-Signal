param(
  [string]$ProjectRoot = 'C:\Users\chand\projects\bs-mobile-radar-watchlist',
  [string]$CredentialPath = "$env:LOCALAPPDATA\BourbonSignal\ohlq-worker\worker-credential.dpapi",
  [int]$TimeoutMinutes = 45
)

$ErrorActionPreference = 'Stop'
$mutex = New-Object System.Threading.Mutex($false, 'Local\BourbonSignalOhlqWorker')
$lockAcquired = $false
$secretPointer = [IntPtr]::Zero

try {
  $lockAcquired = $mutex.WaitOne(0)
  if (-not $lockAcquired) { exit 0 }
  if (-not (Test-Path $CredentialPath)) { throw "OHLQ DPAPI credential is missing: $CredentialPath" }
  if (-not (Test-Path (Join-Path $ProjectRoot 'scripts\ohlq-persistent-worker.mjs'))) { throw "OHLQ worker checkout is missing: $ProjectRoot" }

  $secure = Get-Content -Raw $CredentialPath | ConvertTo-SecureString
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $env:CRON_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  $env:OHLQ_WORKER_STATE_DIR = if ($env:OHLQ_WORKER_STATE_DIR) { $env:OHLQ_WORKER_STATE_DIR } else { "$env:LOCALAPPDATA\BourbonSignal\ohlq-worker" }

  $worker = Start-Process -FilePath 'node.exe' -ArgumentList @('scripts/ohlq-persistent-worker.mjs') -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  if (-not $worker.WaitForExit($TimeoutMinutes * 60 * 1000)) {
    & taskkill.exe /PID $worker.Id /T /F 2>$null | Out-Null
    if (-not $worker.HasExited) { Stop-Process -Id $worker.Id -Force -ErrorAction SilentlyContinue }
    throw "OHLQ worker exceeded the bounded $TimeoutMinutes minute runtime."
  }
  if ($worker.ExitCode -ne 0) { throw "OHLQ worker failed with exit code $($worker.ExitCode)." }
  exit 0
} finally {
  Remove-Item Env:CRON_SECRET -ErrorAction SilentlyContinue
  if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
  if ($lockAcquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
