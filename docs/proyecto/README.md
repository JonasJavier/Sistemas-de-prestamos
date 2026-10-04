# Bases del proyecto (Fase 0)

Aquí se define **Cobradía** antes de escribir código: tecnología, alcance, reglas, flujos, datos, seguridad, pantallas, diseño, documentos y plan de construcción. Todo parte del [estudio de la referencia](../referencia/README.md) y se decide paso a paso entre el responsable técnico (Claude) y el dueño del producto (Jonas).

**Cómo trabajamos:** en cada paso se escribe una propuesta con una recomendación. Se revisa y se ajusta, y la decisión queda en el [registro de decisiones](decisiones.md). Un paso queda **aprobado** cuando sus decisiones están cerradas. Si un paso posterior contradice uno anterior, se actualiza el anterior; no se dejan versiones en conflicto.

**Alcance (decisión 041, 04/10/2026):** Cobradía es un **SaaS multitenant**: muchas empresas (financieras), cada una con sus sucursales y sus datos completamente aislados. Jonas es el dueño de la plataforma y la comercializa; las empresas se registran en línea y prueban gratis (decisión 045). La financiera que originó el proyecto pasa a ser la primera empresa cliente. *(Esto reemplaza el alcance anterior de «una sola compañía», decisión 000.)*

## Pasos de la Fase 0

| Paso | Documento | Qué responde | Estado |
| --- | --- | --- | --- |
| 1 | [Stack y arquitectura](01-stack-y-arquitectura.md) | ¿Con qué se construye y cómo se organiza el código? | **Aprobado** |
| 2 | [Visión, alcance y módulos](02-vision-y-alcance.md) | ¿Qué construimos, para quién, qué mejoras y qué funciones nuevas, cómo se construye y se lanza? | **Aprobado** |
| 3 | [Reglas de negocio y motor financiero](03-reglas-de-negocio.md) | Productos, tasas, calendarios, feriados, mora, orden de aplicación de pagos, redondeo, reversos, renovación y castigo. Con ejemplos numéricos que serán pruebas automáticas | **Aprobado como base** (falta la validación del cliente) |
| 4 | [Flujos del sistema](04-flujos.md) | Recorridos de principio a fin: originación, desembolso, cobro en oficina y en ruta, caja diaria, cobranza, renovación y legal | **Aprobado** |
| 5 | [Modelo de datos y estados](05-modelo-de-datos.md) | Entidades, relaciones y ciclos de vida de la solicitud, el préstamo, la cuota, el pago y la caja | **Aprobado** |
| 6 | [Roles, permisos, seguridad y auditoría](06-seguridad-y-permisos.md) | Quién puede hacer qué, separación de funciones, 2FA y qué se audita | **Aprobado** |
| 7 | [Mapa de pantallas y *wireframes*](07-pantallas.md) | Navegación, cada pantalla y su contenido; prototipo del flujo principal | **Aprobado** |
| 8 | [Sistema de diseño](08-sistema-de-diseno.md) | Identidad de Cobradía (verde profundo y ámbar), tipografía, componentes, estados, móvil y accesibilidad | **Aprobado** |
| 9 | [Documentos, reportes e indicadores](09-documentos-reportes-indicadores.md) | Plantillas rediseñadas (pagaré, recibo, estado de cuenta, legales) y definición exacta de cada indicador | **Aprobado** |
| 10 | [Plan de construcción](10-plan-de-construccion.md) | Fases, entregables, criterios de aceptación, estrategia de pruebas, entornos, despliegue y convenciones | **Aprobado** |

**La Fase 0 se completó el 04/10/2026.** La construcción sigue el [plan del paso 10](10-plan-de-construccion.md), empezando por la Fase 1 · Cimientos.

## Fases de construcción

**No hay MVP** (decisión 016): se construye la versión completa en 10 fases internas y se lanza una sola vez. Al cierre de cada fase se hace una demostración al cliente en el entorno de pruebas. Detalle en [02 · §8](02-vision-y-alcance.md#8-estrategia-de-construcción-y-lanzamiento-aprobada); se aprueba en el paso 10.

| Fase | Qué se construye |
| --- | --- |
| 0 · Bases | Esta carpeta completa y aprobada |
| 1 · Cimientos | Repositorio, Docker, integración continua, multitenancy (empresas, RLS, registro público con prueba y panel de plataforma básico), inicio de sesión con 2FA, usuarios, roles, sucursales, ajustes, auditoría y esqueleto visual |
| 2 · Clientes y garantías | Personas y empresas, garantes, referencias, archivos privados, garantías y búsqueda global |
| 3 · Originación | Productos, motor financiero, simulador, solicitudes con aprobación, cuentas, desembolso, calendario y documentos básicos |
| 4 · Cobros y caja | Pagos, recibos, reversos, mora, liquidación, caja por cajero, Mi ruta en la web y atrasos |
| 5 · Cobranza | Gestiones, promesas de pago y bandeja de trabajo |
| 6 · Finanzas | Gastos e ingresos, cuentas por pagar, conciliación, contabilidad y resultados |
| 7 · Tablero y reportes | Tablero por rol, cartera, clasificación, comisiones y exportaciones |
| 8 · Renovación y legal | Renovación, reestructuración, castigo, contratos y documentos legales |
| 9 · Comunicación y portal | WhatsApp, SMS y correo; portal del cliente; QR de verificación |
| 10 · Aceptación y lanzamiento | Pruebas con el cliente, migración, validación legal, endurecimiento, respaldos, capacitación y salida a producción |

Documentos anteriores: el [plan de producto inicial](../PLAN_PRODUCTO.md) fue el primer borrador. Sus ideas se van incorporando a estos pasos, y donde haya diferencias, manda esta carpeta.
