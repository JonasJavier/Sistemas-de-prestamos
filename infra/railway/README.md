# Cobradía en Railway

Manual de operación de producción en Railway (decisión 113). Proyecto `cobradia`, entorno `production`, región de Virginia.

- App: <https://app.cobradia.com> · sitio: <https://cobradia.com> (`www` redirige al sitio). El dominio se compró en Railway, que maneja su DNS: al agregar un dominio a un servicio crea solo los registros. La dirección `web-production-5025e0.up.railway.app` sigue sirviendo la app.
- Correo: Resend (cuenta del dueño, dominio `cobradia.com` verificado, región us-east-1) por SMTP. Ver «Correo» más abajo.

**Cómo se despliega.** Mientras la app de Railway en GitHub no tenga acceso a este repositorio, se sube desde la raíz del repositorio con la CLI (cada servicio ya sabe su carpeta y su Dockerfile):

```bash
railway up --service api --detach      # primero: migra antes de entrar
railway up --service worker --detach
railway up --service beat --detach
railway up --service web --detach
```

Cuando el dueño le dé acceso (GitHub → *Settings* → *Applications* → *Railway* → *Repository access*), se conecta cada servicio con `railway service source connect --repo JonasJavier/Sistemas-de-prestamos --branch main --service <servicio>` y desde ahí cada *push* a `main` despliega solo los servicios cuyos archivos cambiaron. `APP_VERSION` toma el commit de GitHub; con `railway up` queda vacío.

| Servicio | Qué hace | Origen |
| --- | --- | --- |
| `web` | Caddy: la SPA, `/api` → `api`, y el sitio cuando llega por `SITE_HOST` | `infra/production/web.Dockerfile` con `CADDYFILE=infra/railway/Caddyfile` |
| `api` | Django con Gunicorn. Antes de cada versión corre `migrate`; solo entra si `/api/v1/salud/` responde | `backend/Dockerfile` |
| `worker` · `beat` | Tareas de Celery en segundo plano y programadas | `backend/Dockerfile` |
| `Postgres` · `Redis` | Bases administradas por Railway | Plantillas de Railway |
| `archivos` | *Bucket* S3 privado: documentos, expedientes, exportaciones, logos | Railway Buckets |
| `respaldo` | Cada noche: base y archivos cifrados al bucket `respaldos` (decisión 123) | `backend/Dockerfile.respaldo` |
| `respaldos` | *Bucket* de respaldos, en otra región (`sjc`) | Railway Buckets |

## Cómo está armado

- **Base de datos.** La app entra con el rol `cobradia`, sin superusuario ni `BYPASSRLS`, para que RLS la frene (decisión 042). Se creó una sola vez:

  ```bash
  railway ssh --service Postgres -- psql -U postgres -c "CREATE ROLE cobradia LOGIN PASSWORD '<APP_DB_PASSWORD>'" -c "CREATE DATABASE cobradia OWNER cobradia"
  ```

  La clave vive en la variable `APP_DB_PASSWORD` del servicio `Postgres`; `api` arma su `DATABASE_URL` con ella por referencia.
- **Variables.** `api` tiene los valores; `worker` y `beat` los toman con `${{api.…}}`. Los secretos (`DJANGO_SECRET_KEY`, `APP_DB_PASSWORD`) se generaron al azar y solo existen en Railway; `EMAIL_PASSWORD` es la clave de Resend.
- **Proxy.** El borde de Railway termina TLS y escribe la IP del visitante en `X-Real-IP`; Caddy la pasa a Django como el único salto de confianza (`TRUSTED_PROXY_COUNT=1`) y fija `X-Forwarded-Proto: https`.
- **Archivos.** Con `AWS_STORAGE_BUCKET_NAME` definido, Django guarda en el bucket (privado; enlaces firmados de 5 minutos). Sin ella, en disco, como en desarrollo.
- **Correo.** Sale por el SMTP de Resend: en `api`, `EMAIL_HOST=smtp.resend.com`, `EMAIL_PORT=587`, `EMAIL_USER=resend`, `EMAIL_USE_TLS=true` y `EMAIL_PASSWORD` = la clave `cobradia-produccion` de Resend (solo envío, solo `cobradia.com`); `worker` y `beat` las toman por referencia. El remitente es `DEFAULT_FROM_EMAIL` (por defecto `Cobradía <no-responder@cobradia.com>`). El DNS de Railway tiene los registros que pide Resend: `rsend` y `send` (CNAME a `*.forge.rmta.net`), `resend._domainkey` (DKIM) y `_dmarc` (`v=DMARC1; p=none;`). Para cambiar la clave: crear otra en Resend y guardarla con `railway variables --service api --set EMAIL_PASSWORD=…` sin pegarla en ningún chat, redesplegar `api`, `worker` y `beat`, y borrar la vieja. **Ojo:** Railway solo permite SMTP en el plan Pro; si se baja de plan, hay que pasar al envío por la API HTTP de Resend.
- **Correo que llega.** El *Email Forwarding* del dominio reenvía `hola@cobradia.com` al Gmail del dueño (Railway agrega los MX `mx*.name.com` y el SPF `v=spf1 a mx ~all` del dominio raíz; no chocan con los de Resend, que viven en `send`). Desde ese Gmail se responde como `hola@` por el SMTP de Resend con otra clave, `gmail-hola`. Las imágenes de `/marca/` (logo de la firma y foto de perfil) son lo único del sitio que otros sitios pueden mostrar (`Cross-Origin-Resource-Policy: cross-origin` en el Caddyfile).

