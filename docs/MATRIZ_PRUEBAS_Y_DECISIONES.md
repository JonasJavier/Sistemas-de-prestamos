# Matriz de pruebas y decisiones del producto

Fecha: 28 de septiembre de 2026. La referencia se probó en una cuenta de pruebas con datos ficticios. «Verificado» describe únicamente el caso observado en la interfaz; no aprueba la regla financiera para nuestro producto. Evidencia detallada: [FLUJOS_VERIFICADOS.md](FLUJOS_VERIFICADOS.md).

## Cobertura alcanzada

| Área | Escenario | Estado | Resultado / decisión para nuestro sistema |
| --- | --- | --- | --- |
| Cliente | Alta con documento y contacto ficticios | Verificado | Expediente único, validaciones claras y búsqueda de duplicados antes de guardar. |
| Cliente | Trabajo, garante, familia, referencias, archivos | Verificado: defectos críticos | Todo guardado y probado. Archivos solo imagen y **accesibles sin sesión**. *Seleccionar garante* vinculó un **garante de otra empresa** (fuga de datos). Ver [referencia/02](referencia/02-clientes-y-consulta.md). |
| Cliente | Clave de acceso | Verificado | GET genera y muestra en texto plano una clave de 8 caracteres. Nuestro portal usará invitación de un solo uso u OTP. |
| Consultar | Búsqueda por documento ficticio | Verificado | Consolidó dos préstamos y capital pendiente aproximado 1,929; «último pago» mostró el reverso −250. Definir cada saldo y tratar reversos aparte. |
| Solicitud | Simular cuatro productos | Parcial | San y A Rédito dieron 1,400 para el ejemplo; Amortizado 1,261.88; Pagaré abierto 1,100. Documentar fórmulas y calendario con ejemplos aprobados. |
| Solicitud | Guardar y procesar con cliente existente | Verificado | Mantener solicitud, decisión y préstamo como objetos separados y con estados visibles. |
| Préstamo | Desembolso desde cuenta | Verificado | Operación atómica con comprobante, cuenta, actor y saldo auditable. |
| Préstamo | Segundo préstamo del mismo cliente | Verificado | Admitir varias operaciones por cliente; mostrar resumen y navegación directa. |
| Préstamo | Pagaré abierto con cuota de interés y globo | Verificado en un caso | Aclarar el renglón #99 y vencimiento anual antes de implementarlo. |
| Préstamo | Incobrable y reversión | Verificado | Pedir motivo, registrar actor, fecha y efecto contable; dejar visible el estado. |
| Préstamo | Renovación de pagaré abierto | Verificado en un caso | Saldo anterior 1,100, monto nuevo 1,500 y efectivo neto 400; cerró el anterior y creó préstamo nuevo. Libro registró +1,100 y −1,500. Exigir vínculo y política de capitalización explícitos. |
| Préstamo | Editar fecha tras pago parcial | Verificado | Solo primera fecha editable; moverla un día movió las cuatro cuotas sin cambiar saldos. Pedir motivo, autorización e historial de versiones. |
| Préstamo | Mora por préstamo | Verificado: defecto | El modal por préstamo responde HTTP 405. Solo funciona la configuración global. |
| Préstamo | Notarial, entrega voluntaria, intimación, mandamiento | Verificado | Generados con abogado, testigos y alguacil ficticios. Plantillas con datos fijos y errores; ver [referencia/08-documentos.md](referencia/08-documentos.md). |
| Préstamo | Gastos de cierre | Verificado | 2 % → movimiento «Gastos de Cierre» +20 en la cuenta; no aparece en Caja ni Ganancia; se conserva al borrar el préstamo. |
| Préstamo | Frecuencias y días no laborables | Verificado | Diario, interdiario, semanal y mensual; No sábados/domingos desplaza y continúa. San mensual pierde 1 centavo. |
| Préstamo | Préstamo comenzado, borrar, sobregiro | Verificado | Pago hecho marca cuotas con fecha futura y sin desembolso; borrar solo sin pagos; se permite saldo negativo en la cuenta. |
| Préstamo | Presupuesto (calculadora) | Verificado | Garantías, ingresos y gastos por categoría; importa el sueldo; sin impresión. |
| Préstamo | Asignación de cobrador | Parcial | Modal con selector y Guardar; solo hay un usuario, sin cambio verificable. |
| Cobro | Pago parcial de cuota | Verificado | Asignación explícita y auditable a capital/interés/mora/cargos. |
| Cobro | Cuota vencida con mora manual | Verificado: discrepancia | Cuota pendiente 250, mora 5, efectivo y libro +255; historial y tabla de Caja mostraron `Cobrado 250` y mora aparte. Definir magnitudes y conciliar. |
| Cobro | Cambio en efectivo | Verificado | Registrar monto recibido, cambio y pago neto por separado. |
| Cobro | Reverso con motivo | Verificado | Siempre total (los campos de monto y mora del modal están deshabilitados). Mantener original y reverso enlazados; ofrecer reverso parcial con permiso. |
| Cobro | Varias cuotas con mora automática | Verificado: discrepancia | 700 + mora 140 en una sola fila; recibo «Total Pagado 700». |
| Cobro | Liquidación anticipada y cierre | Verificado: discrepancia | Capital 100 + interés 20 cerró el préstamo; cuenta recibió 120, pero historial/recibo y `Monto` de caja dijeron 100. Exigir conciliación exacta de todos los importes. |
| Caja | Cobros, reverso, gastos, ingreso personal | Verificado | Definir y conciliar cobros, desembolsos, salidas, entradas y efectivo final. |
| Cartera | Capital activo, interés por cobrar y filtro de cerrados | Verificado en tres préstamos | El filtro cambió la tabla y el contador, pero no los totales de las tarjetas. Definir si los totales son globales o filtrados y etiquetarlos. |
| Gastos | Gasto de negocio desde cuenta | Verificado | Categoría, cuenta, soporte, actor y efecto de caja. |
| Gastos | Gasto personal desde cuenta | Verificado | Importe 10 incrementó gastos totales y redujo «Ganancia» y efectivo neto en 10; separar resultado operativo de gasto/retiro personal. |
| Ingresos | Ingreso personal desde cuenta | Verificado | Separar flujo de efectivo, aportes del propietario e ingreso operativo. |
| Cuentas por pagar | Alta, vencimiento, filtro «Tarde» y repetición semanal | Verificado en un caso | Dos repeticiones desde 01/10/2026 generaron obligaciones del 01/10 y 08/10 por 15 cada una. Editar descripción de la primera no cambió la segunda. Diseñar serie y ocurrencias explícitas. |
| Cuentas por pagar | Pago menor que obligación | Verificado: comportamiento problemático | No perder los 50 restantes al pagar 30 de 80. Historial de pagos y estado parcial. |
| Ganancia | Reporte tras gastos e ingreso personal | Verificado | Definir utilidad separada de entradas personales; mostrar centavos coherentes. |
| Contabilidad | Alta de cuenta, transferencia y ajustes | Verificado | Transferencia de 10 creó −10/+10 y conservó saldo total; ajustes +5/−5 quedaron en el libro con motivo. Falta probar referencia común y permisos. |
| Atrasos | Lista de cobro | Verificado en un caso | Se creó una lista y se añadió el cliente; quedó disponible como filtro. Faltan gestión de membresía y efecto en escenario vencido. |
| Atrasos | Cuota vencida, lista de cobro y cancelación del atraso | Verificado: discrepancia | Editar permitió primera fecha anterior al inicio; Atrasos mostró 250 y Tiempo −3, pero capital/interés atrasados 0. Al pagar 250 + mora 5 desapareció la fila. |
| Atrasos | Cálculo automático de mora | Verificado | Global 5 %/1 día: cuota 350 con 8 días de atraso → mora 140 (`cuota × % × días/período`), sin tope ni gracia. No figura en Atrasos ni Cartera. |
| Clasificación | Categorías y cliente de prueba | Parcial | La fila abrió un detalle completo del préstamo; calificación seguía vacía incluso al probar incobrable. Definir regla y trazabilidad. |
| Empleados | Roles, cobrador, comisión, permisos | Parcial | 27 interruptores de permiso por usuario, sin roles; variantes «Limitado». Comisión inspeccionada sin guardar. Falta un segundo usuario para verificar alcances. |
| Administración | Empresa, sucursales, licencia, abogados, alguacil, exportar | Verificado | Inventario en [referencia/07-administracion.md](referencia/07-administracion.md). Exportar descarga directamente sin opciones. |
| Documentos | 11 documentos PDF/DOCX | Verificado | Plantilla común, contenido y 9 tipos de defecto documentados en [referencia/08-documentos.md](referencia/08-documentos.md). |
| Mensajería | Email/SMS/otros | Existe, no probado | Por decisión del proyecto no se envió nada. Opciones en el recibo y en Clasificación (tipo de mensaje + texto editable). |
| Solicitud | Procesar con cliente nuevo | Verificado | Alta precargada → préstamo en borrador con los términos. |
| Usuarios | Alta de usuarios | Verificado (sin ejecutar) | Solo por `/register` con número de licencia; lo debe hacer el usuario. |
| Exportar | Exportar Datos | Pendiente | Descarga bloqueada en el navegador de pruebas; requiere descarga manual. |

