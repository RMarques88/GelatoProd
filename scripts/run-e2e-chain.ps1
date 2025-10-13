<#
Script para rodar a cadeia de E2E com backup interativo.
- Pergunta ao usuário se deve criar backup local (Y/N).
- Se sim, executa node ./scripts/backupFirestore.js e lista arquivos criados.
- Em seguida pede confirmação final para executar os E2E destrutivos.
- Variáveis de ambiente necessárias: ALLOW_E2E_ON_PROD=true (somente se autorizado) e E2E_VISUAL=true para modo visual.

Uso (PowerShell):
  cd app
  ./scripts/run-e2e-chain.ps1
#>

param()

Write-Host "E2E Chain Runner: atenção — este fluxo pode limpar coleções do Firestore." -ForegroundColor Yellow
$backupAnswer = Read-Host "Deseja criar backup local antes de prosseguir? (Y/N)"
if ($backupAnswer -match '^[Yy]') {
    Write-Host "Criando backup local..." -ForegroundColor Cyan
    node ./scripts/backupFirestore.js
    Write-Host "Backup concluído. Arquivos em ./tests/e2e/backups/" -ForegroundColor Green
} else {
    Write-Host "Você optou por NÃO criar backup. Prosseguir sem backup pode gerar perda de dados." -ForegroundColor Red
    $confirmProceed = Read-Host "Tem certeza que deseja continuar sem backup? (type YES to continue)"
    if ($confirmProceed -ne 'YES') {
        Write-Host "Abortando execução. Nenhuma alteração foi realizada." -ForegroundColor Yellow
        exit 0
    }
}

$final = Read-Host "Confirma execução dos E2E destrutivos agora? (type RUN to proceed)"
if ($final -ne 'RUN') {
    Write-Host "Execução cancelada pelo usuário." -ForegroundColor Yellow
    exit 0
}

# Execute with environment: ALLOW_E2E_ON_PROD required for destructive flows
$env:ALLOW_E2E_ON_PROD = 'true'
$env:E2E_VISUAL = 'true'

Write-Host "Iniciando testes E2E destrutivos em modo visual..." -ForegroundColor Green
npm test -- tests/e2e/seedAndValidateCosts.e2e.test.ts -- --runInBand --verbose --detectOpenHandles

Write-Host "Execução finalizada. Revisar backups e logs." -ForegroundColor Green
