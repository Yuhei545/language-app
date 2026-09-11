# 同梱レッスンの音声を毎日続きから生成し、変更があればコミットして push する。
#requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

$LogDirectory = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path -LiteralPath $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory | Out-Null
}

$Today = Get-Date
$LogPath = Join-Path $LogDirectory ("daily-audio-{0}.log" -f $Today.ToString('yyyyMMdd'))
# Vite の監視が排他ロック中のファイルを開くと EBUSY になるため、プロジェクトの外に置く。
$LockDirectory = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$LockPath = Join-Path $LockDirectory 'language-app-daily-audio.lock'
$LockStream = $null
$ShouldRun = $true
$ScriptExitCode = 0

function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $LogPath -Value ("[{0}] {1}" -f $timestamp, $Message) -Encoding UTF8
}

function Invoke-LoggedCommandResult {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$ArgumentList
    )

    Write-Log ("実行: {0} {1}" -f $FilePath, ($ArgumentList -join ' '))

    $originalErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 では、stderr の各行が NativeCommandError になるため、
        # ネイティブコマンドの実行中だけ終了例外にしない。
        $ErrorActionPreference = 'Continue'
        $commandOutput = @(& $FilePath @ArgumentList 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $originalErrorActionPreference
    }

    [string[]]$outputLines = @(
        foreach ($outputLine in $commandOutput) {
            $line = $outputLine.ToString()
            Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
            $line
        }
    )

    return [PSCustomObject]@{
        ExitCode = [int]$exitCode
        OutputLines = $outputLines
    }
}

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$ArgumentList
    )

    $result = Invoke-LoggedCommandResult -FilePath $FilePath -ArgumentList $ArgumentList
    return $result.ExitCode
}