## Casos numéricos iniciales de aceptación

1. **San:** capital 1,000, tasa indicada 10%, cuatro cuotas quincenales. En la referencia: cada cuota 350 = capital 250 + interés 100. El equipo de negocio debe confirmar qué representa la tasa antes de codificar.
2. **Pago parcial:** cuota 350; cobro 100. En la referencia se asignó 71.43 a capital y 28.57 a interés; quedaron 250. Probar redondeo de la última asignación para que la suma exacta cierre en 350.
3. **Efectivo y cambio:** saldo de cuota 250; efectivo recibido 300; cambio 50; pago neto 250. El saldo de cuenta sube 250 y la caja reconoce 250.
4. **Reverso:** revertir ese pago de 250 con motivo. La cuota vuelve a 250 pendientes; caja conserva +250 y −250; ambos movimientos quedan relacionados.
5. **Pagaré abierto:** capital 1,000, tasa indicada 10%. En la referencia: interés 100 el 13/10/2026 y globo de capital 1,000 el 28/09/2027. Definir vencimiento, numeración y cualquier interés durante el año.
6. **Cuenta por pagar parcial:** obligación 80, pago 30. Nuestro resultado esperado: importe original 80, pagado 30, saldo 50, estado `Parcial`, cuenta −30. La obligación sigue en pendientes.
7. **Resultado de negocio:** interés efectivamente cobrado 28.57, gasto de negocio 80, ingreso personal 40. Mostrar por separado resultado operativo −51.43 y entrada personal 40; indicar regla exacta de redondeo en reportes.

