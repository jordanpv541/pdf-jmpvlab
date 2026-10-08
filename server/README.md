# Servidor de conversiones

Este servidor hace las 8 conversiones que el navegador no puede hacer solo: Word, Excel, PowerPoint y HTML a PDF, y PDF a Word, Excel, PowerPoint y PDF/A. Todo lo demás del sitio sigue funcionando sin él.

Piezas (todas corren en Docker):

- **Caddy** recibe las visitas en `api-pdf.jmpvlab.com` y saca solo el certificado HTTPS de Let's Encrypt (y lo renueva).
- **api/** es nuestra API (Python, FastAPI). Revisa el archivo, aplica límites y hace PDF a Word, Excel y PowerPoint con PyMuPDF, pdf2docx, openpyxl y python-pptx.
- **Gotenberg** trae LibreOffice (Office a PDF, PDF/A) y Chromium (HTML a PDF). No se publica a internet: solo la API habla con él. Usa una versión fija (`gotenberg/gotenberg:8.37.0` en `docker-compose.yml`).

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
3. **Shape:** Ampere → `VM.Standard.A1.Flex` con **2 OCPU y 12 GB** de memoria. Es lo máximo gratis (Oracle regala 2 OCPU y 12 GB en total por cuenta); si pones más, se cobra.
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
2. Si los tres contenedores están corriendo y sanos (*healthy*): `cd /opt/pdf-jmpvlab/server && sudo docker compose ps`
3. Qué dicen: `sudo docker compose logs --tail 50 caddy` (o `api`, o `gotenberg`)
4. Cómo fue la última actualización semanal: `sudo tail -n 30 /var/log/pdf-jmpvlab-update.log`

Lo más común:

- **Caddy no consigue el certificado:** el registro DNS todavía no apunta a la IP correcta, o faltan las reglas de los puertos 80 y 443 del paso 3. Caddy lo vuelve a intentar solo.
- **El sitio dice que no puede conectar:** abre `/v1/health` en el navegador. Si responde, revisa que el sitio se generó con la dirección correcta de la API (`apiUrl` en `tools/site.mjs`).
- **Un contenedor dice *unhealthy* o no arranca:** ejecuta `sudo bash /opt/pdf-jmpvlab/server/update.sh --sin-codigo`. Reinicia todo y, si algo sigue mal, muestra los últimos mensajes de la API y de Gotenberg.

## Oracle puede apagar la máquina si casi no se usa

Oracle recupera las instancias gratis que pasan 7 días seguidos con menos del 20 % de uso de CPU, de red y de memoria a la vez. Con pocas visitas, este servidor puede caer en esa regla.

Si pasa, no se pierde nada: el servidor no guarda datos. Se arregla repitiendo los pasos 2 y 4 (máquina nueva y nueva IP en el DNS). Tarda unos 15 minutos.

Mientras tanto, el sitio sigue funcionando y las 8 herramientas del servidor muestran un aviso de que no pueden conectar.

## Mantenimiento

- **Actualización semanal (sola):** cada semana el servidor baja la última imagen de Caddy, vuelve a construir la API con la imagen de Python al día (parches de seguridad), reinicia todo y revisa que responda. El resultado queda en `/var/log/pdf-jmpvlab-update.log`.
- **Actualizar el código** después de cambiarlo en GitHub: `sudo bash /opt/pdf-jmpvlab/server/update.sh`. Además de traer el código, vuelve a instalar el firewall, su servicio de arranque y la tarea semanal, así que cualquier cambio en esos archivos también se aplica.
- **Actualizar Gotenberg:** su versión está fija en `docker-compose.yml` (`gotenberg/gotenberg:8.37.0`), porque las opciones de seguridad que usamos dependen de la versión. Para subirla, mira la última en github.com/gotenberg/gotenberg/releases, cambia el número en `docker-compose.yml` en GitHub, espera a que las pruebas de GitHub (pestaña *Actions*) salgan en verde y ejecuta `update.sh` en el servidor.
- **Cambiar límites:** edita `/opt/pdf-jmpvlab/server/.env` y ejecuta `sudo docker compose up -d` en esa carpeta. Cada límite está explicado en `.env.example`. Si cambias `MAX_UPLOAD_MB`, cambia también `MAX_UPLOAD_MB` en `public/assets/js/remote.js` y `max_size` en `Caddyfile`.

Límites que vienen puestos:

- Archivos de hasta 50 MB. La subida tiene que terminar en 5 minutos (`UPLOAD_TIMEOUT`).
- PDF de hasta 300 páginas. PDF a Word, hasta 150 (`MAX_WORD_PAGES`): es la conversión más lenta y con más páginas suele pasarse del tiempo. PDF a PowerPoint, hasta 150.
- 2 conversiones a la vez; hasta 8 más esperando turno o subiendo su archivo.
- Cada persona (IP) puede tener 2 conversiones a la vez (`MAX_PER_IP`) y hacer 30 cada 10 minutos. Ojo: en una universidad o en datos móviles mucha gente puede salir con la misma IP; si se quejan, sube `MAX_PER_IP`.
- Cada conversión se corta a los 3 minutos (Gotenberg a los 170 segundos, un poco antes, para que la API pueda avisar bien).
- El archivo convertido puede pesar hasta 200 MB (`MAX_OUTPUT_MB`).
- PDF a Word, Excel y PowerPoint corren en un proceso aparte con 1,5 GB de memoria como máximo (`CHILD_MEMORY_MB`). Si un PDF raro pide más, falla esa conversión y no el servidor.

Estos límites se revisan **antes** de recibir el archivo: si alguien manda un archivo muy grande o ya tiene 2 conversiones en curso, la API responde al tiro sin guardar nada.

## Seguridad

- **CORS:** solo las páginas de `ALLOWED_ORIGINS` pueden *leer* las respuestas de la API desde el navegador. Ojo: CORS no impide que otra página o un programa *envíe* peticiones a la API. Por eso existen los límites por IP (conversiones a la vez y por cada 10 minutos).
- Se revisa que cada archivo sea de verdad del tipo que dice ser antes de convertirlo.
- HTML a PDF solo abre páginas públicas. Hay cuatro capas:
  1. La API rechaza direcciones internas: nombres sin punto (`api`, `gotenberg`), `localhost` y nombres que apuntan a IPs privadas (por ejemplo `127.0.0.1.nip.io`).
  2. Gotenberg, que es la protección de verdad: `--chromium-deny-private-ips` y `--libreoffice-deny-private-ips` revisan cada dirección justo antes de abrirla (también imágenes, iframes y enlaces dentro de la página o del documento) y se conectan a esa misma IP, así que no se les puede engañar cambiando el DNS.
  3. Una lista de direcciones prohibidas en Chromium (`--chromium-deny-list`).
  4. El firewall (`firewall.sh`) no deja que Gotenberg se conecte a ninguna red interna, ni siquiera a la de Oracle ni al propio servidor. Solo le deja preguntar al DNS.
- Un HTML subido no puede leer archivos del servidor ni los de otras personas que estén convirtiendo al mismo tiempo: Gotenberg solo le deja abrir los archivos de su propia carpeta, y la lista de Chromium bloquea además cualquier listado de `/tmp`.
- Gotenberg no tiene puertos abiertos hacia internet: solo la API puede hablarle. Las funciones de Gotenberg que no usamos (webhooks y descargas desde direcciones, *downloadFrom*) están apagadas.
- Los tres contenedores corren sin permisos especiales (`cap_drop: ALL`), con el disco en solo lectura, con tope de memoria y de procesos, y con registros que no crecen sin fin (3 archivos de 10 MB).

## Probar en tu computadora

No hace falta Docker. Las pruebas de la API solo necesitan Python 3.12:

```
cd server
pip install -r api/requirements.txt pytest
python3 -m pytest tests -q
```

En esas pruebas Gotenberg se reemplaza por uno falso.

Las pruebas con Gotenberg y Caddy de verdad (en Intel y en ARM, como Oracle) corren solas en GitHub Actions con cada cambio: archivo `.github/workflows/servidor.yml` y script `tests/integration/integracion.py`. Revisan las 8 conversiones, que no se puedan abrir direcciones internas y los límites. Si tienes Docker, puedes correrlas igual (los pasos están al principio del script).

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
