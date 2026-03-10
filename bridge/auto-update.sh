#!/bin/bash
# ─── Z190 Bridge Auto-Update Script ─────────────────
# Adicione ao crontab para atualização automática:
#   crontab -e
#   */5 * * * * /path/to/bridge/auto-update.sh >> /path/to/bridge/update.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

echo "[$(date)] Verificando atualizações..."

# Fetch latest changes
git fetch origin main 2>/dev/null

# Check if there are updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] Atualização encontrada! Atualizando..."
    git pull origin main
    
    # Reinstalar dependências do bridge se package.json mudou
    if git diff --name-only "$LOCAL" "$REMOTE" | grep -q "bridge/package.json"; then
        echo "[$(date)] package.json alterado, reinstalando dependências..."
        cd bridge && npm install && cd ..
    fi
    
    echo "[$(date)] Atualização concluída. Reinicie o bridge manualmente ou configure o PM2."
else
    echo "[$(date)] Nenhuma atualização disponível."
fi
