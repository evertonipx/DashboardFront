param(
  [string]$ApiUrl = "http://192.168.14.6:8080",
  [int]$Port = 3000,
  [string]$HostName = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env.production")) {
  Copy-Item ".env.production.example" ".env.production"
}

$envContent = Get-Content ".env.production" -Raw
$envContent = $envContent -replace "(?m)^IPXDATA_API_URL=.*$", "IPXDATA_API_URL=$ApiUrl"
$envContent = $envContent -replace "(?m)^IPXDATA_FRONTEND_PORT=.*$", "IPXDATA_FRONTEND_PORT=$Port"
$envContent = $envContent -replace "(?m)^IPXDATA_FRONTEND_HOST=.*$", "IPXDATA_FRONTEND_HOST=$HostName"
Set-Content ".env.production" $envContent -Encoding UTF8

npm ci
npm run check:production

Write-Host ""
Write-Host "Producao preparada."
Write-Host "API: $ApiUrl"
Write-Host "Frontend: http://${HostName}:$Port"
Write-Host "Para iniciar: .\scripts\start-production.ps1"
