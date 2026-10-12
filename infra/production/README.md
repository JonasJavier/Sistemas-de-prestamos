# Producción de Cobradía

> Desde la decisión 113, producción corre en Railway: ver [infra/railway](../railway/README.md). Este Compose queda como alternativa para un VPS propio.

Manual de operación del servidor (decisión 101). Todo corre con Docker Compose en un VPS: Caddy (HTTPS automático, la app, el sitio y los archivos estáticos), la API con Gunicorn, el *worker* y el *beat* de Celery, PostgreSQL 18 y Redis 8.

| Servicio | Qué hace |
| --- | --- |
| `web` | Caddy: `app.cobradia.com` (la SPA y `/api`), `cobradia.com` (el sitio) y `www` → `cobradia.com` |
| `migrate` | Aplica las migraciones y termina; la API arranca solo si salió bien |
| `api` | Django con Gunicorn; reúne los estáticos al arrancar |
| `worker` · `beat` | Tareas en segundo plano y programadas (noche, avisos, exportaciones) |
| `db` | PostgreSQL. La app entra con el rol `cobradia`, **sin privilegios de superusuario**, para que RLS la frene (decisión 042) |
| `redis` | Caché, cola de Celery y límites de intentos |

## Requisitos del servidor

- Ubuntu o Debian reciente con Docker y el plugin Compose, `bash`, `gpg` y `rclone`.
- Los puertos 80 y 443 abiertos; los DNS de `app.cobradia.com`, `cobradia.com` y `www.cobradia.com` apuntando al servidor.
- Respaldos externos y *snapshots* del proveedor activados (doc 10 §3).

## Primera instalación

```bash
git clone <repositorio> /opt/cobradia && cd /opt/cobradia/infra/production
cp env.example .env && chmod 600 .env   # llenar todos los valores
docker compose build
docker compose up -d
docker compose logs -f migrate api      # esperar «Booting worker»
curl -fsS https://app.cobradia.com/api/v1/salud/
docker compose run --rm api python manage.py verificar_integridad
```

El dueño de la plataforma se crea con `docker compose run --rm api python manage.py createsuperuser` (entra por la app, con 2FA; el admin de Django está apagado en producción).

## Actualizar a una versión nueva

Cada versión es una etiqueta de Git (`v1.2.0`) con la CI en verde. Las migraciones son siempre compatibles hacia adelante: la versión anterior sigue funcionando mientras migra la nueva.

```bash
git fetch --tags && git checkout v1.2.0
sed -i 's/^APP_VERSION=.*/APP_VERSION=v1.2.0/' .env
docker compose build && docker compose up -d
curl -fsS https://app.cobradia.com/api/v1/salud/   # responde la versión nueva
```

**Volver atrás:** `git checkout <etiqueta anterior>`, poner esa versión en `APP_VERSION` y `docker compose up -d` (las imágenes viejas siguen en el servidor). Si la versión nueva dañó datos, además se restaura el último respaldo (abajo).

## Respaldos

`backup.sh` saca cada noche la base completa (`pg_dump` como superusuario: incluye a todas las empresas) y los archivos privados, los **cifra con la llave pública** y los copia fuera del servidor con `rclone`. El servidor nunca tiene la llave privada: si lo comprometen, los respaldos siguen ilegibles.

```bash
# Una sola vez, en la computadora del dueño (no en el servidor):
gpg --quick-generate-key "Respaldos Cobradía" rsa4096 encrypt never
gpg --armor --export "Respaldos Cobradía" > backup-public.asc   # esta va al servidor
gpg --armor --export-secret-keys "Respaldos Cobradía" > backup-private.asc   # guardarla en dos lugares seguros, fuera de línea

# En el servidor:
rclone config            # el destino externo (p. ej. un bucket con versiones y retención de 90 días)
crontab -e               # 30 3 * * * /opt/cobradia/infra/production/backup.sh >> /var/log/cobradia-backup.log 2>&1
```

Quedan dos semanas de respaldos en el servidor; la retención larga la lleva el destino externo.

## Restaurar

**Simulacro mensual** (doc 10 §3): en una computadora con la llave privada importada, o en el servidor importándola solo durante el simulacro.

```bash
./restore.sh backups/cobradia-db-<fecha>.dump.gpg
```

Restaura en una base aparte (`cobradia_restore`) sin tocar producción y corre `verificar_integridad`: RLS forzado en todas las tablas de empresa y el libro cuadrado en cada empresa. Anotar la fecha, el respaldo usado, el tiempo que tomó y el resultado en el registro de simulacros.

**Recuperación real:**

```bash
docker compose stop api worker beat
./restore.sh <db>.dump.gpg cobradia <media>.tar.gz.gpg
docker compose up -d
```

## Vigilancia

- **Salud:** un chequeo externo cada minuto a `https://app.cobradia.com/api/v1/salud/` que avise al dueño si no responde 200 (consulta la base y Redis; no revela datos).
- **Errores:** Sentry con `SENTRY_DSN`; no envía datos personales.
- **Negocio:** la conciliación nocturna avisa al gerente de cada empresa si el libro no cuadra.
- **Registros:** `docker compose logs --since 1h api worker`.

Ante un incidente, seguir el [plan de respuesta a incidentes](../../docs/operacion/incidentes.md).

## Secretos

Viven solo en `.env` (permiso 600) y en el gestor de contraseñas del dueño. Rotación: la clave de Django y las contraseñas de la base una vez al año o ante cualquier sospecha; las de proveedores (correo, Twilio) cuando cambie quien tiene acceso. Rotar la clave de Django cierra todas las sesiones.

## Probarlo en una computadora

Con `APP_HOST=app.localhost`, `SITE_HOST=localhost`, `HTTP_PORT=8081` y `HTTPS_PORT=8443` en el `.env`, Caddy usa su propia autoridad local: la app queda en `https://app.localhost:8443` y el sitio en `https://localhost:8443` (el navegador avisa del certificado).
