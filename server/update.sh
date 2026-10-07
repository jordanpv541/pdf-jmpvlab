#!/usr/bin/env bash
# Trae la última versión del código y reinicia el servidor. Uso: sudo bash update.sh
set -euo pipefail
cd "$(dirname "$0")"
git -C .. pull --ff-only
docker compose pull caddy gotenberg
docker compose up -d --build --remove-orphans
docker image prune -f
echo "Actualizado."
