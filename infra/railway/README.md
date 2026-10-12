# Cobradía en Railway

Manual de operación de producción en Railway (decisión 113). Proyecto `cobradia`, entorno `production`, región de Virginia.

- App: <https://web-production-5025e0.up.railway.app> (hasta tener `app.cobradia.com`).
- Correos de prueba (Mailpit): <https://mailpit-production-de9d.up.railway.app>, usuario y clave en la variable `MP_UI_AUTH` del servicio `mailpit`.

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
| `mailpit` | Buzón temporal mientras no haya proveedor de correo | `axllent/mailpit` |

## Cómo está armado

- **Base de datos.** La app entra con el rol `cobradia`, sin superusuario ni `BYPASSRLS`, para que RLS la frene (decisión 042). Se creó una sola vez:

  ```bash
  railway ssh --service Postgres -- psql -U postgres -c "CREATE ROLE cobradia LOGIN PASSWORD '<APP_DB_PASSWORD>'" -c "CREATE DATABASE cobradia OWNER cobradia"
  ```

  La clave vive en la variable `APP_DB_PASSWORD` del servicio `Postgres`; `api` arma su `DATABASE_URL` con ella por referencia.
- **Variables.** `api` tiene los valores; `worker` y `beat` los toman con `${{api.…}}`. Los secretos (`DJANGO_SECRET_KEY`, `APP_DB_PASSWORD`, `MP_UI_AUTH`) se generaron al azar y solo existen en Railway.
- **Proxy.** El borde de Railway termina TLS y escribe la IP del visitante en `X-Real-IP`; Caddy la pasa a Django como el único salto de confianza (`TRUSTED_PROXY_COUNT=1`) y fija `X-Forwarded-Proto: https`.
- **Archivos.** Con `AWS_STORAGE_BUCKET_NAME` definido, Django guarda en el bucket (privado; enlaces firmados de 5 minutos). Sin ella, en disco, como en desarrollo.

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

1. **Dominio.** Registrar `cobradia.com` y agregar en `web` los dominios `app.cobradia.com`, `cobradia.com` y `www.cobradia.com` (Railway da los registros DNS). Después, en `api`: `DJANGO_ALLOWED_HOSTS=app.cobradia.com,healthcheck.railway.app` y `FRONTEND_URL=https://app.cobradia.com`; en `web`: `PUBLIC_APP_URL=https://app.cobradia.com`.
2. **Correo.** Contratar un proveedor SMTP (p. ej. Resend o Postmark), verificar el dominio y poner `EMAIL_HOST`, `EMAIL_PORT=587`, `EMAIL_USER`, `EMAIL_PASSWORD` y `EMAIL_USE_TLS=true` en `api`. Luego borrar el servicio `mailpit`.
3. **Respaldos.** Activar los respaldos programados del volumen de Postgres en el panel (*Postgres* → *Backups*) y, para la copia externa cifrada, adaptar `infra/production/backup.sh` como servicio con *cron*.
4. **Errores.** Poner `SENTRY_DSN` en `api`, `worker` y `beat`.
