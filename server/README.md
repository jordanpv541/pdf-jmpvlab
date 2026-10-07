# Servidor de conversiones

Este servidor hace las 8 conversiones que el navegador no puede hacer solo: Word, Excel, PowerPoint y HTML a PDF, y PDF a Word, Excel, PowerPoint y PDF/A. Todo lo demás del sitio sigue funcionando sin él.

Piezas (todas corren en Docker):

- **Caddy** recibe las visitas en `api-pdf.jmpvlab.com` y saca solo el certificado HTTPS de Let's Encrypt (y lo renueva).
- **api/** es nuestra API (Python, FastAPI). Revisa el archivo, aplica límites y hace PDF a Word, Excel y PowerPoint con PyMuPDF, pdf2docx, openpyxl y python-pptx.
- **Gotenberg** trae LibreOffice (Office a PDF, PDF/A) y Chromium (HTML a PDF). No se publica a internet: solo la API habla con él.

Los archivos se guardan en una carpeta temporal en memoria y se borran al responder. No hay base de datos ni registro de visitas.

## Lo que necesitas antes

- El código publicado en GitHub como `jordanpv541/pdf-jmpvlab` (público). El servidor se instala bajando el código de ahí.
- Acceso a la zona DNS de `jmpvlab.com` (en SiteGround: Site Tools → Dominio → Zona DNS).

Si el repositorio o el dominio cambian, cambia también `cloud-init.sh` y la línea `REPO_URL` de `install.sh`.

## Montarlo en Oracle Cloud (gratis)

### 1. Crea la cuenta

1. Entra a oracle.com/cloud/free y crea una cuenta *Free Tier*.
2. Te pedirán una tarjeta para verificar que eres una persona. Mientras uses solo recursos *Always Free* no se cobra nada.
3. Elige bien la **región de origen**: no se puede cambiar después y los recursos gratis solo existen ahí. Escoge la más cercana a tus visitantes (por ejemplo Querétaro, Santiago, São Paulo o Madrid).

### 2. Crea la máquina

En el menú: Compute → Instances → **Create instance**.

1. **Nombre:** `pdf-jmpvlab`.
2. **Image:** Canonical Ubuntu 24.04.
3. **Shape:** Ampere → `VM.Standard.A1.Flex` con **2 OCPU y 12 GB** de memoria. Es lo máximo gratis; si pones más, se cobra.
4. **Networking:** crea una red nueva (VCN) con subred pública y deja marcado *Assign a public IPv4 address*.
5. **SSH keys:** descarga la llave privada y guárdala. La necesitas para entrar si algo falla.
6. Abre las opciones avanzadas → **Management** → *Paste cloud-init script* y pega todo el contenido de `cloud-init.sh`.
7. Pulsa **Create**.

Si sale *Out of capacity*, no es un error tuyo: Oracle no tiene máquinas Ampere libres en ese momento. Prueba otro *availability domain* o vuelve a intentar más tarde.

Cuando la instancia esté en verde (*Running*), copia su **Public IP address**.

### 3. Abre los puertos 80 y 443

Oracle bloquea todo por defecto. Ve a Networking → Virtual cloud networks → tu VCN → la subred pública → su *Security list* → **Add ingress rules**:

- Source CIDR `0.0.0.0/0`, protocolo TCP, puerto de destino `80`.
- Otra igual con el puerto `443`.

El script ya abre esos puertos dentro de Ubuntu. Hacen falta las dos cosas.

### 4. Apunta el dominio

En la zona DNS de `jmpvlab.com` crea un registro **A**:

- Nombre: `api-pdf`
- Apunta a: la IP pública de la instancia

### 5. Comprueba

La instalación tarda unos 10 minutos desde que se crea la máquina, y el DNS puede tardar un rato más. Luego abre:

`https://api-pdf.jmpvlab.com/v1/health`

Debe responder algo como `{"ok":true,...}`. Ya está: las 8 herramientas del sitio empiezan a funcionar.

## Si algo no funciona

Entra por SSH con la llave que descargaste:

```
ssh -i tu-llave.key ubuntu@IP-DE-LA-INSTANCIA
```

Y revisa, en este orden:

1. Cómo fue la instalación: `sudo tail -n 50 /var/log/pdf-jmpvlab-install.log`
2. Si los tres contenedores están corriendo: `cd /opt/pdf-jmpvlab/server && sudo docker compose ps`
3. Qué dicen: `sudo docker compose logs --tail 50 caddy` (o `api`, o `gotenberg`)

Lo más común:

- **Caddy no consigue el certificado:** el registro DNS todavía no apunta a la IP correcta, o faltan las reglas de los puertos 80 y 443 del paso 3. Caddy lo vuelve a intentar solo.
- **El sitio dice que no puede conectar:** abre `/v1/health` en el navegador. Si responde, revisa que el sitio se generó con la dirección correcta de la API (`apiUrl` en `tools/site.mjs`).

## Oracle puede apagar la máquina si casi no se usa

Oracle recupera las instancias gratis que pasan 7 días seguidos con menos del 20 % de uso de CPU, de red y de memoria a la vez. Con pocas visitas, este servidor puede caer en esa regla.

Si pasa, no se pierde nada: el servidor no guarda datos. Se arregla repitiendo los pasos 2 y 4 (máquina nueva y nueva IP en el DNS). Tarda unos 15 minutos.

Mientras tanto, el sitio sigue funcionando y las 8 herramientas del servidor muestran un aviso de que no pueden conectar.

## Mantenimiento

- **Parches de Caddy y Gotenberg:** se bajan solos cada semana.
- **Actualizar el código** después de cambiarlo en GitHub: `sudo bash /opt/pdf-jmpvlab/server/update.sh`
- **Cambiar límites** (tamaño máximo, páginas, conversiones por persona): edita `/opt/pdf-jmpvlab/server/.env` y ejecuta `sudo docker compose up -d` en esa carpeta. Si cambias `MAX_UPLOAD_MB`, cambia también `MAX_UPLOAD_MB` en `public/assets/js/remote.js` y `max_size` en `Caddyfile`.

Límites que vienen puestos:

- Archivos de hasta 50 MB y PDF de hasta 300 páginas.
- 2 conversiones a la vez; hasta 8 personas esperando turno.
- 30 conversiones cada 10 minutos por persona (por IP).
- Cada conversión se corta a los 3 minutos.

## Seguridad

- Solo las páginas de `ALLOWED_ORIGINS` pueden usar la API desde el navegador.
- Se revisa que cada archivo sea de verdad del tipo que dice ser antes de convertirlo.
- HTML a PDF solo abre páginas públicas. Para eso hay tres capas: la API rechaza direcciones internas, Chromium tiene una lista de direcciones prohibidas y el firewall (`firewall.sh`) no deja que Gotenberg se conecte a ninguna red interna, ni siquiera a la de Oracle.
- Gotenberg no tiene puertos abiertos hacia internet: solo la API puede hablarle.
- La API corre como un usuario sin permisos y con el disco en solo lectura.

## Probar en tu computadora

No hace falta Docker. Las pruebas de la API solo necesitan Python 3.12:

```
cd server
pip install -r api/requirements.txt pytest
python3 -m pytest tests -q
```

En esas pruebas Gotenberg se reemplaza por una función falsa.

Para probar el sitio completo con la API local hacen falta LibreOffice y Playwright: `mock_gotenberg.py` imita a Gotenberg con ellos.

```
# terminal 1: Gotenberg de mentira
cd server/tests && python3 -m uvicorn mock_gotenberg:app --port 3999
# terminal 2: la API
cd server/api && GOTENBERG_URL=http://127.0.0.1:3999 ALLOWED_ORIGINS=http://127.0.0.1:8765 python3 -m uvicorn app:app --port 8800
# terminal 3: el sitio, apuntando a esa API
PDF_API_URL=http://127.0.0.1:8800 node tools/build.mjs
PDF_API_URL=http://127.0.0.1:8800 python3 tools/serve.py
```

Antes de subir el sitio, vuelve a generarlo sin `PDF_API_URL` para que apunte a la API de verdad.

## Licencia

El servidor usa PyMuPDF, que tiene licencia AGPL 3.0. Por eso todo el proyecto es AGPL: si cambias el código y lo pones en internet, tienes que publicar tus cambios. `SOURCE_URL` en `.env` dice dónde está el código, y la API lo muestra en `/v1/health`.
