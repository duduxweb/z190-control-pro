#!/usr/bin/env bash
# =============================================================================
#  Z190 Control Pro — Script de Instalação (Linux / macOS)
#  Repositório: https://github.com/duduxweb/z190-control-pro
# =============================================================================

set -euo pipefail

# ─── Cores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Helpers ─────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[AVISO]${RESET} $*"; }
error()   { echo -e "${RED}[ERRO]${RESET}  $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━${RESET}"; }
die()     { error "$*"; exit 1; }

NODE_MIN=18
REPO_URL="https://github.com/duduxweb/z190-control-pro.git"
INSTALL_DIR="${1:-z190-control-pro}"

# =============================================================================
#  BANNER
# =============================================================================
echo -e "${BOLD}${CYAN}"
cat << 'EOF'
 ____  ___   ___    ____            _             _   ____
|_  / |_ _| / _ \  / ___|___  _ __ | |_ _ __ ___ | | |  _ \ _ __ ___
 / /   | | | (_) || |   / _ \| '_ \| __| '__/ _ \| | | |_) | '__/ _ \
/___| |___| \__\_\ \____\___/|_| |_|\__|_|  \___/|_| |  __/|_| |  __/
                                                       |_|      \___|
EOF
echo -e "${RESET}"
echo -e "  Script de instalação autônoma — Linux / macOS"
echo -e "  Repositório: ${REPO_URL}"
echo ""

# =============================================================================
#  PASSO 1 — Verificar dependências do sistema
# =============================================================================
step "Verificando dependências do sistema"

# Detectar OS
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="macos" ;;
  *)       die "Sistema operacional não suportado: $OS. Use o script install.bat no Windows." ;;
esac
info "Plataforma detectada: ${BOLD}$PLATFORM${RESET}"

# Git
if ! command -v git &>/dev/null; then
  die "Git não encontrado. Instale em https://git-scm.com e execute o script novamente."
fi
GIT_VERSION=$(git --version | awk '{print $3}')
success "Git encontrado: $GIT_VERSION"

# Node.js
if ! command -v node &>/dev/null; then
  warn "Node.js não encontrado."
  echo ""
  echo -e "  Instale o Node.js ${NODE_MIN}+ de uma das formas abaixo e execute o script novamente:"
  echo ""
  echo -e "  ${BOLD}Opção A — Site oficial:${RESET}"
  echo -e "    https://nodejs.org/en/download"
  echo ""
  echo -e "  ${BOLD}Opção B — nvm (recomendado):${RESET}"
  echo -e "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo -e "    source ~/.bashrc   # ou ~/.zshrc"
  echo -e "    nvm install 20"
  echo ""
  die "Node.js é obrigatório."
fi

NODE_VERSION_FULL=$(node --version)
NODE_VERSION_MAJOR=$(echo "$NODE_VERSION_FULL" | tr -d 'v' | cut -d. -f1)
if [[ "$NODE_VERSION_MAJOR" -lt "$NODE_MIN" ]]; then
  die "Node.js $NODE_VERSION_FULL encontrado, mas é necessário v${NODE_MIN}+. Atualize em https://nodejs.org"
fi
success "Node.js encontrado: $NODE_VERSION_FULL"

# npm
if ! command -v npm &>/dev/null; then
  die "npm não encontrado. Reinstale o Node.js em https://nodejs.org"
fi
NPM_VERSION=$(npm --version)
success "npm encontrado: $NPM_VERSION"

# =============================================================================
#  PASSO 2 — Clonar repositório
# =============================================================================
step "Clonando repositório"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  warn "Diretório '$INSTALL_DIR' já é um repositório Git."
  info "Atualizando para a versão mais recente..."
  cd "$INSTALL_DIR"
  git pull --ff-only || warn "Não foi possível atualizar. Continuando com a versão local."
else
  if [[ -d "$INSTALL_DIR" ]]; then
    die "O diretório '$INSTALL_DIR' já existe e não é um repositório Git. Remova-o ou escolha outro nome:\n  bash install.sh <nome-do-diretorio>"
  fi
  info "Clonando em: ${BOLD}$INSTALL_DIR${RESET}"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
success "Repositório pronto."

# =============================================================================
#  PASSO 3 — Instalar dependências do backend
# =============================================================================
step "Instalando dependências do backend"

npm install
success "Dependências do backend instaladas."

# =============================================================================
#  PASSO 4 — Playwright Chromium
# =============================================================================
step "Instalando Playwright Chromium"

info "Baixando o navegador Chromium gerenciado pelo Playwright..."
npx playwright install chromium

# Instalar dependências do SO (Linux)
if [[ "$PLATFORM" == "linux" ]]; then
  info "Instalando dependências do sistema para o Playwright (pode pedir senha sudo)..."
  if command -v sudo &>/dev/null; then
    npx playwright install-deps chromium || warn "Não foi possível instalar dependências do sistema automaticamente. Se o dashboard não abrir a câmera, execute manualmente: npx playwright install-deps chromium"
  else
    warn "sudo não disponível. Se necessário, execute como root: npx playwright install-deps chromium"
  fi
fi
success "Playwright Chromium instalado."

# =============================================================================
#  PASSO 5 — Dependências do frontend React (camera-dashboard-control)
# =============================================================================
step "Instalando dependências do frontend React"

if [[ -d "camera-dashboard-control" ]]; then
  (cd camera-dashboard-control && npm install)
  success "Dependências do frontend instaladas."
else
  warn "Diretório 'camera-dashboard-control' não encontrado. Pulando etapa do frontend."
fi

# =============================================================================
#  PASSO 6 — Configurar config.json
# =============================================================================
step "Configurando config.json"

if [[ -f "config.json" ]]; then
  warn "config.json já existe — mantendo configuração atual."
elif [[ -f "config.example.json" ]]; then
  cp config.example.json config.json
  success "config.json criado a partir de config.example.json."
  echo ""
  echo -e "  ${YELLOW}⚠  Edite o arquivo ${BOLD}config.json${RESET}${YELLOW} com os dados das suas câmeras:${RESET}"
  echo -e "     IP, usuário, senha e porta de cada câmera Sony PXW-Z190."
  echo ""
else
  warn "config.example.json não encontrado. Crie manualmente o arquivo config.json."
fi

# =============================================================================
#  PASSO 7 — Criar diretório de logs
# =============================================================================
step "Preparando diretório de logs"

mkdir -p logs
success "Diretório logs/ pronto."

# =============================================================================
#  RESUMO FINAL
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✔  Instalação concluída com sucesso!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Próximos passos:${RESET}"
echo ""
echo -e "  1. ${YELLOW}Edite o config.json${RESET} com os dados das câmeras (se ainda não fez):"
echo -e "     ${CYAN}nano config.json${RESET}"
echo ""
echo -e "  2. ${YELLOW}Inicie o servidor:${RESET}"
echo -e "     ${CYAN}cd $INSTALL_DIR && npm start${RESET}"
echo ""
echo -e "  3. ${YELLOW}Acesse no navegador:${RESET}"
echo -e "     ${CYAN}http://localhost:3000${RESET}"
echo ""
echo -e "  ${BOLD}Documentação completa:${RESET} README.md"
echo -e "  ${BOLD}Histórico de mudanças:${RESET} CHANGELOG.md"
echo ""
