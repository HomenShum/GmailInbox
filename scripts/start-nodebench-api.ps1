$ErrorActionPreference = "Stop"

$defaultWorktree = "D:\VSCode Projects\cafecorner_nodebench\nodebench_ai4\nodebench-ai"
$worktree = if ($env:NODEBENCH_WORKTREE) { $env:NODEBENCH_WORKTREE } else { $defaultWorktree }
$apiPackage = Join-Path $worktree "apps\api-headless\package.json"
$distServer = Join-Path $worktree "apps\api-headless\dist\server.js"
$envFile = Join-Path $worktree ".env.local"
$logDir = Join-Path (Get-Location) "scripts\output"
$outLog = Join-Path $logDir "nodebench-api-headless.out.log"
$errLog = Join-Path $logDir "nodebench-api-headless.err.log"

function Test-NodeBenchHealth {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8020/health" -Method Get -TimeoutSec 2
    return $response.status -eq "ok"
  } catch {
    return $false
  }
}

if (!(Test-Path -LiteralPath $apiPackage)) {
  throw "NodeBench api-headless package was not found at $apiPackage. Set NODEBENCH_WORKTREE to the correct NodeBench repo."
}

if (Test-NodeBenchHealth) {
  Write-Host "NodeBench api-headless is already healthy at http://127.0.0.1:8020"
  exit 0
}

if (!(Test-Path -LiteralPath $distServer)) {
  Write-Host "Building NodeBench api-headless..."
  npm --prefix (Join-Path $worktree "apps\api-headless") run build
}

if (Test-Path -LiteralPath $envFile) {
  $viteConvex = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match "^VITE_CONVEX_URL=" } |
    Select-Object -First 1

  if ($viteConvex) {
    $env:CONVEX_URL = $viteConvex -replace "^VITE_CONVEX_URL=", ""
  }
}

$env:NODE_ENV = "development"
$env:API_PORT = "8020"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$node = (Get-Command node -ErrorAction Stop).Source
Start-Process `
  -FilePath $node `
  -ArgumentList "apps/api-headless/dist/server.js" `
  -WorkingDirectory $worktree `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden

Start-Sleep -Seconds 3

if (!(Test-NodeBenchHealth)) {
  Write-Host "NodeBench api-headless did not become healthy. stdout: $outLog stderr: $errLog"
  exit 1
}

Write-Host "NodeBench api-headless is healthy at http://127.0.0.1:8020"
