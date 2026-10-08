#!/usr/bin/env bash
# Actualiza el servidor de conversiones. Uso: sudo bash update.sh
#
# 1. Trae la última versión del código (se salta con --sin-codigo).
# 2. Vuelve a instalar el firewall, su servicio de arranque y la tarea semanal.
# 3. Baja las imágenes nuevas de Caddy y Gotenberg y reconstruye la API (con la
#    imagen de Python al día), reinicia y espera a que todo responda.
#
# La tarea semanal (/etc/cron.weekly/pdf-jmpvlab-update) lo ejecuta con --sin-codigo
# y guarda el resultado en /var/log/pdf-jmpvlab-update.log.
# Se puede ejecutar las veces que quieras.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
SERVER_DIR=$(pwd)

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta este script como root (sudo)." >&2
  exit 1
fi

echo "==> $(date '+%Y-%m-%d %H:%M') Actualizando el servidor de conversiones"

if [ "${1:-}" != "--sin-codigo" ]; then
  echo "==> Código"
  git -C .. pull --ff-only
  # El script pudo cambiar con el pull: se sigue con la versión nueva.
  exec bash "$SERVER_DIR/update.sh" --sin-codigo
fi

echo "==> Firewall (se aplica en cada arranque, después de Docker)"
install -m 0755 firewall.sh /usr/local/sbin/pdf-jmpvlab-firewall
cat > /etc/systemd/system/pdf-jmpvlab-firewall.service <<'UNIT'
[Unit]
Description=Reglas de firewall del servidor de PDF jmpvlab
After=docker.service network-online.target
Wants=network-online.target
# Si Docker se reinicia, las reglas se vuelven a aplicar.
PartOf=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pdf-jmpvlab-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target docker.service
UNIT
systemctl daemon-reload
systemctl reenable pdf-jmpvlab-firewall.service

echo "==> Tarea semanal: parches de Caddy, Gotenberg y la imagen de la API"
cat > /etc/cron.weekly/pdf-jmpvlab-update <<CRON
#!/bin/sh
exec bash $SERVER_DIR/update.sh --sin-codigo >> /var/log/pdf-jmpvlab-update.log 2>&1
CRON
chmod 0755 /etc/cron.weekly/pdf-jmpvlab-update
cat > /etc/logrotate.d/pdf-jmpvlab <<'ROTATE'
/var/log/pdf-jmpvlab-update.log {
  monthly
  rotate 6
  compress
  missingok
  notifempty
}
ROTATE

echo "==> Contenedores"
docker compose pull --quiet caddy gotenberg
docker compose build --pull --quiet api
# Si algo no arranca, no se corta aquí: abajo se muestra qué pasó.
docker compose up -d --remove-orphans || true
systemctl restart pdf-jmpvlab-firewall.service

echo "==> Revisión de salud"
healthy() {
  local id status
  id=$(docker compose ps -q "$1")
  [ -n "$id" ] || return 1
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
  [ "$status" = healthy ] || [ "$status" = running ]
}
ok=no
for _ in $(seq 1 60); do
  if healthy gotenberg && healthy api && healthy caddy; then
    ok=yes
    break
  fi
  sleep 5
done
docker image prune -f >/dev/null || true

if [ "$ok" = yes ]; then
  echo "==> $(date '+%Y-%m-%d %H:%M') Actualizado: Caddy, la API y Gotenberg responden."
else
  echo "==> $(date '+%Y-%m-%d %H:%M') ERROR: algo no arrancó bien. Estado y últimos mensajes:" >&2
  docker compose ps >&2
  docker compose logs --tail 30 api gotenberg >&2
  exit 1
fi