## Entrar con Google (decisión 118)

El botón «Continuar con Google» aparece solo cuando `api` tiene `GOOGLE_CLIENT_ID`. Se configura una sola vez, con la cuenta de Google del dueño:

1. En <https://console.cloud.google.com> crear un proyecto `Cobradía`.
2. *APIs y servicios* → *Pantalla de consentimiento de OAuth* (o *Google Auth Platform* → *Branding*): tipo **Externo**, nombre `Cobradía`, correo de asistencia `hola@cobradia.com`, logo de `/marca/`, dominio autorizado `cobradia.com`, enlaces a <https://cobradia.com/privacidad> y <https://cobradia.com/terminos>. Permisos: solo `email`, `profile` y `openid` (no piden revisión de Google). **Publicar la app** (pasar de «Prueba» a «En producción»); en «Prueba» solo entran los correos de la lista de usuarios de prueba.
3. *Credenciales* → *Crear credenciales* → *ID de cliente de OAuth* → **Aplicación web**, nombre `Cobradía producción`:
   - Orígenes autorizados de JavaScript: `https://app.cobradia.com`.
   - URI de redireccionamiento autorizados: `https://app.cobradia.com/api/v1/oauth/google/login/callback/` (y, para probar en una computadora de desarrollo, `http://localhost:5173/api/v1/oauth/google/login/callback/`).
4. Guardar el ID y el secreto en Railway desde la terminal, sin pegarlos en ningún chat, y redesplegar `api`:

   ```bash
   railway variables --service api --set GOOGLE_CLIENT_ID=… --set GOOGLE_CLIENT_SECRET=…
   ```

La CSP de la app ya permite que el formulario de «Continuar con Google» lleve a `accounts.google.com`. En desarrollo, el mismo `GOOGLE_CLIENT_ID` (y su secreto) van en `backend/.env`.

## Primer acceso: el dueño de la plataforma

```bash
railway ssh --service api -- python manage.py createsuperuser
```

Entra por la app y configura 2FA al primer inicio (el admin de Django está apagado en producción).

## Operación diaria

```bash
railway logs --service api                       # registros en vivo
railway ssh --service api -- python manage.py verificar_integridad
curl -fsS https://<dominio>/api/v1/salud/        # responde la versión (commit) en línea
```

**Volver atrás:** en el panel de Railway, *Deployments* → la versión anterior → *Redeploy*. Las migraciones son compatibles hacia adelante (doc 10 §3); si la versión nueva dañó datos, además se restaura un respaldo.

## Respaldos (decisión 123)

El servicio `respaldo` (imagen `backend/Dockerfile.respaldo`: el mismo código más `pg_dump` 18 y gpg) queda corriendo y **cada día a las 3:00 (Santo Domingo)** saca la base completa (`pg_dump` como superusuario: incluye a todas las empresas) y un `tar.gz` con todos los archivos privados del bucket `archivos`, **cifra ambos con la llave pública** del dueño y los sube al bucket `respaldos` (región `sjc`, distinta de `archivos` en `iad`). Guarda 30 días. El servicio no puede leer lo que escribe: solo la llave privada, que vive fuera de línea en poder del dueño, abre un respaldo. Un respaldo fallido sale en los registros del servicio y en Sentry.

