# Cobradía — guía para Claude

## Rol y autonomía

Claude es **el responsable técnico del proyecto, con autonomía total** (decisión 051, pedida explícitamente por Jonas el 04/10/2026). Eso significa:

- Claude decide, construye, itera, repara y hace *double check* de fases anteriores sin esperar aprobación previa. Decide cuándo seguir y cuándo parar.
- Jonas (dueño del producto) no interviene en lo técnico; confía en que se haga con las mejores prácticas, optimizado y con excelente arquitectura desde el minuto 1.
- Se le pide ayuda a Jonas solo cuando algo depende de él de verdad: registrar el dominio, pagos y cuentas, decisiones comerciales (planes, precios), validaciones legales, o credenciales de servicios.
- La calidad no se negocia: nada se da por terminado sin lint y pruebas en verde, y lo importante se verifica ejecutándolo.

## Qué es este proyecto

**Cobradía** (`cobradia.com`): SaaS multitenant para que financieras dominicanas administren préstamos, cobros y caja. Jonas es el dueño de la plataforma; las empresas se registran en línea con prueba de 30 días.

## Fuentes de verdad

- `docs/proyecto/01…10` — los 10 pasos de la Fase 0 (arquitectura, reglas, flujos, modelo, seguridad, pantallas, diseño, documentos, plan). **Si el código contradice un documento, se actualiza el documento primero.**
- `docs/proyecto/decisiones.md` — registro de decisiones numeradas. Toda decisión nueva se registra ahí.
- `docs/referencia/` — estudio del sistema de referencia (Púrpura Datos); solo material de consulta.

## Explorar el código: Codebase Memory primero

Para entender o buscar código, **todo agente de IA usa primero el grafo de Codebase Memory** (MCP `codebase-memory-mcp`): da respuestas estructurales precisas con una fracción de los tokens que gastan grep y la lectura de archivos completos. Proyecto indexado: `C-Users-savage-Documents-GitHub-Sistemas-de-prestamos`.

| Necesito… | Herramienta |
| --- | --- |
| Panorama de módulos, rutas y capas | `get_architecture(aspects=["overview"])` |
| Encontrar una función, clase o ruta | `search_graph(query=…)` o `search_graph(name_pattern=…)` |
| Leer solo ese símbolo | `get_code_snippet(qualified_name=…)` (tras `search_graph`) |
| Quién llama a X / qué llama X (impacto de un cambio) | `trace_path(function_name=…, direction="inbound"/"outbound")` |
| Qué símbolos toca mi diff | `detect_changes()` |
| Texto literal (mensajes, constantes) | `search_code(pattern=…)` |
| Código muerto | `search_graph(max_degree=0, exclude_entry_points=true)` |

Reglas:

- Si el índice está viejo (otro `head_sha` en `list_projects`) o falta, ejecutar `index_repository` antes de explorar; reindexar tras commits grandes.
- Grep, Glob y Read siguen sirviendo para documentos, configuración y archivos que no son código; y **siempre se lee un archivo con Read antes de editarlo**.
- Leer por rangos o por símbolo, no archivos enteros, salvo que se vaya a editar buena parte.

## Convenciones clave

- Código, identificadores y commits **en inglés**; interfaz, documentos y docs **en español** (decisión 010).
- Multitenant: todo registro operativo lleva `company`; RLS en PostgreSQL es la segunda barrera (042). Las pruebas de cruce de empresa son obligatorias en cada módulo.
- Dinero: `Decimal`/`NUMERIC`, nunca float. El motor financiero vive en `backend/engine/` (Python puro).
- Backend: `cd backend` y `uv run …` (pytest, ruff, manage.py). Frontend: `pnpm -C frontend …`.
- Servicios locales: `docker compose -f infra/compose.yml up -d` → Postgres en **54320**, Redis en **63790**, Mailpit en 8025 (puertos no estándar: hay un Postgres local en 5432).
- Commits por hito verificado, con mensaje descriptivo; no se commitea con pruebas rotas.
