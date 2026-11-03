param([int]$Port = 5000)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskApp = Join-Path $taskRoot 'server\index.js'
if (!(Test-Path -LiteralPath $taskNode)) {
    throw 'Install Node.js 22.12 or newer first; see docs/DEVELOPMENT.md.'
}
$taskListener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($taskListener) {
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($taskListener.OwningProcess)"
    $taskMatchesEnvironment = $taskProcess.ExecutablePath -eq $taskNode
    if (!$taskMatchesEnvironment -or !$taskProcess.CommandLine -or $taskProcess.CommandLine.IndexOf($taskApp, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "Port $Port belongs to another application; it was left running. Choose a different -Port."
    }
    Stop-Process -Id $taskProcess.ProcessId
}
$env:PORT = "$Port"
Push-Location $taskRoot
try { & $taskNode $taskApp }
finally { Pop-Location }
