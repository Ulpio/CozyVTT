#!/usr/bin/env bash
# Atualiza o servidor da mesa (C:\Users\Usuario\MesaServer) com o que está no
# main, copia os ícones locais da mesa e reconstrói o stack. Rode de dentro da
# pasta do servidor:
#   bash deploy/mesa/update.sh
set -euo pipefail

# O Git Bash não acha o docker sem isto.
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"

git merge --ff-only main

# Os ícones da mesa ficam fora do git (frontend/public/icons/local); vêm da
# pasta de desenvolvimento e entram na imagem do frontend no build.
ICONS=/c/Users/Usuario/Projects/CozyVTT/frontend/public/icons/local
if [ -d "$ICONS" ]; then
  mkdir -p frontend/public/icons/local
  cp -r "$ICONS/." frontend/public/icons/local/
fi

docker compose up -d --build

echo "Esperando a mesa responder..."
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8088/api/setup/status >/dev/null 2>&1; then
    echo "A mesa está no ar."
    exit 0
  fi
  sleep 2
done
echo "A mesa não respondeu em 120 segundos. Veja: docker compose logs --tail 50 backend" >&2
exit 1
