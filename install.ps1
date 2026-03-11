# =============================================================================
#  Z190 Control Pro — Script de Instalação (Windows)
#  Repositório: https://github.com/duduxweb/z190-control-pro
#
#  Como executar:
#    1. Abra o PowerShell como Administrador
#    2. Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#    3. .\install.ps1
# =============================================================================

param(
    [string]$InstallDir = "z190-control-pro"
)

$ErrorActionPreference = "Stop"
$NODE_MIN = 18
$REPO_URL = "https://github.com/duduxweb/z190-control-pro.git"

# ─── Helpers ─────────────────────────────────────────────────────────────────
function Write-Step   { Write-Host "`n━━━  $args  ━━━" -ForegroundColor Cyan }
function Write-Info   { Write-Host "[INFO]  $args"    -ForegroundColor Cyan }
function Write-Ok     { Write-Host "[OK]    $args"    -ForegroundColor Green }
function Write-Warn   { Write-Host "[AVISO] $args"    -ForegroundColor Yellow }
function Write-Err    { Write-Host "[ERRO]  $args"    -ForegroundColor Red }
function Abort($msg)  { Write-Err $msg; exit 1 }

# =============================================================================
#  BANNER
# =============================================================================
Write-Host ""
Write-Host " ____  ___   ___    ____            _             _   ____" -ForegroundColor Cyan
Write-Host "|_  / |_ _| / _ \  / ___|___  _ __ | |_ _ __ ___ | | |  _ \ _ __ ___" -ForegroundColor Cyan
Write-Host " / /   | | | (_) || |   / _ \| '_ \| __| '__/ _ \| | | |_) | '__/ _ \" -ForegroundColor Cyan
Write-Host "/___| |___| \__\_\ \____\___/|_| |_|\__|_|  \___/|_| |  __/|_| |  __/" -ForegroundColor Cyan
Write-Host "                                                       |_|      \___|" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Script de instalacao autonoma — Windows (PowerShell)" -ForegroundColor White
Write-Host "  Repositorio: $REPO_URL" -ForegroundColor White
Write-Host ""

# =============================================================================
#  PASSO 1 — Verificar dependências
# =============================================================================
Write-Step "Verificando dependencias do sistema"

# Git
try {
    $gitVersion = (git --version 2>&1)
    Write-Ok "Git encontrado: $gitVersion"
} catch {
    Write-Err "Git nao encontrado."
    Write-Host ""
    Write-Host "  Instale o Git em https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  Reinicie o PowerShell apos a instalacao e execute o script novamente." -ForegroundColor Yellow
    Abort "Git e obrigatorio."
}

# Node.js
try {
    $nodeVersionFull = (node --version 2>&1)
} catch {
    Write-Warn "Node.js nao encontrado."
    Write-Host ""
    Write-Host "  Instale o Node.js ${NODE_MIN}+ de uma das formas abaixo e execute o script novamente:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Opcao A — Site oficial:" -ForegroundColor White
    Write-Host "    https://nodejs.org/en/download" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Opcao B — winget (terminal):" -ForegroundColor White
    Write-Host "    winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
    Write-Host ""
    Abort "Node.js e obrigatorio."
}

$nodeVersionMajor = [int]($nodeVersionFull -replace "v(\d+)\..*", '$1')
if ($nodeVersionMajor -lt $NODE_MIN) {
    Abort "Node.js $nodeVersionFull encontrado, mas e necessario v${NODE_MIN}+. Atualize em https://nodejs.org"
}
Write-Ok "Node.js encontrado: $nodeVersionFull"

# npm
try {
    $npmVersion = (npm --version 2>&1)
    Write-Ok "npm encontrado: $npmVersion"
} catch {
    Abort "npm nao encontrado. Reinstale o Node.js em https://nodejs.org"
}

# =============================================================================
#  PASSO 2 — Clonar repositório
# =============================================================================
Write-Step "Clonando repositorio"

if (Test-Path "$InstallDir\.git") {
    Write-Warn "Diretorio '$InstallDir' ja e um repositorio Git."
    Write-Info "Atualizando para a versao mais recente..."
    Set-Location $InstallDir
    try {
        git pull --ff-only
    } catch {
        Write-Warn "Nao foi possivel atualizar. Continuando com a versao local."
    }
} elseif (Test-Path $InstallDir) {
    Abort "O diretorio '$InstallDir' ja existe e nao e um repositorio Git. Remova-o ou passe outro nome:`n  .\install.ps1 -InstallDir <nome>"
} else {
    Write-Info "Clonando em: $InstallDir"
    git clone $REPO_URL $InstallDir
    Set-Location $InstallDir
}
Write-Ok "Repositorio pronto."

# =============================================================================
#  PASSO 3 — Dependências do backend
# =============================================================================
Write-Step "Instalando dependencias do backend"

npm install
Write-Ok "Dependencias do backend instaladas."

# =============================================================================
#  PASSO 4 — Playwright Chromium
# =============================================================================
Write-Step "Instalando Playwright Chromium"

Write-Info "Baixando o navegador Chromium gerenciado pelo Playwright..."
npx playwright install chromium
Write-Ok "Playwright Chromium instalado."

# =============================================================================
#  PASSO 5 — Frontend React
# =============================================================================
Write-Step "Instalando dependencias do frontend React"

if (Test-Path "camera-dashboard-control") {
    Push-Location "camera-dashboard-control"
    npm install
    Pop-Location
    Write-Ok "Dependencias do frontend instaladas."
} else {
    Write-Warn "Diretorio 'camera-dashboard-control' nao encontrado. Pulando etapa do frontend."
}

# =============================================================================
#  PASSO 6 — config.json
# =============================================================================
Write-Step "Configurando config.json"

if (Test-Path "config.json") {
    Write-Warn "config.json ja existe — mantendo configuracao atual."
} elseif (Test-Path "config.example.json") {
    Copy-Item "config.example.json" "config.json"
    Write-Ok "config.json criado a partir de config.example.json."
    Write-Host ""
    Write-Host "  ⚠  Edite o arquivo config.json com os dados das suas cameras:" -ForegroundColor Yellow
    Write-Host "     IP, usuario, senha e porta de cada camera Sony PXW-Z190." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Warn "config.example.json nao encontrado. Crie manualmente o arquivo config.json."
}

# =============================================================================
#  PASSO 7 — Diretório de logs
# =============================================================================
Write-Step "Preparando diretorio de logs"

if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}
Write-Ok "Diretorio logs\ pronto."

# =============================================================================
#  RESUMO FINAL
# =============================================================================
Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✔  Instalacao concluida com sucesso!"              -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Proximos passos:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Edite o config.json com os dados das cameras (se ainda nao fez):" -ForegroundColor Yellow
Write-Host "     notepad config.json" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Inicie o servidor:" -ForegroundColor Yellow
Write-Host "     cd $InstallDir ; npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Acesse no navegador:" -ForegroundColor Yellow
Write-Host "     http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Documentacao completa: README.md" -ForegroundColor White
Write-Host "  Historico de mudancas: CHANGELOG.md" -ForegroundColor White
Write-Host ""
