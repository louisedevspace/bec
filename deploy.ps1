# ==========================================
#  Becxus Exchange - Windows Deploy Script
#  Usage: .\deploy.ps1
# ==========================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Becxus Exchange - Deployment Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------
# 1. Check Node.js
# ------------------------------------------
try {
    $nodeRaw = node -v
    $nodeVersion = $nodeRaw -replace 'v', ''
    $major = [int]($nodeVersion.Split('.')[0])
    if ($major -lt 18) {
        Write-Host "x Node.js >= 18 required. Current: v$nodeVersion" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK Node.js v$nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "x Node.js is not installed. Please install Node.js >= 18" -ForegroundColor Red
    exit 1
}

# ------------------------------------------
# 2. Check .env file
# ------------------------------------------
if (-not (Test-Path ".env")) {
    Write-Host "x .env file not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Copy .env.example to .env and fill in your values:" -ForegroundColor Yellow
    Write-Host "  copy .env.example .env"
    Write-Host ""
    Write-Host "Required variables:"
    Write-Host "  SUPABASE_URL=https://your-project.supabase.co"
    Write-Host "  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    Write-Host "  DATABASE_URL=postgresql://..."
    Write-Host "  PORT=5050"
    exit 1
}
Write-Host "OK .env file found" -ForegroundColor Green

# Load .env into current process environment
Get-Content .env | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $parts = $line -split '=', 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

# Check required env vars
$missing = @()
if (-not $env:SUPABASE_URL) { $missing += "SUPABASE_URL" }
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { $missing += "SUPABASE_SERVICE_ROLE_KEY" }
if (-not $env:DATABASE_URL) { $missing += "DATABASE_URL" }

if ($missing.Count -gt 0) {
    Write-Host "x Missing required env vars: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "OK Environment variables configured" -ForegroundColor Green

# Check Redis (optional but recommended)
if (-not $env:REDIS_URL) {
    Write-Host "! REDIS_URL not set - app will work but caching disabled" -ForegroundColor Yellow
    Write-Host "  For production, add Redis service in Coolify and set REDIS_URL" -ForegroundColor Yellow
} else {
    Write-Host "OK Redis configured: $($env:REDIS_URL)" -ForegroundColor Green
}

# ------------------------------------------
# 3. Install dependencies
# ------------------------------------------
Write-Host ""
Write-Host ">> Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed" -ForegroundColor Red; exit 1 }
Write-Host "OK Dependencies installed" -ForegroundColor Green

# ------------------------------------------
# 4. Build for production
# ------------------------------------------
Write-Host ""
Write-Host ">> Building for production..." -ForegroundColor Yellow

$env:NODE_ENV = "production"

# Build frontend with Vite
npx vite build
if ($LASTEXITCODE -ne 0) { Write-Host "Vite build failed" -ForegroundColor Red; exit 1 }
Write-Host "  OK Frontend built" -ForegroundColor Green

# Bundle server with esbuild
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --minify
if ($LASTEXITCODE -ne 0) { Write-Host "esbuild failed" -ForegroundColor Red; exit 1 }
Write-Host "  OK Server bundled" -ForegroundColor Green

Write-Host "OK Production build complete" -ForegroundColor Green

# ------------------------------------------
# 5. Push database schema
# ------------------------------------------
Write-Host ""
Write-Host ">> Pushing database schema..." -ForegroundColor Yellow
npx drizzle-kit push
if ($LASTEXITCODE -ne 0) { Write-Host "Schema push failed" -ForegroundColor Red; exit 1 }
Write-Host "OK Database schema synced" -ForegroundColor Green

# ------------------------------------------
# 6. Seed default data
# ------------------------------------------
Write-Host ""
Write-Host ">> Seeding default data..." -ForegroundColor Yellow
npx tsx server/simple-seed.ts
if ($LASTEXITCODE -ne 0) { Write-Host "Seeding failed" -ForegroundColor Red; exit 1 }
Write-Host "OK Default data seeded" -ForegroundColor Green

# ------------------------------------------
# 7. Install PM2 if not available
# ------------------------------------------
$pm2Exists = $false
try {
    $null = Get-Command pm2 -ErrorAction Stop
    $pm2Exists = $true
} catch {
    $pm2Exists = $false
}

if (-not $pm2Exists) {
    Write-Host ""
    Write-Host ">> Installing PM2 globally..." -ForegroundColor Yellow
    npm install -g pm2
    if ($LASTEXITCODE -ne 0) { Write-Host "PM2 install failed" -ForegroundColor Red; exit 1 }
}

# ------------------------------------------
# 8. Start/Restart with PM2
# ------------------------------------------
Write-Host ""
Write-Host ">> Starting server with PM2..." -ForegroundColor Yellow

# Stop existing instance if running
try { pm2 delete tradebytes-exchange 2>$null } catch { }

# Set port
if (-not $env:PORT) { $env:PORT = "5050" }

# Start fresh
pm2 start dist/index.js --name tradebytes-exchange --time
if ($LASTEXITCODE -ne 0) { Write-Host "PM2 start failed" -ForegroundColor Red; exit 1 }

# Save PM2 process list
pm2 save

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  OK Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Server:    https://becxus.com"
Write-Host "  API:       https://becxus.com/api"
Write-Host "  WebSocket: wss://becxus.com/ws"
Write-Host "  Port:      $($env:PORT)"
Write-Host ""
Write-Host "  PM2 Commands:" -ForegroundColor Cyan
Write-Host "    pm2 logs tradebytes-exchange     # View logs"
Write-Host "    pm2 restart tradebytes-exchange   # Restart"
Write-Host "    pm2 stop tradebytes-exchange      # Stop"
Write-Host "    pm2 monit                         # Monitor"
Write-Host "==========================================" -ForegroundColor Green
