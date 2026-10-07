# Desarrollo local

```bash
docker compose -f ../infra/compose.yml up -d   # Postgres 54320, Redis 63790, Mailpit 8025
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py runserver 127.0.0.1:8800   # el 8000 lo ocupa otro proyecto local
```

Frontend: `pnpm -C ../frontend dev` (proxy `/api` → 127.0.0.1:8800). Correos en http://localhost:8025.

## Datos de demostración

```bash
uv run python manage.py seed_demo
```

Crea, si no existen, datos ficticios para demos y pruebas (doc 10 §3): el dueño de la plataforma, **Financiera Modelo SRL** con un usuario por rol, una caja con RD$ 500,000 y tres clientes con cédula válida, y **Préstamos del Cibao SRL** para mostrar el aislamiento. Se puede correr las veces que haga falta: no toca lo que ya existe. Con `DEBUG` apagado se niega, salvo `--allow-non-debug` (solo en el entorno de pruebas).

| Cuenta | Rol |
| --- | --- |
| `dueno@cobradia.test` | Dueño de la plataforma |
| `gerente@modelo.test` | Gerente y administrador de Financiera Modelo |
| `supervisor@modelo.test` · `oficial@modelo.test` · `cajera@modelo.test` · `cobrador@modelo.test` · `contabilidad@modelo.test` | Un rol cada una |
| `gerente@cibao.test` | Gerente de Préstamos del Cibao (la otra empresa) |

Todas usan la contraseña `demo-cobradia-2026`.

## Pruebas de extremo a extremo

Con PostgreSQL, el backend (`runserver 127.0.0.1:8800`), el frontend (`pnpm -C ../frontend dev`) y `seed_demo` corriendo:

```bash
pnpm -C ../frontend e2e
```

Recorren la demo de la fase 3 (oficial → supervisor → cajera), el acceso, el aislamiento entre empresas y el uso en el celular. En Windows usan el Edge del sistema; en otra máquina, `npx playwright install chromium` la primera vez. Cada corrida crea un préstamo nuevo en Financiera Modelo.

## Cuentas sembradas a mano en las fases 1 y 3 (base local de Jonas)

| Cuenta | Rol | Contraseña |
| --- | --- | --- |
| `jonas@cobradia.test` | Dueño de la plataforma | `clave-dueno-larga-03` |
| `demo@cobradia.test` | Gerente/Admin de «Financiera Demo SRL» | `clave-de-prueba-larga-01` |
| `cajera@cobradia.test` | Cajera (sucursal SD) | `clave-cajera-larga-02` |
| `oficial@cobradia.test` | Oficial de crédito (sucursal 01) | `clave-oficial-larga-04` |
| `supervisor@cobradia.test` | Supervisor (sucursal 01) | `clave-supervisor-larga-05` |

Recorrido de la Fase 3: el oficial crea la solicitud, el supervisor (o el gerente) la aprueba y la cajera o el gerente la desembolsa; nadie aprueba lo que creó ni desembolsa lo que aprobó.

Son datos ficticios sembrados a mano durante las fases 1 y 3; se pueden borrar recreando el volumen (`docker compose -f ../infra/compose.yml down -v`).
