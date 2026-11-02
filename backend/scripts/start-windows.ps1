# SafeChat Backend - Windows PowerShell startup helper
# Run from the project root:  .\scripts\start-windows.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "=== SafeChat Backend (Windows) ===" -ForegroundColor Cyan

# 1. Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "Python not found. Install Python 3.12+ from https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "Make sure to check 'Add Python to PATH' during install." -ForegroundColor Yellow
    exit 1
}
$ver = python --version
Write-Host "Found $ver" -ForegroundColor Green

# 2. Create venv if missing
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# 3. Activate
Write-Host "Activating .venv ..." -ForegroundColor Yellow
& ".\.venv\Scripts\Activate.ps1"

# 4. Install deps
Write-Host "Installing dependencies (this may take a minute)..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# 5. .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example - edit SECRET_KEY if you want" -ForegroundColor Green
}

# 6. Check MongoDB connection string
$envContent = Get-Content ".env" -Raw
if ($envContent -match "MONGODB_URI=mongodb://localhost:27017") {
    Write-Host ""
    Write-Host "Using local MongoDB (mongodb://localhost:27017)" -ForegroundColor Yellow
    Write-Host "If MongoDB is not installed, either:" -ForegroundColor Yellow
    Write-Host "  A) Install MongoDB Community: https://www.mongodb.com/try/download/community" -ForegroundColor Cyan
    Write-Host "  B) Use free MongoDB Atlas (recommended):" -ForegroundColor Cyan
    Write-Host "     1. Go to https://www.mongodb.com/cloud/atlas → free M0 cluster" -ForegroundColor Cyan
    Write-Host "     2. Create DB user + allow IP 0.0.0.0/0 (or your IP)" -ForegroundColor Cyan
    Write-Host "     3. Copy connection string into .env as MONGODB_URI=..." -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Starting SafeChat backend on http://localhost:8000" -ForegroundColor Green
Write-Host "Swagger docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
