[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Show-PlanFactWarning([string]$message) {
    try {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.Popup($message, 0, "Plan Fact", 48)
    }
    catch {
        Write-Warning $message
    }
}

function Test-TrackerBridge {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:18766/health" -Method Get -TimeoutSec 2
        return ($health.ok -eq $true -and [int]$health.bridgeSchemaVersion -eq 5)
    }
    catch {
        return $false
    }
}

function Test-PythonCandidate([string]$filePath, [string[]]$prefixArguments) {
    if ([string]::IsNullOrWhiteSpace($filePath)) { return $false }
    try {
        $probeArguments = @()
        $probeArguments += $prefixArguments
        $probeArguments += @("-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)")
        & $filePath @probeArguments *> $null
        return ($LASTEXITCODE -eq 0)
    }
    catch {
        return $false
    }
}

function Get-PlanFactPython {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:STEFANIA_PYTHON)) {
        $candidates += [PSCustomObject]@{ FilePath = $env:STEFANIA_PYTHON; PrefixArguments = @() }
    }

    foreach ($specification in @(
        @{ Name = "py.exe"; PrefixArguments = @("-3") },
        @{ Name = "python.exe"; PrefixArguments = @() },
        @{ Name = "python3.exe"; PrefixArguments = @() }
    )) {
        $command = Get-Command $specification.Name -ErrorAction SilentlyContinue
        if ($command) {
            $commandPath = $command.Source
            if ([string]::IsNullOrWhiteSpace($commandPath)) { $commandPath = $command.Path }
            $candidates += [PSCustomObject]@{
                FilePath = $commandPath
                PrefixArguments = $specification.PrefixArguments
            }
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-PythonCandidate $candidate.FilePath $candidate.PrefixArguments) {
            return $candidate
        }
    }
    return $null
}

try {
    $appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
    $indexPath = Join-Path $appDirectory "index.html"

    if ([string]::IsNullOrWhiteSpace($env:STARTREK_TOKEN)) {
        $storedTrackerToken = [Environment]::GetEnvironmentVariable("STARTREK_TOKEN", "User")
        if (-not [string]::IsNullOrWhiteSpace($storedTrackerToken)) {
            $env:STARTREK_TOKEN = $storedTrackerToken
        }
    }

    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        throw "Рядом с файлом запуска не найден index.html. Не вынимайте файлы приложения из общей папки."
    }

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw "Windows не вернула путь LOCALAPPDATA для хранения профиля приложения."
    }

    $profilePath = Join-Path $env:LOCALAPPDATA "PlanFactBudget\EdgeProfile"
    New-Item -ItemType Directory -Path $profilePath -Force | Out-Null

    $trackerBridgePath = Join-Path $appDirectory "scripts\tracker-sync-server.py"
    $trackerBridgeReady = Test-TrackerBridge
    $python = $null

    if (-not $trackerBridgeReady -and (Test-Path -LiteralPath $trackerBridgePath -PathType Leaf)) {
        $python = Get-PlanFactPython
        if ($python) {
            $logDirectory = Join-Path $env:LOCALAPPDATA "PlanFactBudget\Logs"
            New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
            $standardOutputLog = Join-Path $logDirectory "tracker-bridge.log"
            $standardErrorLog = Join-Path $logDirectory "tracker-bridge-error.log"
            $bridgeArguments = @()
            $bridgeArguments += $python.PrefixArguments
            $bridgeArguments += "`"$trackerBridgePath`""
            Start-Process -FilePath $python.FilePath -ArgumentList $bridgeArguments -WindowStyle Hidden `
                -RedirectStandardOutput $standardOutputLog -RedirectStandardError $standardErrorLog | Out-Null

            foreach ($attempt in 1..50) {
                if (Test-TrackerBridge) {
                    $trackerBridgeReady = $true
                    break
                }
                Start-Sleep -Milliseconds 200
            }
        }
    }

    if (-not $trackerBridgeReady) {
        if (-not $python) {
            Show-PlanFactWarning "Tracker-синхронизация не запущена: Windows не нашла Python 3.8 или новее. Установите Python с опцией Add python.exe to PATH, затем снова откройте START-WINDOWS.vbs. Остальные функции продолжат работать."
        }
        else {
            Show-PlanFactWarning "Python найден, но Tracker-адаптер не запустился. Проверьте %LOCALAPPDATA%\PlanFactBudget\Logs\tracker-bridge-error.log или пришлите его нам. Остальные функции продолжат работать."
        }
    }

    $edgeCandidates = @()
    foreach ($basePath in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if (-not [string]::IsNullOrWhiteSpace($basePath)) {
            $edgeCandidates += Join-Path $basePath "Microsoft\Edge\Application\msedge.exe"
        }
    }
    $edgeCandidates = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }

    $edgePath = $edgeCandidates | Select-Object -First 1
    if (-not $edgePath) {
        Write-Warning "Microsoft Edge не найден. Открываю приложение в браузере по умолчанию; отдельный профиль данных использоваться не будет."
        Start-Process -FilePath $indexPath
        exit 0
    }

    $indexUri = ([System.Uri]::new((Resolve-Path -LiteralPath $indexPath).Path)).AbsoluteUri
    $arguments = @(
        "--app=$indexUri"
        "--user-data-dir=`"$profilePath`""
        "--no-first-run"
    )

    Start-Process -FilePath $edgePath -ArgumentList $arguments
}
catch {
    Show-PlanFactWarning $_.Exception.Message
    exit 1
}