Variables del servicio: `BACKUP_DATABASE_URL` (`${{Postgres.DATABASE_URL}}`), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_S3_REGION` (las credenciales del bucket: `railway bucket credentials --bucket respaldos`), `BACKUP_PUBLIC_KEY_B64` (la llave pública en base64), `BACKUP_KEEP_DAYS` (30), `BACKUP_HOUR` (3) y, por referencia a `api`, las de la app. Para llevar las copias a otro proveedor (Cloudflare R2, Backblaze B2) basta cambiar las cuatro `BACKUP_S3_*`.

```bash
railway ssh --service respaldo -- python manage.py respaldar            # un respaldo ahora mismo
railway ssh --service respaldo -- python manage.py restaurar --listar   # qué copias hay
railway logs --service respaldo                                         # «Respaldo listo: …» cada noche
```

**Las llaves** se generaron el 23/10/2026 en la computadora del dueño (`Documents/cobradia-respaldos/`): `llave-publica-respaldos.asc` está en Railway; `llave-privada-respaldos.asc` debe guardarse en dos lugares fuera de línea (USB y gestor de contraseñas) y nunca en el repositorio ni en un chat. Sin ella los respaldos no se pueden leer.

**Simulacro de restauración** (mensual, doc 10 §3). La llave privada se presta al servicio solo mientras dura:

```bash
railway variables --service respaldo --skip-deploys --set "BACKUP_PRIVATE_KEY_B64=$(base64 -w0 ~/Documents/cobradia-respaldos/llave-privada-respaldos.asc)"
railway ssh --service respaldo -- python manage.py restaurar          # última copia → cobradia_restore, verificar_integridad, y la borra
railway variables --service respaldo --skip-deploys --unset BACKUP_PRIVATE_KEY_B64
```

Restaura en una base aparte (`cobradia_restore`, propiedad del rol `cobradia`, como producción), corre `verificar_integridad` sobre ella (RLS forzado en todas las tablas de empresa y el libro cuadrado) y la borra. Anotar la fecha del simulacro en `docs/operacion/incidentes.md`.

**Recuperación real:** detener `api`, `worker` y `beat` en el panel, y luego `railway ssh --service respaldo -- python manage.py restaurar --produccion --clave base/cobradia-db-<fecha>.dump.gpg --archivos archivos/cobradia-archivos-<fecha>.tar.gz.gpg`; volver a encender los servicios y comprobar `/api/v1/salud/`.

Además, en el panel de Railway, *Postgres → Backups* ofrece instantáneas del volumen (plan Pro): son la copia rápida del proveedor; la externa cifrada es la que vale si Railway falla.

## Planes (decisión 124)

`railway ssh --service api -- python manage.py seed_plans` carga o restaura los tres planes (Esencial, Profesional, Empresa) y deja el plan de prueba con todas las funciones. Después, cada plan se ajusta desde el panel (Planes).

## Errores y disponibilidad (decisión 123)

- **Errores:** con `SENTRY_DSN` en `api` (worker, beat y respaldo lo toman por referencia) cada excepción del servidor llega a Sentry con la versión (`APP_VERSION`), sin datos personales. El navegador reporta los suyos cuando `web` se construye con `VITE_SENTRY_DSN` (un proyecto *React* aparte en Sentry). Se ponen con `railway variables --service api --set SENTRY_DSN=…` y `railway variables --service web --set VITE_SENTRY_DSN=…`, y se redespliegan `api` y `web`.
- **Disponibilidad:** un monitor externo (UptimeRobot o Better Stack, gratis) pide `https://app.cobradia.com/api/v1/salud/` cada minuto; responde 503 si la base o Redis no contestan. El aviso va al correo y al WhatsApp del dueño.

## Desplegar una versión

Hasta conectar GitHub, `infra/railway/deploy.sh` (desde la raíz, con todo en commit) pone `APP_VERSION` = el commit en cada servicio y los sube en orden: `api` (migra) → `worker` → `beat` → `respaldo` → `web`. Con un servicio como argumento, solo ese.

## Pendientes que dependen del dueño

1. **Sentry.** Crear la cuenta (plan gratis), un proyecto *Django* y uno *React*, y poner los DSN como dice arriba.
2. **Monitor de disponibilidad.** Crear la cuenta de UptimeRobot (o Better Stack) con el monitor de `/api/v1/salud/` y el aviso por correo y WhatsApp.
3. **La llave privada de los respaldos** en dos lugares fuera de línea, y el primer simulacro de restauración anotado.
4. **Acceso a GitHub** para que cada *push* despliegue solo (arriba).
