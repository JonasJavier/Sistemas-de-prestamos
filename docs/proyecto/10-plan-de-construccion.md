# 10 · Plan de construcción

**Estado:** aprobado el 04/10/2026 (decisión 050)

Cómo se construye Cobradía: qué entrega cada fase, cómo se prueba, en qué entornos corre y con qué criterios se lanza. Sin MVP (decisión 016): versión completa y un solo lanzamiento, con demostración al cierre de cada fase.

## 1. Fases, entregables y criterios de aceptación

Las duraciones son estimaciones de trabajo para el responsable técnico; se afinan al cerrar cada fase. Total estimado: **30–34 semanas**.

| Fase | Semanas | Entregables | La fase se acepta cuando |
| --- | --- | --- | --- |
| 1 · Cimientos | 4 | Monorepo, Docker Compose, CI, prueba técnica del stack (01 §6); multitenancy completa: registro público (F19), RLS, panel de plataforma básico (PT1), suscripción (P83); allauth con 2FA, usuarios e invitaciones (F17), roles y matriz, sucursales, ajustes, auditoría pghistory, esqueleto visual con los tokens del paso 8 | Dos empresas de prueba conviven sin verse: las pruebas de cruce de empresa y de rol pasan; registro → prueba → suspensión → activación funciona de punta a punta |
| 2 · Clientes y garantías | 3 | Clientes persona y empresa con duplicados, laborales/negocio, referencias, archivos privados, garantías con detalle de vehículo e inmueble, búsqueda global Ctrl+K | F1 y F2 completos con sus validaciones; archivos solo con sesión y enlace temporal |
| 3 · Originación | 5 | Productos y cargos, **motor financiero** (métodos §3 del paso 3), simulador, solicitudes con evaluación y aprobación por límites (F3), cuentas y bancos básicos, desembolso atómico (F4), calendario versionado, numeraciones, pagaré y tabla de pagos, migración básica (F16) | Los ejemplos E1–E7 pasan como pruebas; nadie aprueba lo suyo; el desembolso descuadra en cero contra el libro |
| 4 · Cobros y caja | 5 | Pagos con asignación exacta (E9–E11), recibos carta/térmico/WhatsApp, reversos y corrección (E14), mora nocturna (E8), liquidación (E12–E13), caja por cajero con arqueo (F7), rendición (F6), «Mi ruta» en celular con ubicación (031), lista de atrasos | E8–E14 pasan; conciliación nocturna en cero durante una semana de uso simulado; cobro en ruta probado en un celular real |
| 5 · Cobranza | 2 | Gestiones, promesas, bandeja por tramos, escalamiento, agenda | F8 completo; promesas vencidas pasan solas a incumplidas |
| 6 · Finanzas | 4 | Gastos e ingresos con NCF, cuentas por pagar, transferencias, conciliación bancaria, contabilidad (diario, mayor, resultados, balance), cierre de mes (F15) | El estado de resultados cuadra con el libro al centavo; un mes cerrado rechaza asientos |
| 7 · Tablero y reportes | 3 | Tablero por rol, cartera y PAR30, clasificación explicable, comisiones, centro de reportes con exportaciones en segundo plano; métricas de plataforma (PT2) y modo soporte (PT4) | Cada indicador del paso 9 §3 da lo mismo en pantalla, PDF y Excel con los mismos filtros |
| 8 · Renovación y legal | 3 | Renovación (E15) y reestructuración (F11), castigo y recuperación (F13), casos legales (F9), contratos y documentos legales con datos reales, profesionales legales | E15 pasa; la intimación solo se emite con atraso real; plantillas marcadas «pendiente de validación legal» |
| 9 · Comunicación y portal | 3 | WhatsApp/SMS/correo con plantillas y registro (F18), portal del cliente, QR de verificación, sitio de promoción en cobradia.com | Mensajes de prueba llegan y quedan registrados; el portal muestra saldo y recibos reales |
| 10 · Aceptación y lanzamiento | 3 | Pruebas de aceptación con el primer cliente, migración ensayada dos veces, validación legal, planes y precios definitivos (PT3), términos de servicio y aviso de privacidad, endurecimiento (OWASP ZAP + revisión), respaldos probados, capacitación, salida a producción | La lista de la §4 está completa |

