#!/bin/bash
# Pega esto en Oracle Cloud al crear la instancia:
#   Crear instancia → Mostrar opciones avanzadas → Gestión → Pegar script de cloud-init
# El servidor se instala solo al encender (tarda unos 10 minutos).
export API_DOMAIN=api-pdf.jmpvlab.com
export ALLOWED_ORIGINS=https://pdf.jmpvlab.com
curl -fsSL https://raw.githubusercontent.com/jordanpv541/pdf-jmpvlab/main/server/install.sh -o /root/install.sh
bash /root/install.sh > /var/log/pdf-jmpvlab-install.log 2>&1
