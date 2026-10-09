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

Crea, si no existen, datos ficticios para demos y pruebas (doc 10 §3): el dueño de la plataforma, **Financiera Modelo SRL** con un usuario por rol, una caja con RD$ 500,000 y tres clientes con cédula válida, y **Préstamos del Cibao SRL** para mostrar el aislamiento. Desde la fase 4 agrega una **cartera para cobrar**: tres préstamos desembolsados por las vías reales (María Gómez con 18 días de atraso y José Pérez con 5, más uno al día), los semanales asignados al cobrador; se agrega una sola vez, mientras el cobrador no tenga cartera. Se puede correr las veces que haga falta: no toca lo que ya existe. Con `DEBUG` apagado se niega, salvo `--allow-non-debug` (solo en el entorno de pruebas).

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

Recorren la demo de la fase 3 (oficial → supervisor → cajera), la de la fase 4 (la cajera abre caja, cobra con cambio, corrige un pago que autoriza el supervisor con su contraseña, cuadra y cierra; el cobrador cobra en su ruta desde el celular y la cajera recibe la rendición; el gerente ve atrasos y rutas), el acceso, el aislamiento entre empresas, el uso en el celular y, desde la fase 9, los mensajes, el QR y el portal del cliente (que lee el código en Mailpit). En Windows usan el Edge del sistema; en otra máquina, `npx playwright install chromium` la primera vez. Se pueden repetir: cada corrida crea un préstamo nuevo y cobra montos pequeños.

## Fase 4: cobros y caja

- **Tarea nocturna** (mora, días de atraso, foto diaria, conciliación con el libro): Celery beat la corre a las 00:30. A mano: `uv run python manage.py shell -c "from apps.payments.tasks import nightly_portfolio; print(nightly_portfolio())"`. Si la conciliación encuentra una diferencia, avisa al gerente en la campana.
- **Horario de cajeros y cobradores** (decisión 071): apagado en desarrollo para poder hacer demos a cualquier hora. Para probarlo, `ENFORCE_WORKING_HOURS=true` en el `.env` y reiniciar el backend; el horario de cada sucursal se edita en Ajustes · Sucursales.
- **Reconfirmación con 2FA** al autorizar reversos: con la app autenticadora activa, se pide su código; sin ella (solo en desarrollo), la contraseña.
- **Migración de préstamos en curso** (F16 básica, decisión 074):

  ```bash
  uv run python manage.py migrar_prestamos prestamos.csv --usuario gerente@modelo.test
  uv run python manage.py migrar_prestamos prestamos.csv --usuario gerente@modelo.test --aplicar
  ```

  Columnas: `documento, producto, monto, tasa, frecuencia, cuotas, fecha_desembolso, primera_cuota, numero_anterior, cobrador, saldo_capital, pagos` (tasa como fracción, fechas `AAAA-MM-DD`, pagos como `2026-01-05:1500;2026-02-05:1500`). Sin `--aplicar` solo ensaya; con una fila mala no guarda nada.

## Fase 9: mensajes y portal del cliente

- **Mensajes:** el correo sale por Mailpit (http://localhost:8025); WhatsApp y SMS se registran sin enviarse hasta configurar Twilio (`MESSAGING_WHATSAPP_PROVIDER=twilio`, `MESSAGING_SMS_PROVIDER=twilio` y las variables `TWILIO_*` en el `.env`, decisión 097). Ajustes · Mensajería tiene las plantillas, el registro y el mensaje de prueba.
- **Portal del cliente** (decisión 099): en la ficha de un cliente, pestaña Mensajes, «Invitar al portal» muestra su enlace personal. Ábrelo en otra ventana privada, pide el código y léelo en Mailpit: los tres clientes de la demo tienen correo `@cliente.test`.
- **Sitio de promoción** (decisión 100): `pnpm -C ../site dev` en http://localhost:4321; `PUBLIC_APP_URL=http://localhost:5173` hace que sus botones lleven a la app local.

## Probar en un celular

En la misma red Wi-Fi: `pnpm -C ../frontend dev --host` muestra la dirección (por ejemplo `http://192.168.1.20:5173`). En el `.env` del backend, `DEV_EXTRA_HOSTS=192.168.1.20` y `DEV_EXTRA_ORIGINS=http://192.168.1.20:5173`, y reiniciar el backend. Así funciona todo menos la ubicación: los navegadores solo la dan en HTTPS. Para probar «Mi ruta» completa hace falta HTTPS: el entorno de pruebas (`staging.cobradia.com`, doc 10 §3) o un túnel HTTPS temporal hacia el puerto 5173, agregando su dirección a las mismas dos variables.

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
