#!/usr/bin/env bash
# Reglas de firewall del servidor de conversiones. Se ejecuta en cada arranque.
set -euo pipefail

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
#    como el servicio de metadatos de la nube (169.254.169.254).
GOTENBERG_IP=172.31.250.10
iptables -N DOCKER-USER 2>/dev/null || true
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8 0.0.0.0/8 224.0.0.0/4; do
  if ! iptables -C DOCKER-USER -s "$GOTENBERG_IP" -d "$net" -m conntrack --ctstate NEW -j DROP 2>/dev/null; then
    iptables -I DOCKER-USER -s "$GOTENBERG_IP" -d "$net" -m conntrack --ctstate NEW -j DROP
  fi
done

netfilter-persistent save >/dev/null 2>&1 || true
echo "Firewall listo."
