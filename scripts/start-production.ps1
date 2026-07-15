param(
  [int]$Port = 0,
  [string]$HostName = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env.production")) {
  throw "Arquivo .env.production nao encontrado. Copie .env.production.example antes de iniciar."
}

if (-not (Test-Path ".next")) {
  npm run build
}

$envFile = Get-Content ".env.production" -Raw

if (-not $env:IPXDATA_API_URL -and $envFile -match "(?m)^IPXDATA_API_URL=(.+)$") {
  $env:IPXDATA_API_URL = $Matches[1].Trim()
}

if (-not $env:IPXDATA_API_PROTOCOL -and $envFile -match "(?m)^IPXDATA_API_PROTOCOL=(.+)$") {
  $env:IPXDATA_API_PROTOCOL = $Matches[1].Trim()
}

if (-not $env:IPXDATA_API_PORT -and $envFile -match "(?m)^IPXDATA_API_PORT=(\d+)$") {
  $env:IPXDATA_API_PORT = $Matches[1].Trim()
}

if ($Port -le 0) {
  if ($env:IPXDATA_FRONTEND_PORT) {
    $Port = [int]$env:IPXDATA_FRONTEND_PORT
  } elseif ($envFile -match "(?m)^IPXDATA_FRONTEND_PORT=(\d+)$") {
    $Port = [int]$Matches[1]
  } else {
    $Port = 3000
  }
}

if (-not $HostName) {
  if ($env:IPXDATA_FRONTEND_HOST) {
    $HostName = $env:IPXDATA_FRONTEND_HOST
  } elseif ($envFile -match "(?m)^IPXDATA_FRONTEND_HOST=(.+)$") {
    $HostName = $Matches[1].Trim()
  } else {
    $HostName = "0.0.0.0"
  }
}

npx next start -H $HostName -p $Port
