# Cobradía

**Cobradía** (`cobradia.com`) es una plataforma SaaS multiempresa para que las financieras dominicanas administren préstamos, cobros y caja. Cada empresa se registra en línea con 30 días de prueba y trabaja con sus datos aislados de las demás (decisiones 041–045).

**Estado (09/10/2026):** fases 1 · Cimientos, 2 · Clientes y garantías y 3 · Originación aceptadas; las fases 4 · Cobros y caja, 5 · Cobranza, 6 · Finanzas, 7 · Tablero y reportes, 8 · Renovación y legal y 9 · Comunicación y portal están construidas y esperan su aceptación, y la parte técnica de la fase 10 · Aceptación y lanzamiento está hecha; lo que falta para lanzar depende de Jonas y está en la [lista de lanzamiento](docs/operacion/lanzamiento.md) (la validación contable y legal quedó en la decisión 075). Detalle en el [plan de construcción](docs/proyecto/10-plan-de-construccion.md).

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `backend/` | API en Django 6.1 + DRF, PostgreSQL con Row-Level Security, Celery. `engine/` es el motor financiero en Python puro |
| `frontend/` | Aplicación web en React 19 + Vite + TypeScript, TanStack Router/Query y Tailwind 4 |
| `site/` | Sitio de promoción de `cobradia.com`, estático, en Astro (decisión 100) |
| `infra/` | Docker Compose para desarrollo (PostgreSQL, Redis y Mailpit) y, en `infra/production/`, el de producción con su manual (decisión 101) |
| `docs/manual/` | Manuales por rol para capacitar a cada financiera |
| `docs/operacion/` | Lanzamiento, respuesta a incidentes, revisión de seguridad y pruebas de carga |
| `docs/proyecto/` | Las bases del proyecto (pasos 01–10) y el [registro de decisiones](docs/proyecto/decisiones.md): **la fuente de verdad** |
| `docs/referencia/` | Estudio del sistema de referencia; solo material de consulta |

## Desarrollo local

Requisitos: Docker, Python 3.14 con [uv](https://docs.astral.sh/uv/), Node 24 con pnpm 11.

```bash
docker compose -f infra/compose.yml up -d
```

Los puertos no son los estándar para convivir con otros servicios: PostgreSQL en **54320**, Redis en **63790**, Mailpit en http://localhost:8025. Los pasos del backend, las cuentas de prueba y el recorrido de la demo están en [`backend/DEV.md`](backend/DEV.md); el frontend arranca con `pnpm -C frontend dev` (http://localhost:5173, con proxy de `/api` al backend en el puerto 8800) y el sitio de promoción con `pnpm -C site dev` (http://localhost:4321).

## Calidad

Nada entra a `main` en rojo. La integración continua (`.github/workflows/ci.yml`) corre:

- **Backend:** `ruff check`, `ruff format --check`, tipos estrictos del motor financiero (`mypy`), migraciones pendientes, `pip-audit` y `pytest` contra PostgreSQL con un rol sin privilegios (así RLS se prueba de verdad), incluida una semana simulada de cobros y caja que debe conciliar en cero cada noche.
- **Frontend:** `oxlint`, formato, pruebas unitarias, `pnpm audit` y compilación; el sitio de promoción, `pnpm audit` y compilación.
- **Producción:** `check --deploy` con la configuración de producción, las dos imágenes de Docker y el Caddyfile.
- **Extremo a extremo:** Playwright sobre el build de producción con los datos de `seed_demo`: las demos de las fases 3 a 9, el acceso, el aislamiento entre empresas, el celular y el portal del cliente (con el código leído de Mailpit).

Las convenciones de trabajo (idiomas, dinero en `Decimal`, multiempresa, commits) están en [`CLAUDE.md`](CLAUDE.md) y en el [paso 10 §5](docs/proyecto/10-plan-de-construccion.md#5-convenciones-de-trabajo).

## Material previo

- [Plan de producto inicial](docs/PLAN_PRODUCTO.md) (primer borrador; manda `docs/proyecto/`)
- [Estudio de la referencia pantalla por pantalla](docs/referencia/README.md), [inventario](docs/INVENTARIO_REFERENCIA.md), [flujos verificados](docs/FLUJOS_VERIFICADOS.md) y [matriz de pruebas](docs/MATRIZ_PRUEBAS_Y_DECISIONES.md)
