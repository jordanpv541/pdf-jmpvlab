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

# docker compose de respaldo, por si Ubuntu no lo trae. Versión fija y huella sha256
# copiada de https://github.com/docker/compose/releases/tag/v5.5.1 (checksums.txt).
COMPOSE_VERSION=v5.5.1
COMPOSE_SHA256_aarch64=732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7
COMPOSE_SHA256_x86_64=db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta este script como root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
# En el primer arranque, Ubuntu suele estar instalando parches (unattended-upgrades) y
# tiene apt ocupado. En vez de fallar, se espera hasta 10 minutos a que lo suelte.
apt_get() {
  local try
  for try in $(seq 1 20); do
    if apt-get -o DPkg::Lock::Timeout=600 "$@"; then
      return 0
    fi
    echo "   apt está ocupado o falló (intento $try de 20); vuelvo a intentar en 30 s"
    sleep 30
  done
  return 1
}

echo "==> Paquetes del sistema"
# Las imágenes de Oracle traen iptables-persistent. Que nunca guarde solo las reglas actuales:
# guardaría también las de Docker, y al reiniciar quedarían viejas y repetidas. Nuestras reglas
# las pone el servicio pdf-jmpvlab-firewall en cada arranque.
echo iptables-persistent iptables-persistent/autosave_v4 boolean false | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean false | debconf-set-selections
apt_get update -y
apt_get install -y --no-install-recommends ca-certificates curl git iptables docker.io
# docker compose v2 (el nombre del paquete cambia según la versión de Ubuntu)
for pkg in docker-compose-v2 docker-compose-plugin; do
  if apt-cache show "$pkg" >/dev/null 2>&1; then
    apt_get install -y --no-install-recommends "$pkg" || true
    break
  fi
done
systemctl enable --now docker
if ! docker compose version >/dev/null 2>&1; then
  arch=$(uname -m)
  case "$arch" in
    aarch64) sha=$COMPOSE_SHA256_aarch64 ;;
    x86_64) sha=$COMPOSE_SHA256_x86_64 ;;
    *) echo "No hay docker compose para la arquitectura $arch." >&2; exit 1 ;;
  esac
  echo "   (instalando docker compose $COMPOSE_VERSION desde GitHub)"
  mkdir -p /usr/local/lib/docker/cli-plugins
  tmp=$(mktemp)
  curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$arch" -o "$tmp"
  if ! echo "$sha  $tmp" | sha256sum -c --quiet -; then
    rm -f "$tmp"
    echo "La descarga de docker compose no coincide con su huella sha256. No se instala." >&2
    exit 1
  fi
  install -m 0755 "$tmp" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f "$tmp"
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

# El resto (firewall, tareas semanales, contenedores y revisión de salud) lo hace update.sh.
bash "$APP_DIR/server/update.sh" --sin-codigo

echo
echo "Listo. Revisa en unos minutos: https://$API_DOMAIN/v1/health"
echo "Si no responde: el registro DNS de $API_DOMAIN debe apuntar a la IP pública de este servidor"
echo "y en Oracle Cloud la lista de seguridad debe permitir la entrada por los puertos 80 y 443."
