#!/usr/bin/env bash
# Reglas de firewall del servidor de conversiones.
#
# Lo ejecuta el servicio pdf-jmpvlab-firewall en cada arranque, después de Docker
# (y otra vez si Docker se reinicia). Se puede ejecutar las veces que quieras: no
# duplica reglas. No se guardan con netfilter-persistent: así no se guardan también
# las reglas que Docker crea solo (quedarían viejas y repetidas al reiniciar).
set -euo pipefail

# IPs fijas de Gotenberg (ver docker-compose.yml).
GOTENBERG_IPS="172.31.250.10 172.31.251.10"
CHAIN=PDFJMPVLAB-GOTENBERG

# 1. Abrir 80 y 443. Las imágenes de Ubuntu en Oracle Cloud traen el firewall cerrado
#    salvo SSH; la regla va antes del REJECT final.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    reject_line=$(iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')
    if [ -n "${reject_line:-}" ]; then
      iptables -I INPUT "$reject_line" -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
    fi
  fi
done

# 2. Gotenberg (Chromium y LibreOffice) solo puede salir a internet público.
#    Así una página o un documento malicioso no puede llegar a servicios internos,
#    como el servicio de metadatos de la nube (169.254.169.254), la API o la red de Oracle.
#    Gotenberg ya bloquea esas direcciones por su cuenta (--chromium-deny-private-ips);
#    esto es una segunda capa.
iptables -N DOCKER-USER 2>/dev/null || true
iptables -N "$CHAIN" 2>/dev/null || iptables -F "$CHAIN"

# El DNS de Docker pregunta al DNS del servidor desde dentro del contenedor. En Oracle
# ese DNS es 169.254.169.254, así que se permite solo el puerto 53 hacia él.
resolv=/etc/resolv.conf
[ -f /run/systemd/resolve/resolv.conf ] && resolv=/run/systemd/resolve/resolv.conf
for dns in $(awk '/^nameserver/ {print $2}' "$resolv" | grep -E '^[0-9.]+$' | grep -v '^127\.' || true); do
  iptables -A "$CHAIN" -d "$dns" -p udp --dport 53 -j RETURN
  iptables -A "$CHAIN" -d "$dns" -p tcp --dport 53 -j RETURN
done
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8 0.0.0.0/8 224.0.0.0/4 240.0.0.0/4; do
  iptables -A "$CHAIN" -d "$net" -j DROP
done
iptables -A "$CHAIN" -j RETURN

for ip in $GOTENBERG_IPS; do
  # Conexiones nuevas que abre Gotenberg hacia otras máquinas (pasan por DOCKER-USER).
  if ! iptables -C DOCKER-USER -s "$ip" -m conntrack --ctstate NEW -j "$CHAIN" 2>/dev/null; then
    iptables -I DOCKER-USER -s "$ip" -m conntrack --ctstate NEW -j "$CHAIN"
  fi
  # Conexiones nuevas hacia el propio servidor (SSH, etc.): Gotenberg no necesita ninguna.
  if ! iptables -C INPUT -s "$ip" -m conntrack --ctstate NEW -j DROP 2>/dev/null; then
    iptables -I INPUT -s "$ip" -m conntrack --ctstate NEW -j DROP
  fi
done

echo "Firewall listo."
