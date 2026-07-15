param(
  [string]$ApiUrl = "",
  [ValidateSet("http", "https")]
  [string]$ApiProtocol = "http",
  [ValidateRange(1, 65535)]
  [int]$ApiPort = 8080,
  [int]$Port = 3000,
  [string]$HostName = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Set-EnvValue {
  param(
    [string]$Content,
    [string]$Name,
    [string]$Value
  )

  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
  $line = "$Name=$Value"

  if ([regex]::IsMatch($Content, $pattern)) {
    return [regex]::Replace($Content, $pattern, $line)
  }

  return $Content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}

if (-not (Test-Path ".env.production")) {
  Copy-Item ".env.production.example" ".env.production"
}

$envContent = Get-Content ".env.production" -Raw
$envContent = Set-EnvValue $envContent "IPXDATA_API_URL" $ApiUrl
$envContent = Set-EnvValue $envContent "IPXDATA_API_PROTOCOL" $ApiProtocol
$envContent = Set-EnvValue $envContent "IPXDATA_API_PORT" $ApiPort
$envContent = Set-EnvValue $envContent "IPXDATA_FRONTEND_PORT" $Port
$envContent = Set-EnvValue $envContent "IPXDATA_FRONTEND_HOST" $HostName
Set-Content ".env.production" $envContent -Encoding UTF8

npm ci
npm run check:production

Write-Host ""
Write-Host "Producao preparada."
if ($ApiUrl) {
  Write-Host "API: $ApiUrl (destino explicito)"
} else {
  Write-Host "API: ${ApiProtocol}://<hostname-do-navegador>:$ApiPort"
}
Write-Host "Frontend: http://${HostName}:$Port"
Write-Host "Para iniciar: .\scripts\start-production.ps1"