**Dependencias:** 1 → 2 → 3 → 4 → (5, 6 en paralelo) → 7 → 8 → 9 → 10. La demo de cierre de cada fase se hace en el entorno de pruebas con datos ficticios.

> **Fase 4: construida el 08/10/2026 (decisiones 065–074).** Pagos con asignación exacta y verificada en la base (E9–E11), recibo en hoja y en 80 mm con enlace de WhatsApp revocable, reversos y corrección autorizados por otra persona con reconfirmación 2FA (E14), mora día a día y tarea nocturna (E8), liquidación y carta de saldo con su PDF (E12–E13), abono a capital con versión nueva del calendario, caja por cajero con arqueo por denominación, cierre y aprobación (F7), rutas del cobrador con ubicación, visitas, límite de efectivo y rendición (F6, 031), bandeja de atrasos por tramo, avisos y autorizaciones (P11), alcance por sucursal en clientes con acceso registrado a otra sucursal (059), horario de cajeros y cobradores con extensión (035), cambio de fechas como versión nueva, cambio de cobrador con historial, estado de cuenta en PDF a pedido, pestaña de pagos en la ficha del cliente, desembolso en efectivo desde la caja abierta (055) y migración básica F16. Criterios: **E8–E14 en verde** en el motor y en los servicios contra el libro; **conciliación nocturna en cero** en una semana simulada de uso (8 días hábiles con cobros, ruta y rendición, condonación, abono, corrección, liquidación y cierres con diferencia; prueba `test_simulated_week`); recorridos de extremo a extremo de la cajera, el supervisor, el cobrador en el celular y el gerente en la CI. **Queda para la aceptación con Jonas:** probar el cobro en ruta en un celular real (ver `backend/DEV.md`, «Probar en un celular»).
>
> **Fase 5: construida el 09/10/2026 (decisiones 076–079).** Gestiones con resultado y seguimiento (P42), promesas que se cumplen solas al pagar y pasan solas a incumplidas por la noche, agenda de cobranza (P44), bandeja de atrasos por gestor y con promesas (P43), escalamiento configurable a 30, 60 y 90 días (una vez por episodio, al rol que debe actuar) y gestor por préstamo con historial. Criterios: **F8 completo** (pasos 3 a 6 con pruebas de servicio, API, permisos y cruce de empresa); **las promesas vencidas pasan solas a incumplidas** (prueba de la tarea nocturna); recorrido de extremo a extremo del oficial y el supervisor en la CI.
>
> **Validación contable y legal (08/10/2026, decisión 075).**
> - El responsable técnico, como contador a pedido de Jonas, cerró los puntos «Validar con el contador» con investigación de la norma dominicana ([03 §16](03-reglas-de-negocio.md#16-validación-contable-y-legal-decisión-075)).
> - Hecho en ese momento:
>   - el costo anual efectivo con cargos y el costo total en el simulador, la solicitud, el pagaré y la tabla de pagos;
>   - el tope de costo, legal y por empresa;
>   - la pantalla Ajustes → Empresa (P70), que había quedado pendiente de la fase 1;
>   - la entrega parcial del cobrador.
> - Pasa a la fase 6: la resolución de faltantes y sobrantes, el devengo del cierre de mes, los cargos gravados con ITBIS y los e-CF.
>
> **Para fases siguientes:** promesas de pago, agenda y escalamiento (fase 5, sobre `CollectionAction` y la ruta); gastos menores de caja (fase 6); exportaciones de las listas (fase 7); QR de verificación del recibo y la carta (fase 9); proveedor de mapas y política de contenido (CSP) para los mosaicos (fase 10).
>
> **Fase 3: criterios de aceptación cumplidos el 06/10/2026.** Hecho y verificado de punta a punta en el navegador (oficial → supervisor → gerente): motor con los 5 métodos y redondeo de cuota (054), productos con mora, cargos y documentos requeridos (P74), simulador (P25), solicitudes F3 con evaluación de capacidad, buró, garantes, garantías, lista de documentos, asignación del aprobador y decisión (P26–P28, 057), libro de movimientos con cuentas y bancos (P53), desembolso atómico F4 con pagaré y tabla de pagos (P29–P30, 055–056), expediente del préstamo con calendario versión 1 (P31–P32), anulación F14, feriados y numeraciones (P75). Criterios: E1–E7 en verde (más el redondeo y el método abierto); nadie aprueba lo suyo (API y restricción en la base); el desembolso cuadra en cero contra el libro (prueba de saldos contra líneas en cada caso). El double check de las fases 1–3 dejó las decisiones 058 y 060.
>
> **Trasladado a la fase 4** porque depende de los pagos: cambio de fechas como nueva versión del calendario (con cuotas parcialmente pagadas), migración básica F16 (préstamos con pagos históricos que no mueven la caja), el desembolso en efectivo desde la caja por cajero (055) y el alcance por sucursal en clientes con acceso especial (059). El editor de plantillas (P76) queda para la fase 8 junto con los documentos legales; la vista previa de productos sin guardar queda anotada como mejora (la división del paquete del frontend se hizo en el double check del 07/10/2026, decisiones 061–062).
>
> **Segundo double check de las fases 1–3 (07/10/2026, decisiones 061–064).** Se corrigió y completó: aislamiento con dos barreras reales (ORM + RLS) y rechazo de roles que ignoran RLS; sesión de 30 min/12 h, bloqueo tras 5 intentos, recuperación de contraseña (P03) y sesiones abiertas visibles en «Mi cuenta» (doc 06 §6); idempotencia del desembolso ante doble clic simultáneo; totales de préstamos sobre todo el filtro; listas paginadas; avisos para toda acción fallida; un error anidado que tumbaba la pantalla de garantías; interfaz de archivos de garantía; datos de demostración (`seed_demo`), pruebas de extremo a extremo y unitarias del frontend en la CI, `pip-audit`, `pnpm audit` y Dependabot.
>
> **Del doc 06 §6–§8 quedan, con su fase:** reconfirmación con 2FA en acciones críticas (hecha para autorizar reversos en la fase 4; castigo en la 8, cambio de roles y límites al construir esa pantalla), aviso por correo de acceso desde un dispositivo nuevo (fase 9, comunicación) y cabeceras CSP/`Permissions-Policy` más el admin de Django restringido por IP (fase 10, endurecimiento). El horario de cajeros y cobradores (035) quedó hecho en la fase 4 (decisión 071).
>
> **Fase 2 aceptada el 05/10/2026.** F1 y F2 completos: clientes persona/empresa con validación de cédula (Luhn) y flujo anti-duplicados, expediente (laborales/negocio, familiares, referencias verificadas), archivos privados con validación por contenido, descargas auditadas y enlaces de 5 minutos (clientes y garantías), garantías con detalle de vehículo/inmueble, y búsqueda global Ctrl+K. Pendiente trasladado: catálogo de municipios/sectores con la fuente oficial (ONE). La interfaz de archivos de garantía y las pruebas Playwright de extremo a extremo quedaron hechas el 07/10/2026 (decisión 063).
>
> **Fase 1 aceptada el 05/10/2026.** Criterios verificados: aislamiento entre empresas garantizado por RLS (pruebas de cruce en verde con rol de base de datos sin privilegios), registro → prueba → suspensión → activación de punta a punta en interfaz, invitaciones F17 completas, 2FA activable desde «Mi cuenta» y obligatorio mediante `REQUIRE_MFA` (encendido por defecto en producción, decisión 034). La matriz fina de permisos por módulo se va aplicando en la fase de cada módulo. CI en GitHub Actions en verde.

## 2. Estrategia de pruebas

| Nivel | Qué prueba | Herramienta |
| --- | --- | --- |
| Motor financiero | E1–E15 exactos, más miles de casos aleatorios (sumas que cierran, residuo en la última cuota, mora con tope) | pytest + Hypothesis |
| Servicios y API | Cada flujo con sus validaciones y excepciones; idempotencia (doble clic no duplica) | pytest-django + factory-boy |
| Permisos | La matriz completa del paso 6 por rol, **incluidos IDs de otra sucursal y de otra empresa** | prueba parametrizada que recorre la matriz |
| Aislamiento (RLS) | Con RLS activo, una sesión sin empresa no ve filas; una sesión de la empresa A no ve nada de la B, ni con SQL directo | pruebas sobre la conexión real |
| Integridad | Las reglas §7 del paso 5 rechazan datos corruptos aunque el código intente escribirlos | pruebas de constraint |
| Documentos | Cada plantilla genera el PDF esperado con un expediente de referencia (archivos dorados) | comparación de texto extraído |
| Interfaz | Componentes críticos (cobro, desglose, formularios) | Vitest + Testing Library |
| Extremo a extremo | El recorrido de cada demo de fase: registro de empresa → … → cierre de caja | Playwright |
| Carga (fase 10) | 30 usuarios concurrentes por empresa, cobros simultáneos al mismo préstamo | Locust |

La CI corre estilo, tipos, pruebas y compilación en cada cambio; nada entra a `main` en rojo. Cada fase deja sus pruebas y protege a las anteriores.

## 3. Entornos, despliegue y operación

- **Local:** Docker Compose con datos ficticios generados por comando (incluye dos empresas de prueba para el aislamiento).
- **Pruebas (staging):** un VPS pequeño, `staging.cobradia.com`, se actualiza con cada cierre de fase; ahí se hacen las demos.
- **Producción:** `app.cobradia.com` en un VPS (proveedor se decide en la fase 10; requisito: respaldos externos y snapshots). Caddy con HTTPS, Gunicorn, workers de Celery y PostgreSQL con `pg_dump` diario cifrado fuera del servidor; restauración ensayada cada mes.
- **Despliegue:** por etiqueta de versión desde CI; migraciones siempre compatibles hacia adelante (desplegar no interrumpe la operación); rollback = etiqueta anterior + restauración si hiciera falta.
- **Monitoreo:** Sentry (errores), chequeo de salud externo con aviso al dueño, y la conciliación nocturna como alarma de negocio.
- **Secretos:** variables de entorno gestionadas fuera del repositorio; rotación documentada.

## 4. Criterios de lanzamiento (fase 10)

Los seis del paso 02 §8, más los del alcance SaaS:

1. Recorrido completo aprobado por el primer cliente y migración de su cartera cuadrada.
2. E1–E15 y la matriz de permisos en verde; cero diferencias sin explicar entre pagos, caja y cartera.
3. Pruebas de aislamiento entre empresas en verde, con RLS activo en producción.
4. Registro público probado de punta a punta (alta → prueba → aviso → suspensión → activación).
5. Plantillas legales validadas por el abogado del primer cliente; términos de servicio y aviso de privacidad de Cobradía validados por el abogado del dueño (Ley 172-13). **Validar**.
6. Planes, precios y límites cargados (PT3); recibo de suscripción definido con el contador. **Validar**.
7. Respaldo y restauración probados; plan de respuesta a incidentes escrito.
8. Escaneo OWASP ZAP sin hallazgos altos y revisión manual de seguridad hecha.

## 5. Convenciones de trabajo

- **Git:** `main` protegida y siempre desplegable; ramas `feature/…` cortas; commits en inglés (decisión 010) con descripción clara; revisión antes de integrar.
- **Documentación viva:** si la construcción contradice un documento de esta carpeta, se actualiza el documento primero (regla de la Fase 0) y la decisión va al [registro](decisiones.md).
- **Versiones:** `v<fase>.<entrega>` durante la construcción (v1.0 = cierre de Fase 1); `CHANGELOG.md` por fase.
- **Datos ficticios:** el comando de datos de ejemplo se mantiene toda la vida del proyecto; staging nunca tiene datos reales salvo la migración ensayada del primer cliente (anonimizada si se comparte pantalla).

## 6. Nota comercial pendiente

La propuesta al primer cliente (decisión 040: desarrollo Completa/Esencial + mensualidad) se redactó antes del giro a SaaS (041). Hay que decidir si se mantiene como proyecto de desarrollo pagado, o si el primer cliente pasa a ser **el primer suscriptor** (con condiciones de fundador). No se bloquea la construcción, pero conviene resolverlo antes de presentarle la propuesta.

## 7. Decisiones de este paso

| # | Decisión | Estado |
| --- | --- | --- |
| 050 | Plan de construcción: fases y criterios (§1), estrategia de pruebas (§2), entornos y operación (§3), criterios de lanzamiento (§4) y convenciones (§5) | Aprobada |
