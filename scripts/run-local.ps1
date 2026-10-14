param([int]$Port = 5000)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
$taskApp = Join-Path $taskRoot 'backend\app.py'
if (!(Test-Path -LiteralPath $taskPython)) {
    throw 'Create .venv and install requirements-lock.txt first; see docs/DEVELOPMENT.md.'
}
$taskListener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($taskListener) {
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($taskListener.OwningProcess)"
    $taskMatchesEnvironment = $taskProcess.CommandLine.IndexOf($taskPython, [StringComparison]::OrdinalIgnoreCase) -ge 0
    if (!$taskMatchesEnvironment -or $taskProcess.CommandLine -notmatch 'backend[\\/]app\.py') {
        throw "Port $Port belongs to another application; it was left running. Choose a different -Port."
    }
    Stop-Process -Id $taskProcess.ProcessId
}
$env:PORT = "$Port"
Push-Location $taskRoot
try { & $taskPython $taskApp }
finally { Pop-Location }