## Decisiones que el negocio debe cerrar antes del motor financiero

| Decisión | Pregunta concreta | Impacto |
| --- | --- | --- |
| Productos y tasa | ¿10% se aplica por cuota, por mes, por período o al total? ¿Interés simple o saldo insoluto? | Cuotas, calendario y cartera. |
| Pagaré abierto | ¿Qué significa el plazo y cuándo vence capital? ¿Se cobra interés periódico adicional? | Contrato, calendario y mora. |
| Calendario | ¿Qué pasa en sábados, domingos, feriados y fin de mes? | Fechas de vencimiento. |
| Pago | ¿Cuál es el orden entre gastos, mora, interés y capital? ¿Se permite anticipo o sobrepago? | Asignación, recibo y saldo. |
| Renovación/castigo | ¿Qué saldos se cancelan, cuáles se capitalizan y qué permisos se necesitan? | Balance, utilidad y auditoría. |
| Caja y utilidad | ¿Qué cuentas y movimientos entran en efectivo neto y en ganancia? | Cuadres y reportes. |
| Gobierno | ¿Quién aprueba, desembolsa, reversa, edita términos y cierra caja? | Roles y separación de funciones. |
| Contexto legal | Jurisdicción (la referencia opera en República Dominicana: cédula, RNC, RD$, CPC dominicano), moneda, formato contractual y retención documental. | Documentos, cálculos y operación en producción. |
| Mora | ¿Desde qué día empieza? ¿Base de cálculo (cuota, saldo vencido, capital vencido), tope y días de gracia? | Cobro, cumplimiento y reputación. |
| Gastos de cierre | ¿Se descuentan del desembolso o se financian? ¿Porcentaje, fijo o ambos? | Desembolso, contrato y ganancia. |
| Documentos legales | ¿MVP o fase 2? ¿Quién valida las plantillas? | Alcance y riesgo legal. |
| App de cobrador | ¿PWA desde el MVP o web adaptable? | Arquitectura y prioridades. |

## Criterios de UX derivados de la prueba

- En el expediente del cliente, mostrar préstamos, solicitudes, pagos y documentos en una cronología con acceso directo; las secciones deben ser operables por teclado y tener nombres accesibles.
- En el simulador, mostrar fórmula, tasa por período, total a pagar y calendario antes de confirmar. Cada cambio debe conservar los campos no relacionados.
- En cobro, mostrar importe debido, desglose de asignación, efectivo recibido, cambio y saldo posterior antes de guardar.
- Para incobrable, reverso, renovación y edición de obligaciones, pedir motivo y mostrar efecto esperado antes de confirmar; conservar historial.
- Diferenciar visualmente cartera, caja y resultado operativo. Cada indicador debe tener definición y fecha de corte.
- Dar prioridad a la tabla y las acciones de trabajo; usar el logotipo como marca discreta. Mantener la identidad púrpura y verde con contraste accesible.
- Las obligaciones deben mostrar `Original / Pagado / Pendiente` y estado calculado; `Tarde` puede ser una condición adicional a `Abierto`.
