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

## Pendientes que dependen del dueño

1. **Respaldos.** Activar los respaldos programados del volumen de Postgres en el panel (*Postgres* → *Backups*) y, para la copia externa cifrada, adaptar `infra/production/backup.sh` como servicio con *cron*.
2. **Errores.** Poner `SENTRY_DSN` en `api`, `worker` y `beat`.
