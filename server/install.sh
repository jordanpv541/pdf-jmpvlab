#!/usr/bin/env bash
# Instala el servidor de conversiones en Ubuntu 22.04 o 24.04 (Oracle Cloud, Hetzner, etc.).
#
# Uso (como root):
#   API_DOMAIN=api-pdf.jmpvlab.com bash install.sh
#
# Se puede volver a ejecutar sin problema: actualiza y reinicia.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jordanpv541/pdf-jmpvlab.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/pdf-jmpvlab}"
API_DOMAIN="${API_DOMAIN:-api-pdf.jmpvlab.com}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://pdf.jmpvlab.com}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta este script como root (sudo)." >&2
  exit 1
fi

echo "==> Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git iptables-persistent docker.io
# docker compose v2 (el nombre del paquete cambia según la versión de Ubuntu)
apt-get install -y --no-install-recommends docker-compose-v2 2>/dev/null \
  || apt-get install -y --no-install-recommends docker-compose-plugin 2>/dev/null \
  || true
systemctl enable --now docker
if ! docker compose version >/dev/null 2>&1; then
  echo "   (instalando docker compose desde GitHub)"
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
docker compose version

echo "==> Memoria de intercambio (2 GB) por si una conversión pide mucha memoria"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Código"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/server"

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^API_DOMAIN=.*|API_DOMAIN=$API_DOMAIN|" .env
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ALLOWED_ORIGINS|" .env
fi

echo "==> Firewall"
install -m 0755 firewall.sh /usr/local/sbin/pdf-jmpvlab-firewall
cat > /etc/systemd/system/pdf-jmpvlab-firewall.service <<'UNIT'
[Unit]
Description=Reglas de firewall del servidor de PDF jmpvlab
After=docker.service network-online.target
Wants=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pdf-jmpvlab-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable pdf-jmpvlab-firewall.service

echo "==> Contenedores"
docker compose pull caddy gotenberg
docker compose up -d --build --remove-orphans
systemctl restart pdf-jmpvlab-firewall.service

echo "==> Actualizaciones semanales de Caddy y Gotenberg (parches de seguridad)"
cat > /etc/cron.weekly/pdf-jmpvlab-update <<CRON
#!/bin/sh
cd $APP_DIR/server && docker compose pull caddy gotenberg && docker compose up -d && docker image prune -f
CRON
chmod 0755 /etc/cron.weekly/pdf-jmpvlab-update

echo
echo "Listo. Revisa en unos minutos: https://$API_DOMAIN/v1/health"
echo "Si no responde: el registro DNS de $API_DOMAIN debe apuntar a la IP pública de este servidor"
echo "y en Oracle Cloud la lista de seguridad debe permitir la entrada por los puertos 80 y 443."
