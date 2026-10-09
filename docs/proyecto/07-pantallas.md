# 07 · Mapa de pantallas y wireframes

**Estado:** aprobado el 04/10/2026 (decisiones 037–039) · ese mismo día se actualizó al alcance multitenant de Cobradía: se añaden el registro público, la pantalla de suscripción y el panel de plataforma del dueño (decisiones 041, 045 y 046).

Este documento es el inventario de **todas** las pantallas del sistema: qué muestran, qué permiten hacer, quién las usa y en qué fase se construyen. Los permisos exactos están en el [paso 6](06-seguridad-y-permisos.md#3-matriz-de-permisos-por-rol). Las pantallas clave se dibujan en el prototipo navegable (§6).

## 1. Definiciones (aprobadas)

| # | Definición |
| --- | --- |
| 037 | **Wireframes:** un prototipo navegable en HTML, en una página privada que se puede compartir con el cliente, más este inventario en el repositorio |
| 038 | **Navegación:**<br>- En escritorio, un menú lateral plegable con los 6 grupos y una barra superior con la búsqueda (Ctrl+K), la sucursal, los avisos y el usuario.<br>- En el celular, una barra inferior con las 4 acciones más usadas. |

## 2. Estructura común

```text
┌──────────────┬──────────────────────────────────────────────────────┐
│ ◆ Cobradía   │ [🔍 Buscar cliente, cédula, préstamo…  Ctrl+K]  Sucursal ▾  🔔 3  ✓ 2  JE ▾ │
│              ├──────────────────────────────────────────────────────┤
│ Inicio       │ Inicio › Clientes › María Gómez           [Acción principal] │
│ Operación  ▾ │                                                      │
│   Clientes   │   Contenido de la pantalla                           │
│   Solicitudes│                                                      │
│   Préstamos  │                                                      │
│   Cobrar     │                                                      │
│ Cobranza   ▸ │                                                      │
│ Finanzas   ▸ │                                                      │
│ Reportes   ▸ │                                                      │
│ Ajustes    ▸ │                                                      │
│ «            │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

- **Barra superior:**
  - Búsqueda global (Ctrl+K), que abre una paleta con clientes, préstamos y acciones rápidas: *Cobrar*, *Nuevo cliente*, *Nueva solicitud*, *Abrir caja*.
  - Selector de sucursal, solo para quien tiene varias.
  - Avisos (🔔) y autorizaciones pendientes (✓).
  - Menú del usuario: perfil, 2FA, sesiones, tema claro u oscuro, salir.
- **Encabezado de cada pantalla:**
  - Migas de pan, el título y **una** acción principal, siempre a la derecha.
  - Las acciones secundarias van en un menú «Más».
- **Menú lateral:** muestra solo lo que el rol puede usar y se pliega a íconos con «.
- **Celular:**
  - El menú lateral pasa a una barra inferior.
  - Oficina: **Inicio · Buscar · Cobrar · Más**.
  - Cobrador: **Mi ruta · Buscar · Cobrar · Más**.
- **Direcciones en español:** por ejemplo, `/prestamos/SD-000125` o `/clientes/…`. Son legibles y los filtros van en la dirección (decisión 003).

## 3. Pantallas del sistema interno

### Acceso y cuenta

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P01 | Iniciar sesión | `/entrar` | Correo y contraseña, luego el código 2FA; «Olvidé mi contraseña» | Todos | 1 |
| P02 | Aceptar invitación | `/invitacion/:codigo` | Crear contraseña, activar 2FA con QR, códigos de respaldo; el cobrador acepta el seguimiento de ubicación (031) | Invitados | 1 |
| P03 | Recuperar contraseña | `/recuperar` | Enlace por correo | Todos | 1 |
| P04 | Mi cuenta | `/cuenta` | Perfil, 2FA, códigos de respaldo, sesiones abiertas, tema | Todos | 1 |
| P05 | Registro de empresa | `/registro` (pública) | Datos de la financiera y de quien se registra, verificación del correo con código, y creación de la empresa en prueba con su sucursal, su administrador y sus catálogos sembrados (F19) | Visitantes | 1 |

### Inicio

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P10 | Tablero | `/` | Varía según el rol (ver abajo) | Todos | 7; en la 1, una versión mínima |
| P11 | Avisos y autorizaciones | `/avisos` | Bandeja de avisos y de solicitudes de autorización: aprobar o rechazar con nota | Todos | 1 |

**Qué muestra el tablero a cada rol:**
- **Gerente:**
  - Cartera activa.
  - Cobrado hoy frente a lo esperado.
  - Mora por tramos y cartera en riesgo a más de 30 días (PAR30).
  - Desembolsos del mes, cajas abiertas y alertas antifraude.
- **Supervisor:**
  - Lo mismo que el gerente, para su sucursal.
  - Solicitudes por aprobar, cierres por aprobar y avance de las rutas.
- **Oficial:**
  - Sus solicitudes por estado.
  - Sus clientes con vencimientos próximos.
- **Cajero:**
  - Su caja.
  - Desembolsos pendientes y rendiciones por recibir.
- **Cobrador:** va directo a «Mi ruta».
- **Contabilidad:** saldos de las cuentas, cuentas por pagar que vencen y conciliaciones pendientes.

### Operación

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P20 | Clientes | `/clientes` | Tabla con búsqueda y filtros (sucursal, estado, oficial, clasificación, con atraso) · *Nuevo cliente* | G Su O Ca Ct Au | 2 |
| P21 | Nuevo cliente | `/clientes/nuevo` | Asistente: tipo → documento (con detección de duplicados) → datos → dirección → laborales o negocio → referencias → archivos → consentimiento | G Su O | 2 |
| P22 | Ficha del cliente | `/clientes/:id` | **Encabezado:** nombre, documento enmascarado, estado, clasificación, saldo total y atraso<br>**Pestañas:** Resumen, Datos, Laborales o Negocio, Familiares y referencias, Garantías, Archivos, Préstamos y solicitudes, Pagos, Gestiones y Cronología<br>**Acciones:** *Nueva solicitud*, *Cobrar*, *Bloquear*, *Editar* | G Su O Ca Ct Au; Co (lo propio) | 2 |
| P23 | Garantías | `/garantias` | Tabla de bienes por tipo y estado | G Su O | 2 |
| P24 | Ficha del bien | `/garantias/:id` | Datos del vehículo o del inmueble, fotos, documentos, tasación, préstamos que respalda y estado | G Su O | 2 |
| P25 | Simulador | `/simulador` | Cotización rápida para quien pregunta en mostrador: producto, monto, plazo y frecuencia → cuota, tasas equivalentes, tabla y cotización imprimible | G Su O Ca | 3 |
| P26 | Solicitudes | `/solicitudes` | Pestañas: Mis borradores · En evaluación · **Por aprobar** · Aprobadas por desembolsar · Rechazadas · Todas | G Su O | 3 |
| P27 | Solicitud (editor) | `/solicitudes/:id` | Pasos: cliente y producto → condiciones con **simulador en vivo** → evaluación (presupuesto, buró, referencias, documentos) → garantes y garantías → resumen · *Enviar a aprobación* | G Su O | 3 |
| P28 | Revisión y decisión | `/solicitudes/:id/decision` | Resumen de la evaluación y alertas (capacidad mayor al 40 %, cliente bloqueado, cobertura insuficiente, buró) · *Aprobar*, *Ajustar y aprobar*, *Devolver*, *Rechazar* | G Su (nunca lo propio) | 3 |
| P29 | Por desembolsar | `/desembolsos` | Bandeja de solicitudes aprobadas y vigentes | G Ca Ct | 3 |
| P30 | Desembolso | `/desembolsos/:id` | Lista de verificación (identidad, pagaré y tabla impresos y firmados), origen (caja o banco), bruto, cargos, **neto a entregar**, primera fecha · *Desembolsar* | G Ca Ct | 3 |
| P31 | Préstamos | `/prestamos` | Tabla con filtros (estado, condición, tramo, cobrador, producto, sucursal) y totales que respetan los filtros | Todos menos A; Co (lo propio) | 3 |
| P32 | Expediente del préstamo | `/prestamos/:numero` | **Encabezado:** número, cliente, estado y condición, saldo, atraso, próximo vencimiento<br>**Pestañas:** Resumen, Calendario (con versiones), Pagos, Mora y cargos, Garantías y garantes, Documentos, Gestiones y Cronología<br>**Acciones:** *Cobrar* · Más: carta de saldo, estado de cuenta, cambiar cobrador, cambiar fecha, reestructurar, renovar, anular, castigar, enviar a legal | Según la matriz | 3 |
| P33 | Cobrar | `/cobrar/:numero` | Lo exigible hoy; accesos rápidos (vencido, cuota actual, liquidar, monto libre, abono a capital); monto y medio; **desglose y saldo posterior**; recibido y cambio; condonar con autorización · *Confirmar cobro* | G Su Ca; Co (lo propio) | 4 |
| P34 | Recibo | `/recibos/:numero` | Vista del recibo · *Imprimir hoja*, *Imprimir térmico*, *Enviar por WhatsApp*, *Reversar o corregir* | G Su Ca O; Co (lo propio) | 4 |
| P35 | Reversar o corregir | Diálogo sobre P34 | Motivo, efecto en las cuotas, la caja y el saldo; pedir autorización | G Su Ca | 4 |
| P36 | Carta de saldo | Diálogo sobre P32 | Fecha de cálculo, desglose, válida hasta · *Generar PDF* | G Su O Ca | 4 |

### Cobranza

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P40 | Mi ruta (celular) | `/ruta` | **Avance:** cobrado, visitas hechas y pendientes<br>**Vista:** lista o mapa<br>**Tarjeta de cada cliente:** cuota, atraso, dirección, *Llamar*, *WhatsApp*, *Cómo llegar*, *Cobrar*, *Gestión*<br>*Cerrar ruta* muestra el resumen para la rendición | Co | 4 |
| P41 | Cobro en ruta | `/ruta/cobrar/:numero` | El P33 simplificado para el celular: montos grandes y confirmación · luego *Enviar recibo por WhatsApp* | Co | 4 |
| P42 | Registrar gestión | Hoja inferior en el celular, o diálogo | Tipo, resultado, nota; promesa con fecha y monto | Co O Su G | 5 |
| P43 | Atrasos | `/atrasos` | Pestañas por tramo con totales; asignar gestor; acciones rápidas (llamar, gestión, promesa); exportar | G Su O Ct Au | 4 y 5 |
| P44 | Agenda de cobranza | `/cobranza` | Promesas que vencen hoy, incumplidas y seguimientos programados | G Su O Co | 5 |
| P45 | Rutas | `/rutas` | Asignación de cartera por cobrador, avance del día, **mapa de ubicación** (031), rendiciones pendientes | G Su | 4 |
| P46 | Casos legales | `/legal` | Tabla y ficha de cada caso: abogado, alguacil, documentos, costas y estado | G | 8 |

> **Construidas en la fase 6 (decisiones 080–085):**
> - **P54 Gastos e ingresos:** tabla con filtros y totales, alta con comprobante, NCF y RNC, y un detalle con aprobación, anulación, archivos e historial. El «gasto menor» se registra desde P50.
> - **P55 Cuentas por pagar:** abiertas, vencidas, próximas, pagadas y canceladas; alta única o recurrente; pagar y cancelar.
> - **P56 Contabilidad:** plan de cuentas, diario, mayor, balanza, resultados y balance (imprimibles), conciliación bancaria y cierre de mes; el ajuste contable es del gerente.
> - **P61 Resultados:** lo cobrado menos los gastos operativos, por mes, con castigos y movimientos del dueño aparte.
> - **Comprobantes fiscales** (`/comprobantes`, pantalla nueva): la cola por emitir y el registro del e-NCF, con las exportaciones 606, 607 y de pendientes.
> - **Diferencias de caja** en P52 y en «Mi caja», y la casilla de ITBIS en los cargos del producto (P74).
>
> **Construidas en la fase 5 (decisiones 076–079):**
> - **P42:** el diálogo de gestión, igual en el préstamo, en Atrasos, en la agenda y como hoja inferior en «Mi ruta».
> - **P43:** gestor, promesa pendiente y última gestión en cada fila; filtros «Mis préstamos» y con o sin promesa; selección para asignar gestor.
> - **P44:** Agenda en `/cobranza`, con «Hoy», «Incumplidas en los últimos 7 días» y «Próximos 7 días»; «Mías» o «De la sucursal» para el supervisor y el gerente; el cumplimiento de promesas del mes.
> - **Préstamo y cliente:** el historial de cobranza en la pestaña Gestiones del préstamo y en la nueva pestaña Cobranza del cliente.
> - **Ajustes y tablero:** el escalamiento en Ajustes → Empresa; el mosaico «Agenda de hoy» en el inicio y el contador en el menú.
>
> **Construidas en la fase 4 (decisiones 065–074):** P11 (avisos y autorizaciones, con la campana de la barra superior), P33–P36, P40–P41 (P41 es la misma P33 adaptada al celular del cobrador), P43 (tramos con totales; asignar gestor, gestiones y promesas: fase 5), P45 (avance, mapa de ubicación registrado, horario y asignación de cartera desde Préstamos), P50–P52 y la página pública del recibo de WhatsApp (`/r/:token`). En el celular, la barra inferior quedó como dice la §2: oficina «Inicio · Caja · Buscar · Cobrar · Más» y cobrador «Mi ruta · Buscar · Cobrar · Más».

### Finanzas

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P50 | Mi caja | `/caja` | Sin caja abierta: *Abrir caja* con el fondo inicial<br>Con caja abierta: esperado por medio de pago, movimientos del día; *Recibir rendición*, *Depositar o trasladar*, *Gasto menor* y *Arqueo y cierre* | Ca Su | 4 |
| P51 | Arqueo y cierre | `/caja/cierre` | Conteo por denominación, esperado frente a contado, diferencia y motivo · *Cerrar caja* → PDF | Ca Su | 4 |
| P52 | Cajas de la sucursal | `/cajas` | Sesiones abiertas y cerradas, **cierres por aprobar**, historial | G Su Ct Au | 4 |
| P53 | Cuentas y bancos | `/cuentas` | Saldos; detalle con movimientos; *Transferir*, *Ajuste* (con motivo) | G Ct | 3 |
| P54 | Gastos e ingresos | `/gastos` | Tabla, nuevo gasto o ingreso con comprobante y NCF, detalle con historial | G Su Ca Ct | 6 |
| P55 | Cuentas por pagar | `/cuentas-por-pagar` | Abiertas, parciales y vencidas; nueva (única o recurrente); *Pagar* (total o parcial) | G Ct | 6 |
| P56 | Contabilidad | `/contabilidad` | Plan de cuentas, libro diario, mayor, estado de resultados, balance, conciliación bancaria y **cierre de mes** | G Ct Au | 6 |

### Reportes

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P60 | Cartera | `/reportes/cartera` | Indicadores con su definición y fecha de corte, antigüedad, PAR30, cortes por sucursal, cobrador y producto | G Su Ct Au | 7 |
| P61 | Resultados | `/reportes/resultados` | Intereses, mora y cargos cobrados menos gastos operativos; movimientos del dueño aparte | G Ct Au | 6 |
| P62 | Clasificación de clientes | `/reportes/clasificacion` | Puntuación, grado y **por qué** | G Su O Au | 7 |
| P63 | Comisiones | `/reportes/comisiones` | Cálculo del período por empleado; aprobar | G Ct | 7 |
| P64 | Centro de reportes | `/reportes` | Catálogo de reportes (cobros, desembolsos, caja, atrasos, gestiones, promesas…) con filtros, PDF y Excel; «Mis exportaciones» | Según la matriz | 7 |

### Ajustes

| # | Pantalla | Ruta | Contenido y acciones | Roles | Fase |
| --- | --- | --- | --- | --- | --- |
| P70 | Empresa | `/ajustes/empresa` | Datos legales y logo, con vista previa del encabezado de los documentos; valores de operación (vigencia de solicitudes, alerta de capacidad, límite de efectivo del cobrador y tope de costo anual efectivo, decisión 075) | G A (Ct Au leen) | 1 (hecha en la validación 075) |
| P71 | Sucursales | `/ajustes/sucursales` | Código y prefijo, dirección, **horario** (035) | G A | 1 |
| P72 | Usuarios | `/ajustes/usuarios` | Invitar; roles por sucursal; límites; sesiones; restablecer 2FA; desactivar | G A | 1 |
| P73 | Roles y permisos | `/ajustes/roles` | Matriz editable con plantillas | G A | 1 |
| P74 | Productos | `/ajustes/productos` | Lista y editor, con **vista previa de un préstamo de ejemplo** al cambiar parámetros | G A | 3 |
| P75 | Mora, cargos, feriados y numeraciones | `/ajustes/…` | Una pantalla para cada uno | G A | 3 |
| P76 | Plantillas de documentos | `/ajustes/plantillas` | Editor con vista previa real y estado de validación legal | G A | 3 y 8 |
| P77 | Catálogos | `/ajustes/catalogos` | Motivos, categorías y geografía | G A | 2 |
| P78 | Profesionales legales | `/ajustes/legales` | Abogados, notarios, alguaciles y testigos | G A | 8 |
| P79 | Alertas antifraude | `/ajustes/alertas` | Reglas y umbrales | G | 7 |
| P80 | Mensajería | `/ajustes/mensajes` | Proveedor, plantillas y registro de envíos | G A | 9 |
| P81 | Auditoría | `/ajustes/auditoria` | Visor con filtros por usuario, fecha, módulo y acción | G A Au | 1 |
| P82 | Migración | `/ajustes/migracion` | Subir las plantillas de Excel, ver el reporte de errores, cuadre y confirmación | G A | 3 y 10 |
| P83 | Suscripción | `/ajustes/suscripcion` | Estado de la prueba o del plan, días restantes, datos para pagar (transferencia o depósito), historial de pagos y avisos de modo soporte activo (F19, 045 y 046) | G A | 1 |

### Plataforma (solo el dueño de Cobradía)

Rutas bajo `/plataforma`, visibles únicamente para la cuenta de plataforma (`is_platform_admin`); ninguna empresa las ve.

| # | Pantalla | Ruta | Contenido y acciones | Fase |
| --- | --- | --- | --- | --- |
| PT1 | Empresas | `/plataforma/empresas` | Tabla por estado (en prueba, activa, suspendida, cerrada) con días de prueba y último pago · Ficha: datos, sucursales y usuarios (conteos), *Registrar pago*, *Suspender* o *Reactivar* con motivo, *Modo soporte* | 1 |
| PT2 | Tablero de la plataforma | `/plataforma` | Empresas activas y en prueba, conversión de la prueba, registros recientes, pagos por vencer y métricas agregadas de uso | 7 |
| PT3 | Planes | `/plataforma/planes` | Planes con precio y límites (usuarios, sucursales, préstamos activos); asignación por empresa | 10 |
| PT4 | Modo soporte | Desde la ficha de la empresa | Motivo y duración; acceso de solo lectura, visible para la empresa y auditado (046) | 7 |

## 4. Pantallas fuera del sistema interno

| # | Pantalla | Ruta | Contenido | Fase |
| --- | --- | --- | --- | --- |
| P90 | Recibo compartido | `/r/:token` | El recibo que llega por WhatsApp, sin iniciar sesión y con datos mínimos (024) | 4 |
| P91 | Verificar documento | `/v/:token` | Confirma que un recibo o una carta es auténtico (QR) | 9 |
| P92 | Portal del cliente: acceso | `/portal/entrar` | Invitación y código de un solo uso | 9 |
| P93 | Portal del cliente: inicio | `/portal` | Sus préstamos, próximo pago, calendario, recibos y estado de cuenta | 9 |

## 5. Patrones de interfaz

| Patrón | Regla |
| --- | --- |
| Tablas | Búsqueda, filtros en la dirección, columnas configurables, paginación del servidor, totales que respetan los filtros y exportación con los mismos filtros |
| Formularios | Validación mientras se escribe, errores junto al campo, borrador automático en los largos (cliente, solicitud) y atajos de teclado (Enter para confirmar, Esc para cancelar) |
| Confirmación | Las acciones de dinero muestran el efecto antes de confirmar; las destructivas piden motivo y, si hace falta, autorización (§4 del paso 6) |
| Estados | Una insignia de color con texto para cada estado (al día, en atraso con sus días, en gestión, legal, saldado, castigado) |
| Pantallas vacías | Explican qué hacer y ofrecen la acción, por ejemplo: «Aún no hay solicitudes · Crear solicitud» |
| Carga y errores | Esqueletos de carga; mensajes de error comprensibles, con la opción de reintentar |
| Celular | Botones de al menos 44 px, montos grandes, hojas inferiores en lugar de diálogos, y teclado numérico en los montos |

## 6. Prototipo navegable (decisión 037)

El prototipo muestra, con datos ficticios, el recorrido principal y las pantallas donde más se trabaja:

| Pantalla | Por qué está en el prototipo |
| --- | --- |
| P10 Tablero (gerente) | La primera impresión del sistema |
| Búsqueda global (Ctrl+K) | La navegación más rápida |
| P22 Ficha del cliente | El centro de la operación |
| P27 Solicitud con simulador | La originación |
| P28 Revisión y decisión | La aprobación por límites |
| P32 Expediente del préstamo | Entender cualquier saldo |
| P33 Cobrar y P34 Recibo | La operación más repetida |
| P50 Mi caja y P51 Arqueo y cierre | El control del efectivo |
| P40 Mi ruta y P41 Cobro en ruta (celular) | El trabajo del cobrador |
| P43 Atrasos | La cobranza |

**Demo para el cliente (30/09/2026):** enlace público [jonasjavier.github.io/demo-prestamos](https://jonasjavier.github.io/demo-prestamos/), publicado con GitHub Pages desde el repositorio público `JonasJavier/demo-prestamos`, que contiene solo la demo y no se indexa en buscadores. Hay una copia privada en Claude: [Demo Sistema de Préstamos](https://claude.ai/artifact/L2HA2JGDX4T2Spk3saYvWa). Es una aplicación web navegable que abre directamente en el sistema: el visitante elige un rol (gerente, cajera, oficial, cobrador o cliente) o sigue el recorrido guiado de 12 pasos. Usa el motor de cálculo de [03](03-reglas-de-negocio.md) con datos ficticios y no guarda nada. Copia independiente, para alojarla en cualquier servidor estático: [`docs/prototipo/demo/index.html`](../prototipo/demo/index.html).

**Lienzo de diseño anterior:** [Prototipo · Sistema de préstamos](https://claude.ai/artifact/WkkGvktguVUGjMsXhrKREv), las 13 pantallas estáticas que sirvieron de base.

**Qué contiene:**
- 13 pantallas y 2 componentes compartidos (menú lateral y barra superior), con datos ficticios.
- Los importes cuadran con las reglas del paso 3, por ejemplo la cuota de 5,641.00, la mora de 122.00 y el cambio de 237.00.
- El recorrido sugerido es Tablero → Buscar → Ficha → Cobrar → Recibo → Mi caja → Arqueo y cierre.

El resto de las pantallas siguen los mismos patrones y se dibujan durante la construcción de su fase.

## 7. Decisiones de este paso

| # | Decisión | Estado |
| --- | --- | --- |
| 037 | Wireframes como prototipo navegable en HTML, más este inventario | Aprobada |
| 038 | Menú lateral plegable, barra superior con búsqueda, y barra inferior en el celular | Aprobada |
| 039 | Inventario de pantallas, rutas en español y patrones de interfaz de este documento | Aprobada |
| 045–046 | Pantallas nuevas del alcance SaaS: P05 Registro, P83 Suscripción y el panel de plataforma PT1–PT4 | Aprobada |
