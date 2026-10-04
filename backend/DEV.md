# Desarrollo local

```bash
docker compose -f ../infra/compose.yml up -d   # Postgres 54320, Redis 63790, Mailpit 8025
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py runserver 127.0.0.1:8800   # el 8000 lo ocupa otro proyecto local
```

Frontend: `pnpm -C ../frontend dev` (proxy `/api` → 127.0.0.1:8800). Correos en http://localhost:8025.

## Cuentas de prueba locales (solo esta base de desarrollo)

| Cuenta | Rol | Contraseña |
| --- | --- | --- |
| `jonas@cobradia.test` | Dueño de la plataforma | `clave-dueno-larga-03` |
| `demo@cobradia.test` | Gerente/Admin de «Financiera Demo SRL» | `clave-de-prueba-larga-01` |
| `cajera@cobradia.test` | Cajera (sucursal SD) | `clave-cajera-larga-02` |

Son datos ficticios sembrados a mano durante la Fase 1; se pueden borrar recreando el volumen (`docker compose -f ../infra/compose.yml down -v`).
