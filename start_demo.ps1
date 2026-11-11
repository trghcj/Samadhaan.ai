# Starts the demo.
#
#   -Local  (recommended): backend (with MuRIL) + the website, both on this laptop.
#                          Opens http://localhost:5173. No tunnel, no Vercel.
#   (no flag)             : backend + a free Cloudflare tunnel, then prints a link that makes
#                          the DEPLOYED Vercel site use this laptop (needs that site to have
#                          the ?api= code deployed).
#
# Run:  powershell -ExecutionPolicy Bypass -File start_demo.ps1 -Local
# Stop: press Enter in this window (it also stops everything it started).
# One-time setup is in README_DEMO.md.

param([switch]$Local)

$ErrorActionPreference = "Stop"
$root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$site     = "https://samadhaan-ai.vercel.app"
$logDir   = Join-Path $root ".demo-logs"

# A terminal opened before Node was installed does not know about it yet: reload PATH.
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# Backend Python: $env:SAMADHAAN_VENV, else a venv outside OneDrive, else backend\venv.
$python = $null
foreach ($v in @($env:SAMADHAAN_VENV, (Join-Path $env:USERPROFILE ".venvs\samadhaan"), (Join-Path $backend "venv"))) {
    if ($v -and (Test-Path (Join-Path $v "Scripts\python.exe"))) { $python = Join-Path $v "Scripts\python.exe"; break }
}

function Stop-Tree($p) {
    # npm / uvicorn start child processes, so kill the whole tree
    if ($p -and -not $p.HasExited) { & taskkill /PID $p.Id /T /F 2>$null | Out-Null }
}

function Wait-ForUrl($url, $seconds, $proc, $logHint) {
    for ($i = 0; $i -lt $seconds; $i++) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) { throw "Process exited early. See $logHint" }
        try { if ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { return $true } } catch { }
    }
    return $false
}

# ---- checks ----
if (-not $python) { throw "No backend virtual environment found (looked for `$env:SAMADHAAN_VENV, ~\.venvs\samadhaan, backend\venv). Create it first (see README_DEMO.md)." }
if (-not (Test-Path (Join-Path $backend ".env"))) { Write-Warning "backend\.env not found: the backend needs DATABASE_URL there." }
if (-not (Test-Path (Join-Path $root "research\outputs\muril\model\config.json"))) { Write-Warning "MuRIL model files not found; the backend will fall back to Gemini." }

if ($Local) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { throw "Node.js / npm is not installed or not on PATH. Install Node.js (LTS) from https://nodejs.org and open a new terminal." }
    $envLocal = Join-Path $frontend ".env.local"
    if (-not (Test-Path $envLocal) -or -not (Select-String -Path $envLocal -Pattern "^VITE_FIREBASE_API_KEY=." -Quiet)) {
        # Without any Firebase key the site crashes to a blank page at startup. Placeholder values let it
        # load: citizens can report anonymously, but login and the operator dashboard will not work.
        $env:VITE_FIREBASE_API_KEY     = "demo-no-login"
        $env:VITE_FIREBASE_AUTH_DOMAIN = "localhost"
        $env:VITE_FIREBASE_PROJECT_ID  = "demo-no-login"
        $env:VITE_FIREBASE_APP_ID      = "1:0:web:0"
        Write-Warning "No Firebase values in frontend\.env.local: running with login DISABLED (anonymous reporting only; no operator dashboard)."
    }
    if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
        Write-Host "Installing frontend packages (first time only, a few minutes) ..."
        Push-Location $frontend; & npm.cmd install; Pop-Location
        if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
    }
} else {
    $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
    if (-not $cloudflared) { throw "cloudflared is not installed or not on PATH (see README_DEMO.md), or use -Local." }
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$apiOut = Join-Path $logDir "backend.out.log";  $apiErr = Join-Path $logDir "backend.err.log"
$webOut = Join-Path $logDir "frontend.out.log"; $webErr = Join-Path $logDir "frontend.err.log"
$tunOut = Join-Path $logDir "tunnel.out.log";   $tunErr = Join-Path $logDir "tunnel.err.log"
Remove-Item $apiOut, $apiErr, $webOut, $webErr, $tunOut, $tunErr -ErrorAction SilentlyContinue

# Closing this window does NOT stop the programs it started, so an earlier run can still hold the ports.
# Stop leftovers that are ours (uvicorn / vite); refuse to touch anything else.
function Free-Port($port, $ours) {
    foreach ($c in @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue).CommandLine
        if ($cmd -match $ours) {
            Write-Host "Stopping a leftover demo process on port $port (pid $($c.OwningProcess)) ..."
            & taskkill /PID $c.OwningProcess /T /F 2>$null | Out-Null
            Start-Sleep -Seconds 2
        } else {
            throw "Port $port is in use by another program (pid $($c.OwningProcess)): $cmd. Close it and run again."
        }
    }
}
Free-Port 8000 "uvicorn"
if ($Local) { Free-Port 5173 "vite" }

$procs = @()
try {
    Write-Host "Starting backend on 127.0.0.1:8000 ..."
    $api = Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $backend -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
    $procs += $api
    if (-not (Wait-ForUrl "http://127.0.0.1:8000/" 90 $api $apiErr)) { throw "Backend did not start within 90 s. See $apiErr" }
    Write-Host "Backend is up."

    if ($Local) {
        Write-Host "Starting the website on localhost:5173 ..."
        $web = Start-Process -FilePath $npm.Source -ArgumentList "run", "dev", "--", "--port", "5173", "--strictPort" `
            -WorkingDirectory $frontend -PassThru -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr
        $procs += $web
        if (-not (Wait-ForUrl "http://localhost:5173/" 60 $web $webErr)) { throw "Website did not start within 60 s. See $webErr" }
        Write-Host ""
        Write-Host "Ready: http://localhost:5173" -ForegroundColor Green
        Write-Host "Tip: submit one rehearsal complaint first. The first request loads Whisper and MuRIL and is slower."
        Start-Process "http://localhost:5173"
    } else {
        Write-Host "Starting tunnel ..."
        $tun = Start-Process -FilePath $cloudflared.Source -ArgumentList "tunnel", "--url", "http://127.0.0.1:8000", "--no-autoupdate" `
            -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunOut -RedirectStandardError $tunErr
        $procs += $tun
        $tunnelUrl = $null
        for ($i = 0; $i -lt 60 -and -not $tunnelUrl; $i++) {
            Start-Sleep -Seconds 1
            foreach ($f in @($tunErr, $tunOut)) {
                if (Test-Path $f) {
                    $m = [regex]::Match((Get-Content $f -Raw -ErrorAction SilentlyContinue), "https://[a-z0-9-]+\.trycloudflare\.com")
                    if ($m.Success) { $tunnelUrl = $m.Value; break }
                }
            }
        }
        if (-not $tunnelUrl) { throw "Could not find the tunnel address. See $tunErr" }
        $link = "$site/?api=$tunnelUrl"
        Set-Clipboard -Value $link
        Write-Host ""
        Write-Host "Open this link (also copied to the clipboard):" -ForegroundColor Green
        Write-Host "  $link"
        Write-Host "Tip: submit one rehearsal complaint first. The first request loads Whisper and MuRIL and is slower."
        Start-Process $link
    }
    Write-Host ""
    Read-Host "Press Enter to stop the demo"
}
finally {
    foreach ($p in $procs) { Stop-Tree $p }
    Write-Host "Stopped."
}
