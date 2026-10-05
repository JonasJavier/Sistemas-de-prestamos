# Registro de decisiones

Cada decisión del proyecto, con su estado. Los estados posibles son:
- **Propuesta:** escrita, falta el visto bueno.
- **Aprobada:** cerrada.
- **Reemplazada:** sustituida por otra decisión, que se indica.

| # | Fecha | Decisión | Estado | Detalle |
| --- | --- | --- | --- | --- |
| 000 | 28/09/2026 | Sistema para una sola compañía con varias sucursales; sin multiempresa, licencias ni planes | Reemplazada por 041 | Pedido explícito del dueño del producto |
| 001 | 28/09/2026 | Django 6.1 ahora y 6.2 LTS cuando salga (plan B: 5.2 LTS) | Aprobada | [01 · D1](01-stack-y-arquitectura.md#d1-django-61-ahora-y-62-lts-cuando-salga) |
| 002 | 28/09/2026 | Frontend SPA con React 19 + Vite 8 + TypeScript, no Next.js | Aprobada | [01 · D2](01-stack-y-arquitectura.md#d2-spa-con-react--vite-no-nextjs) |
| 003 | 28/09/2026 | TanStack Router, con filtros tipados en la URL | Aprobada | [01 · D3](01-stack-y-arquitectura.md#d3-tanstack-router-no-react-router) |
| 004 | 28/09/2026 | Sesión por cookie segura + CSRF + 2FA (allauth *headless*), sin JWT | Aprobada | [01 · D4](01-stack-y-arquitectura.md#d4-sesión-por-cookie-no-jwt) |
| 005 | 28/09/2026 | Celery + Celery Beat + Redis para tareas en segundo plano | Aprobada | [01 · D5](01-stack-y-arquitectura.md#d5-celery-no-el-marco-de-tareas-nuevo-de-django) |
| 006 | 28/09/2026 | Tailwind CSS 4 + shadcn/ui (Radix) | Aprobada | [01 · D6](01-stack-y-arquitectura.md#d6-tailwind--shadcnui-no-mui-ni-ant-design) |
| 007 | 28/09/2026 | Auditoría con django-pghistory | Aprobada | [01 · D7](01-stack-y-arquitectura.md#d7-django-pghistory-no-django-simple-history) |
| 008 | 28/09/2026 | Redis 8 (Valkey como reemplazo directo) | Aprobada | [01 · D8](01-stack-y-arquitectura.md#d8-redis-8) |
| 009 | 28/09/2026 | Monorepo: `backend/`, `frontend/`, `infra/`, `docs/` | Aprobada | [01 · D9](01-stack-y-arquitectura.md#d9-monorepo) |
| 010 | 28/09/2026 | Código en inglés; interfaz y documentación en español | Aprobada | [01 · D10](01-stack-y-arquitectura.md#d10-código-en-inglés-producto-en-español) |
| 011 | 28/09/2026 | Python 3.14, PostgreSQL 18, libro de movimientos inmutable y motor financiero en Python puro | Aprobada | [01 · §2 y §4](01-stack-y-arquitectura.md#4-arquitectura-base) |
| 012 | 28/09/2026 | Compañía mediana: 2–5 sucursales, 5–30 usuarios, cobradores en ruta | Aprobada | [02 · §2](02-vision-y-alcance.md#2-perfil-de-cada-empresa-cliente-aprobado) |
| 013 | 28/09/2026 | Cuatro tipos de préstamo: personal, vehículo, hipotecario y microcrédito | Aprobada | [02 · §2](02-vision-y-alcance.md#2-perfil-de-cada-empresa-cliente-aprobado) |
| 014 | 28/09/2026 | Cobrador: web del celular (fase 4) y app sin conexión (fase 9), ambas antes del lanzamiento | Reemplazada por 028 | [02 · §2](02-vision-y-alcance.md#2-perfil-de-cada-empresa-cliente-aprobado) |
| 015 | 28/09/2026 | Documentos legales: los redactamos nosotros y el cliente los valida con su abogado antes del lanzamiento | Aprobada | [02 · §2](02-vision-y-alcance.md#2-perfil-de-cada-empresa-cliente-aprobado) |
| 016 | 28/09/2026 | Sin MVP: versión completa en 10 fases internas, con demostración por fase y un solo lanzamiento | Aprobada | [02 · §8](02-vision-y-alcance.md#8-estrategia-de-construcción-y-lanzamiento-aprobada) |
| 017 | 28/09/2026 | Módulos nuevos: garantías, tablero, búsqueda global, caja por cajero, Mi ruta, gestiones y promesas, portal del cliente | Aprobada | [02 · §5](02-vision-y-alcance.md#5-mapa-de-módulos) |
| 018 | 28/09/2026 | Ajustes en el menú principal; navegación en seis grupos | Aprobada | [02 · §5](02-vision-y-alcance.md#5-mapa-de-módulos) |
| 019 | 28/09/2026 | Clientes personas (cédula) y empresas (RNC) | Aprobada | [02 · §5](02-vision-y-alcance.md#operación) |
| 020 | 28/09/2026 | Orden de fases por dependencias, decidido por el responsable técnico | Aprobada | [02 · §8](02-vision-y-alcance.md#8-estrategia-de-construcción-y-lanzamiento-aprobada) |
| 021 | 28/09/2026 | Reglas de negocio: las propone el responsable técnico con base en la práctica dominicana y la referencia; el cliente las valida | Aprobada | [03 · Reglas](03-reglas-de-negocio.md) |
| 022 | 28/09/2026 | Reglas de negocio del paso 3 aprobadas como base: 5 métodos, mora prorrateada con gracia y tope, orden estándar de pagos, conciliación exacta y 15 ejemplos que serán pruebas. Valores por defecto sujetos a validación del cliente | Aprobada | [03 · §15](03-reglas-de-negocio.md#15-lista-para-validar-con-el-cliente) |
| 023 | 28/09/2026 | Aprobación de solicitudes por límites de rol; nadie aprueba lo que creó | Aprobada | [04 · §1](04-flujos.md#1-definiciones-de-operación-aprobadas) |
| 024 | 28/09/2026 | Recibo del cobro en ruta: enlace seguro por WhatsApp; impresión térmica solo en oficina | Aprobada | [04 · F6](04-flujos.md#f6--cobro-en-ruta-y-rendición) |
| 025 | 28/09/2026 | Cierre de caja y rendición de cobradores diarios y obligatorios | Aprobada | [04 · F7](04-flujos.md#f7--caja-diaria) |
| 026 | 28/09/2026 | Buró externo (DataCrédito o TransUnion): reporte adjunto a la solicitud | Aprobada | [04 · F3](04-flujos.md#f3--solicitud-evaluación-y-decisión) |
| 027 | 28/09/2026 | Los 18 flujos del paso 4 con sus valores por defecto | Aprobada | [04 · Flujos](04-flujos.md) |
| 028 | 28/09/2026 | Solo aplicación web adaptada al celular, con internet y acceso directo; sin app móvil ni modo sin conexión | Aprobada | [02 · §2](02-vision-y-alcance.md#2-perfil-de-cada-empresa-cliente-aprobado) |
| 029 | 28/09/2026 | Solo pesos (RD$), con la moneda guardada en cada importe para activar US$ sin migrar | Aprobada | [05 · §1](05-modelo-de-datos.md#1-definiciones-de-este-paso-aprobadas) |
| 030 | 28/09/2026 | Numeración de préstamos, recibos y demás documentos por sucursal con prefijo, sin saltos | Aprobada | [05 · §1](05-modelo-de-datos.md#1-definiciones-de-este-paso-aprobadas) |
| 031 | 28/09/2026 | Seguimiento continuo del cobrador mientras la ruta está abierta, con consentimiento, visible solo para supervisor y gerente, y conservado 90 días | Aprobada | [05 · §6](05-modelo-de-datos.md#6-ubicación-de-los-cobradores-decisión-031) |
| 032 | 28/09/2026 | Modelo de datos del paso 5: UUID v7, libro inmutable como fuente de saldos, calendario versionado, cachés verificadas cada noche y reglas de integridad en PostgreSQL | Aprobada | [05 · Modelo](05-modelo-de-datos.md) |
| 033 | 28/09/2026 | Cada empleado ve solo su sucursal; gerente, contabilidad y auditoría ven todas; el acceso a otra sucursal requiere permiso y queda registrado | Aprobada | [06 · §1](06-seguridad-y-permisos.md#1-definiciones-de-este-paso-aprobadas) |
| 034 | 28/09/2026 | Verificación en dos pasos (2FA) obligatoria para todos los usuarios | Aprobada | [06 · §6](06-seguridad-y-permisos.md#6-acceso-y-sesiones) |
| 035 | 28/09/2026 | Horario laboral de acceso solo para cajeros y cobradores, configurable por sucursal | Aprobada | [06 · §6](06-seguridad-y-permisos.md#6-acceso-y-sesiones) |
| 036 | 28/09/2026 | Matriz de permisos, separación de funciones, límites de ejemplo, sesiones, protección de datos, seguridad de la aplicación, auditoría y alertas antifraude del paso 6 | Aprobada | [06 · Seguridad](06-seguridad-y-permisos.md) |
| 037 | 28/09/2026 | Wireframes como prototipo navegable en HTML (página privada compartible) más el inventario de pantallas en el repositorio | Aprobada | [07 · §1](07-pantallas.md#1-definiciones-aprobadas) |
| 038 | 28/09/2026 | Menú lateral plegable con 6 grupos, barra superior con búsqueda Ctrl+K, y barra inferior en el celular | Aprobada | [07 · §2](07-pantallas.md#2-estructura-común) |
| 039 | 28/09/2026 | Inventario de pantallas, rutas en español y patrones de interfaz del paso 7 | Aprobada | [07 · Pantallas](07-pantallas.md) |
| 040 | 29/09/2026 | Propuesta comercial al cliente con dos opciones: Completa (RD$ 1,300,000, unos 6 meses) y Esencial ampliable (RD$ 650,000, unos 3 meses; ampliación RD$ 750,000); mensualidad RD$ 15,000 / 12,000; pago 30-20-20-20-10. La 016 sigue vigente si el cliente elige la Completa | Propuesta | [Propuesta (Word)](../propuesta/Propuesta-Sistema-de-Prestamos.docx) |
| 041 | 04/10/2026 | Giro a SaaS multitenant: el sistema se comercializa bajo marca propia y, más adelante, en diferentes planes; Jonas es el dueño de la plataforma. Reemplaza la 000 | Aprobada | Pedido explícito del dueño el 04/10/2026; los docs 01–07 se actualizarán a la nueva arquitectura |
| 042 | 04/10/2026 | Aislamiento de datos: una sola base PostgreSQL compartida, con el ID de la empresa en cada tabla y Row-Level Security (RLS) como segunda barrera | Aprobada | Recomendación del responsable técnico aprobada por el dueño; se detallará al actualizar el doc 01 |
| 043 | 04/10/2026 | Acceso por un solo dominio de aplicación: la empresa se resuelve por la cuenta del usuario al iniciar sesión; los subdominios por empresa quedan como opción futura | Aprobada | Recomendación del responsable técnico aprobada por el dueño; se detallará al actualizar el doc 01 |
| 044 | 04/10/2026 | Marca del sistema: **Cobradía**, con dominio sin acento `cobradia.com` (se descartan los dominios con acento/IDN); registrar también `cobradia.com.do` | Aprobada | Elegida por el dueño entre ~60 candidatos; el `.com` estaba libre el 04/10/2026 — registrarlo cuanto antes |
| 045 | 04/10/2026 | Alta de empresas por **registro público automático con período de prueba** (30 días por defecto). Al vencer la prueba, la empresa queda suspendida (solo lectura) hasta activar su suscripción. El cobro de la suscripción empieza manual (el dueño registra el pago); la pasarela de pago se integra después del lanzamiento. Los planes y sus límites se definen antes del lanzamiento | Aprobada | Elegida por el dueño el 04/10/2026; flujo en [04 · F19](04-flujos.md#f19--registro-y-ciclo-de-vida-de-una-empresa) |
| 046 | 04/10/2026 | El dueño de la plataforma ve métricas agregadas, no los datos de negocio de las empresas; el soporte usa un **modo soporte** temporal, de solo lectura, auditado y visible para la empresa | Aprobada | [06 · §10](06-seguridad-y-permisos.md#10-plataforma-y-modo-soporte-decisión-046) |
| 047 | 04/10/2026 | Identidad visual propia de Cobradía: **verde profundo + ámbar**, abandonando el morado de la referencia (riesgo de confusión con Púrpura Datos, que será competencia) | Ajustada por 052 | [08 · §2](08-sistema-de-diseno.md#2-color) |
| 048 | 04/10/2026 | Sistema de diseño: tokens, Inter con números tabulares, componentes sobre shadcn, modo oscuro desde la Fase 1 y accesibilidad WCAG 2.2 AA | Aprobada | [08 · Diseño](08-sistema-de-diseno.md) |
| 049 | 04/10/2026 | Marco documental (encabezado de la empresa, pie con folio y QR, registro de emisiones), catálogo de documentos y definiciones exactas de los indicadores | Aprobada | [09 · Documentos](09-documentos-reportes-indicadores.md) |
| 050 | 04/10/2026 | Plan de construcción: 10 fases con criterios de aceptación (30–34 semanas), estrategia de pruebas con aislamiento entre empresas, entornos, despliegue y criterios de lanzamiento | Aprobada | [10 · Plan](10-plan-de-construccion.md) |
| 051 | 04/10/2026 | **Autonomía total del responsable técnico (Claude):** decide, construye, itera y verifica sin aprobación previa, incluida la revisión de fases anteriores; pide ayuda a Jonas solo para lo que depende de él (dominio, pagos, comercial, legal). El dominio se registrará más adelante | Aprobada | Pedido explícito del dueño; ver [CLAUDE.md](../../CLAUDE.md) |
| 052 | 05/10/2026 | **Identidad definitiva:** blanco dominante con verde esmeralda como único acento (el ámbar sale de la identidad y queda solo como advertencia semántica); tema claro predeterminado. **Dos tipografías:** Sora para títulos y marca, Inter para interfaz y cifras, ambas autoalojadas | Aprobada | Pedido del dueño el 05/10/2026; [08 · Diseño](08-sistema-de-diseno.md) |
