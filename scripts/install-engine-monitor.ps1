param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedCommit,
  [switch]$EnableDispatch,
  [switch]$EnableNotifications,
  [switch]$ImportKnownIncident
)
$ErrorActionPreference='Stop'
$repoRootPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$actualCommit=(& git -C $repoRootPath rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $actualCommit -ne $ExpectedCommit){throw 'Installer requires the exact reviewed commit.'}
if((& git -C $repoRootPath status --porcelain)){throw 'Installer requires a clean checkout.'}
$nodeExecutable=(Get-Command node.exe -ErrorAction Stop).Source
$githubExecutable=(Get-Command gh.exe -ErrorAction Stop).Source
$operationsRoot=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex\operations\bourbon-signal'
$monitorRoot=Join-Path $operationsRoot 'engine-monitor'
$runtimeRoot=Join-Path $monitorRoot 'runtime'
$evidenceRoot=Join-Path $operationsRoot 'engine-freshness-20261015'
$configurationPath=Join-Path $operationsRoot 'engine-monitor\config.json'
foreach($directory in @($operationsRoot,$monitorRoot,$runtimeRoot,(Join-Path $runtimeRoot 'lib'),$evidenceRoot)){
  if((Test-Path -LiteralPath $directory) -and ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing to install through a redirected directory.'}
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$manifest=@{commit=$ExpectedCommit;installedAt=[DateTime]::UtcNow.ToString('o');files=@{}}
foreach($relative in @('scripts/engine-monitor.mjs','scripts/lib/engine-monitor-policy.mjs')){
  $sourcePath=Join-Path $repoRootPath $relative
  $destinationPath=Join-Path $runtimeRoot ($relative -replace '^scripts/','')
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
  $manifest.files[$relative]=(Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
@{evidenceDirectory=$evidenceRoot;githubCommand=$githubExecutable;dispatchEnabled=[bool]$EnableDispatch;notificationsEnabled=[bool]$EnableNotifications;installedCommit=$ExpectedCommit}|ConvertTo-Json|Set-Content -LiteralPath $configurationPath -Encoding UTF8
$manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $runtimeRoot 'installed.json') -Encoding UTF8

# Migration is explicit: this incident was actually reported in the owner chat.
# Merely preparing an outbox message is not evidence that anyone received it.
$statePath=Join-Path $evidenceRoot 'deterministic-monitor-state.json'
if($ImportKnownIncident -and !(Test-Path -LiteralPath $statePath)){
  $workStatus=Get-Content -LiteralPath (Join-Path $evidenceRoot 'work-status.json') -Raw|ConvertFrom-Json
  $lastObservation=Get-Content -LiteralPath (Join-Path $evidenceRoot 'latest-observation.json') -Raw|ConvertFrom-Json
  if(!$lastObservation.ok -and $workStatus.latestAcceptanceIncident){
    $incidentName=[IO.Path]::GetFileName($workStatus.latestAcceptanceIncident)
    $incident=Get-Content -LiteralPath (Join-Path $evidenceRoot $incidentName) -Raw|ConvertFrom-Json
    $incidentId='engine-'+$incident.detectedAt
    $eventId=$incidentId+':opened'
    $deliveries=@{};$deliveries[$eventId]=@{status='previously_reported_in_chat';attempts=0}
    @{badChecks=2;goodChecks=0;incident=@{id=$incidentId;openedAt=$incident.detectedAt;collectionAtOpen=$incident.collectedAt;issues=$lastObservation.issues};events=@(@{id=$eventId;type='incident_opened';at=$incident.detectedAt;message='Previously reported engine freshness incident.'});notificationResults=$deliveries}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $statePath -Encoding UTF8
  }
}
if($EnableNotifications){
  $applicationKey='HKCU:\Software\Classes\AppUserModelId\BourbonSignal.EngineMonitor'
  New-Item -Path $applicationKey -Force|Out-Null
  New-ItemProperty -Path $applicationKey -Name DisplayName -Value 'Bourbon Signal engine monitor' -PropertyType String -Force|Out-Null
}
$ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$safeNode=$nodeExecutable.Replace("'","''")
$safeWorker=(Join-Path $runtimeRoot 'engine-monitor.mjs').Replace("'","''")
$safeConfig=$configurationPath.Replace("'","''")
$command="& '$safeNode' '$safeWorker' --config '$safeConfig'; exit `$LASTEXITCODE"
$arguments=[Security.SecurityElement]::Escape("-NoProfile -NonInteractive -WindowStyle Hidden -Command `"$command`"")
$workingDirectory=[Security.SecurityElement]::Escape($runtimeRoot)
$startBoundary=(Get-Date).Date.ToString('yyyy-MM-ddTHH:mm:ss')
$taskXml=@"
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>Deterministic Bourbon Signal engine checks and bounded canonical refresh dispatch. No AI invocation or local publication.</Description></RegistrationInfo>
 <Triggers>
  <CalendarTrigger><Repetition><Interval>PT5M</Interval><Duration>P1D</Duration><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>$startBoundary</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
  <LogonTrigger><Enabled>true</Enabled><Delay>PT1M</Delay><UserId>$ownerSid</UserId></LogonTrigger>
 </Triggers>
 <Principals><Principal id="Owner"><UserId>$ownerSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><Enabled>true</Enabled><Hidden>true</Hidden><WakeToRun>true</WakeToRun><ExecutionTimeLimit>PT4M</ExecutionTimeLimit><RestartOnFailure><Interval>PT5M</Interval><Count>2</Count></RestartOnFailure></Settings>
 <Actions Context="Owner"><Exec><Command>C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Command><Arguments>$arguments</Arguments><WorkingDirectory>$workingDirectory</WorkingDirectory></Exec></Actions>
</Task>
"@
Register-ScheduledTask -TaskName 'BourbonSignalEngineMonitor' -Xml $taskXml -Force|Out-Null
Write-Output (@{task='BourbonSignalEngineMonitor';commit=$ExpectedCommit;dispatchEnabled=[bool]$EnableDispatch;notificationsEnabled=[bool]$EnableNotifications;configuration=$configurationPath;hostRequirement='Computer powered on and owner signed in; sleep wake and missed-start recovery enabled. Existing cloud watchdog remains a fallback.'}|ConvertTo-Json)