try {
    Write-Log '開始'

    try {
        $LockStream = [System.IO.File]::Open(
            $LockPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
    } catch [System.IO.IOException] {
        if (-not (Test-Path -LiteralPath $LockPath)) {
            throw
        }

        $lockItem = Get-Item -LiteralPath $LockPath
        $lockAge = [DateTime]::UtcNow - $lockItem.LastWriteTimeUtc
        if ($lockAge.TotalHours -lt 24) {
            Write-Log '別の daily-audio.ps1 が動作中のため終了します'
            $ShouldRun = $false
        } else {
            Write-Log ("24時間以上前の古いロックを上書きします: {0}" -f $lockItem.LastWriteTime)
            try {
                $LockStream = [System.IO.File]::Open(
                    $LockPath,
                    [System.IO.FileMode]::Create,
                    [System.IO.FileAccess]::Write,
                    [System.IO.FileShare]::None
                )
            } catch [System.IO.IOException] {
                Write-Log ("古いロックファイルが使用中のため終了します: {0}" -f $_.Exception.Message)
                $ShouldRun = $false
            }
        }
    }

    if ($ShouldRun) {
        $lockText = "PID={0}`r`n開始={1:o}`r`n" -f $PID, (Get-Date)
        $lockBytes = [System.Text.Encoding]::UTF8.GetBytes($lockText)
        $LockStream.Write($lockBytes, 0, $lockBytes.Length)
        $LockStream.Flush()

        $pullExitCode = Invoke-LoggedCommand -FilePath 'git' -ArgumentList @('pull', '--ff-only')
        Write-Log ("git pull 終了コード: {0}" -f $pullExitCode)
        if ($pullExitCode -ne 0) {
            Write-Log 'git pull に失敗しましたが、音声生成を続けます'
        }

        # Gemini の日次上限を自動生成で使い切らず、練習中の読み上げ用の枠を残す。
        $koExitCode = Invoke-LoggedCommand -FilePath 'npm.cmd' -ArgumentList @(
            'run', 'lessons:audio', '--', '--lang', 'ko', '--batch', '1', '--interval', '2000', '--max-per-model', '80'
        )
        Write-Log ("韓国語の音声生成 終了コード: {0}" -f $koExitCode)

        Write-Log '英語を実行するか判定するため npm run lessons:check を実行します'
        $koStatusResult = Invoke-LoggedCommandResult -FilePath 'npm.cmd' -ArgumentList @('run', 'lessons:check')
        $koStatusLines = @($koStatusResult.OutputLines)
        $koStatusExitCode = $koStatusResult.ExitCode
        Write-Log ("npm run lessons:check 終了コード: {0}" -f $koStatusExitCode)

        $koRemaining = 0
        $koCountFound = $false
        $currentLanguage = $null
        if ($koStatusExitCode -eq 0) {
            foreach ($statusLine in $koStatusLines) {
                $line = $statusLine.ToString()
                if ($line -match '^\[(en|ko)\]') {
                    $currentLanguage = $Matches[1]
                } elseif (($currentLanguage -eq 'ko') -and ($line -match '^\s+\S+\s+(\d+)\s*/\s*(\d+)')) {
                    $koRemaining += [int]$Matches[2] - [int]$Matches[1]
                    $koCountFound = $true
                }
            }
        }

        if (($koStatusExitCode -eq 0) -and $koCountFound -and ($koRemaining -eq 0)) {
            $enExitCode = Invoke-LoggedCommand -FilePath 'npm.cmd' -ArgumentList @(
                'run', 'lessons:audio', '--', '--lang', 'en', '--batch', '1', '--interval', '2000', '--max-per-model', '80'
            )
            Write-Log ("英語の音声生成 終了コード: {0}" -f $enExitCode)
        } elseif ($koStatusExitCode -ne 0) {
            Write-Log '韓国語の残り件数を確認できなかったため、英語の音声生成は行いません'
        } elseif (-not $koCountFound) {
            Write-Log 'lessons:check の出力から韓国語の残り件数を判定できなかったため、英語の音声生成は行いません'
        } else {
            Write-Log ("韓国語が残り {0} クリップのため、英語の音声生成は行いません" -f $koRemaining)
        }

        $addExitCode = Invoke-LoggedCommand -FilePath 'git' -ArgumentList @(
            'add',
            'public/lessons',
            'src/content/en/lessons/audio-manifest.json',
            'src/content/ko/lessons/audio-manifest.json'
        )
        Write-Log ("git add 終了コード: {0}" -f $addExitCode)
        if ($addExitCode -ne 0) {
            throw "git add に失敗しました(終了コード: $addExitCode)"
        }

        $diffExitCode = Invoke-LoggedCommand -FilePath 'git' -ArgumentList @('diff', '--cached', '--quiet')
        Write-Log ("git diff --cached --quiet 終了コード: {0}" -f $diffExitCode)

        if ($diffExitCode -eq 0) {
            Write-Log '変更なし'
        } elseif ($diffExitCode -eq 1) {
            $commitSubject = "音声: 自動生成 {0}" -f $Today.ToString('yyyy-MM-dd')

            Write-Log '件数確認のため npm run lessons:check を実行します'
            $statusResult = Invoke-LoggedCommandResult -FilePath 'npm.cmd' -ArgumentList @('run', 'lessons:check')
            $statusLines = @($statusResult.OutputLines)
            $statusExitCode = $statusResult.ExitCode
            Write-Log ("npm run lessons:check 終了コード: {0}" -f $statusExitCode)

            if ($statusExitCode -eq 0) {
                $counts = @{ en = 0; ko = 0 }
                $countFound = @{ en = $false; ko = $false }
                $currentLanguage = $null

                foreach ($statusLine in $statusLines) {
                    $line = $statusLine.ToString()
                    if ($line -match '^\[(en|ko)\]') {
                        $currentLanguage = $Matches[1]
                    } elseif (($null -ne $currentLanguage) -and ($line -match '^\s+\S+\s+(\d+)\s*/\s*\d+')) {
                        $counts[$currentLanguage] += [int]$Matches[1]
                        $countFound[$currentLanguage] = $true
                    }
                }

                if ($countFound['ko'] -and $countFound['en']) {
                    $commitSubject += " (ko {0} 件 / en {1} 件)" -f $counts['ko'], $counts['en']
                } else {
                    Write-Log '件数を取得できなかったため、コミットメッセージには日付だけを使います'
                }
            } else {
                Write-Log '件数確認に失敗したため、コミットメッセージには日付だけを使います'
            }

            $commitExitCode = Invoke-LoggedCommand -FilePath 'git' -ArgumentList @(
                'commit',
                '-m', $commitSubject,
                '-m', 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
            )
            Write-Log ("git commit 終了コード: {0}" -f $commitExitCode)
            if ($commitExitCode -ne 0) {
                throw "git commit に失敗しました(終了コード: $commitExitCode)"
            }

            $pushExitCode = Invoke-LoggedCommand -FilePath 'git' -ArgumentList @('push', 'origin', 'main')
            Write-Log ("git push 終了コード: {0}" -f $pushExitCode)
            if ($pushExitCode -ne 0) {
                Write-Log 'git push に失敗しました'
                $ScriptExitCode = 1
            }
        } else {
            throw "git diff --cached --quiet に失敗しました(終了コード: $diffExitCode)"
        }
    }
} catch {
    Write-Log ("例外: {0}" -f $_.Exception.ToString())
    if ($_.ScriptStackTrace) {
        Write-Log ("発生箇所: {0}" -f $_.ScriptStackTrace)
    }
    $ScriptExitCode = 1
} finally {
    if ($null -ne $LockStream) {
        try {
            $LockStream.Dispose()
            Remove-Item -LiteralPath $LockPath -Force
        } catch {
            Write-Log ("ロックファイルの削除に失敗しました: {0}" -f $_.Exception.ToString())
            $ScriptExitCode = 1
        }
    }

    Write-Log ("終了 (終了コード: {0})" -f $ScriptExitCode)
}

exit $ScriptExitCode
