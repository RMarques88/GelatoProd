# Requires: eas-cli logged in and linked to this project
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\set-eas-secrets.ps1
# Reads .env in repo root (app/.env) and creates/updates EAS project secrets

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
if (!(Test-Path $envFile)) {
  Write-Error ".env não encontrado em $envFile. Crie a partir de .env.example e tente novamente."
}

Write-Host "Lendo variáveis do arquivo: $envFile" -ForegroundColor Cyan

$lines = Get-Content $envFile
$count = 0

foreach ($line in $lines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line.TrimStart().StartsWith('#')) { continue }
  $pair = $line.Split('=',2)
  if ($pair.Count -lt 2) { continue }
  $name = $pair[0].Trim()
  $value = $pair[1].Trim()
  # Remove aspas ao redor, se existirem
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  # Só enviar variáveis EXPO_PUBLIC_* (as usadas no app)
  if ($name -notlike 'EXPO_PUBLIC_*') { continue }

  Write-Host "→ Enviando secret: $name" -ForegroundColor Yellow
  # --force para sobrescrever se já existir; --non-interactive para evitar prompts
  & eas secret:create --scope project --type string --name $name --value "$value" --non-interactive --force | Out-Host
  $count++
}

Write-Host "\nConcluído. $count variáveis enviadas como secrets do projeto." -ForegroundColor Green