# Inventario de Púrpura Datos

Observación en sesión autenticada, 28 de septiembre de 2026. Se recorrieron pantallas y flujos con registros ficticios en una cuenta de pruebas confirmada por el usuario. Se omiten datos de contacto de la cuenta. **Observado** significa visto en la interfaz; las fórmulas y reglas internas aún requieren especificación independiente. Véase [FLUJOS_VERIFICADOS.md](FLUJOS_VERIFICADOS.md). **La documentación detallada pantalla por pantalla está en [referencia/](referencia/README.md).**

| Módulo observado | Pantallas, campos y acciones visibles | Alcance propuesto |
| --- | --- | --- |
| Inicio | Menú lateral de 14 módulos; centro dominado por logotipo, sin indicadores de operación visibles. | Tablero con cartera, cobros del día, mora y tareas. |
| Consultar | Búsqueda de persona por cédula o pasaporte; ficha consolidada de cliente y préstamos con totales, atraso, último pago y calificación; impresión. | Búsqueda global en expedientes con permisos, saldos definidos y reversos diferenciados. |
| Clientes | Tabla con nombre, documento, teléfonos y email; búsqueda/paginación; alta con contacto, dirección, comentario y foto. | Expediente único, documentos, duplicados, historial y validación. |
| Préstamos | Comienza con búsqueda de cliente en tabla. | Solicitud, aprobación, desembolso, calendario, estados y expediente. |
| Pagos | Comienza con búsqueda de cliente; filtro de sucursal. | Cobro rápido por préstamo, desglose, recibo, reverso y conciliación. |
| Caja | Filtros por sucursal, fechas, usuario y ciudad; totales de monto, capital, interés, mora, ganancia, gastos, renovaciones, ingreso personal y efectivo neto; impresión. | Sesiones de caja, arqueo y cierre auditado. |
| Atrasos | Filtros de cobrable/incobrable, fechas, frecuencia, usuario, ciudad y lista de cobro; editor de listas con alta y selección de clientes; totales de atraso, capital e interés; impresión. Con cuota vencida de 250 mostró `Tiempo -3`, capital/interés atrasados 0; desapareció tras cobrarla. | Mora calculada, prioridad de gestión, listas, promesas y seguimiento. |
| Cartera | Filtros por fecha, tipo de préstamo, usuario, frecuencia, estado y ciudad; monto inicial, capital activo, interés por cobrar, mora cobrada, balance, clientes y préstamos; impresión. | Reporte conciliable con vistas y exportación. |
| Gastos | Formulario de gasto/ingreso con sucursal, tipo, categoría, monto, cuenta y descripción; guardar y buscar. Un gasto de negocio redujo el saldo de cuenta y aumentó gastos en caja y ganancia. | Movimiento clasificado, soporte y aprobación según rol. |
| Ganancia | Reporte de gastos/ingresos por fechas, sucursal y tipo; totales, gráfico e impresión. | Métricas con definiciones explícitas y desglose. |
| Solicitud | Identificación y contacto; productos `San`, `A Rédito`, amortizado y pagaré abierto; frecuencias diaria, interdiaria, semanal, quincenal y mensual; monto, interés, duración, cuota y resumen de capital/interés/balance. | Simulador con fórmulas aprobadas, decisión y evidencias. |
| Clasificación | Filtros de cliente activo/inactivo/atrasado y categorías castigado, moroso, malo, regular, bueno y excelente; gráfico y botón de mensajes. | Clasificación explicable y acciones de cobro; mensajería en fase posterior. |
| Empleados | Ficha y selector de empleado; función, comentario, mapa, comisión y cambio de contraseña. | Usuarios, roles, sucursales y permisos; comisiones posteriores. |
| Contabilidad Profunda | Cuentas por sucursal, saldo total, nueva cuenta, movimientos con detalle, transferencia y ajuste con motivo. La transferencia de prueba generó movimientos opuestos y mantuvo el saldo conjunto. | Registro contable base desde MVP; libro mayor completo después. |
| Cuentas por Pagar | Filtros por sucursal, tipo y estado (abierto, tarde, pagado); alta con vencimiento y repetición por frecuencia y número de veces; detalle con edición, borrado y pago. Una obligación vencida apareció tanto en «Abierto» como en «Tarde». En otra prueba, pagar 30 de 80 marcó la obligación como pagada y cambió su monto visible a 30. | Obligaciones con monto original, saldo pendiente, pagos parciales, vencimiento y conciliación en fase 2. |
| Configurar Mora *(menú avatar)* | Porcentaje, días por cuota atrasada y mora automática para todos los préstamos. Verificado 5 %/1 día → mora 140 en 8 días. | Política de mora con base, gracia, tope y vista previa. |
| Gastos de Cierre *(menú avatar)* | Activación y valor predeterminado en % o fijo (no ambos). | Cargos del préstamo visibles en calendario y contrato. |
| Permisos *(menú avatar)* | 27 interruptores por usuario, con variantes «Limitado». Sin roles. | Roles con alcance y separación de funciones. |
| Sucursales *(menú avatar)* | Crear, editar, desactivar y asignar usuarios. | Igual, con gerente de sucursal. |
| Empresa y Licencia *(menú avatar)* | Datos para encabezado de documentos (RNC, logo); licencia por días y personas con pago por depósito. | Ajustes de empresa; facturación fuera del producto. |
| Abogados, Testigos, Alguacil *(menú avatar)* | Catálogos para documentos legales. Testigos por abogado. | «Personas legales» en ajustes. |
| Exportar Datos *(menú avatar)* | Descarga directa sin opciones. | Exportación con selección, formato y auditoría. |

## Observaciones de UX

- La identidad púrpura y verde, el menú lateral y las tarjetas de reportes crean una base visual reconocible que conviene reinterpretar.
- En varias pantallas de reporte el logotipo ocupa gran parte del espacio de trabajo, mientras los datos y filtros quedan separados en tarjetas pequeñas.
- Préstamos y pagos requieren pasar primero por una lista de clientes. Una búsqueda global y acceso directo al préstamo reducirían pasos frecuentes.
- Algunos controles observados carecen de una etiqueta accesible clara. El nuevo sistema debe mantener asociaciones de etiqueta, foco visible y navegación por teclado.
- Los términos financieros visibles no explican las fórmulas; por eso el motor de cálculo requiere definición independiente.

## Límite de la inspección

Se crearon un cliente, cuatro préstamos históricos (dos activos y dos cerrados antes del último cobro) y movimientos ficticios para probar solicitud, presupuesto, desembolso, pago parcial, reverso, cierre anticipado, renovación, cuota vencida, mora manual, gastos, cuentas por pagar, caja, cartera, ganancia y saldos de cuenta. Se abrieron pagaré, caja, recibo y carta de saldo en PDF. Véase [FLUJOS_VERIFICADOS.md](FLUJOS_VERIFICADOS.md). El 28/09/2026 se completaron además mora automática, documentos notariales y legales, secciones del cliente (familiar y referencia) y el menú de administración ([FLUJOS casos 12–14](FLUJOS_VERIFICADOS.md)). Quedan sin verificar adjuntos del cliente, el efecto de los gastos de cierre, mensajería, permisos entre varios usuarios y comisiones.
