# Flujos verificados en la cuenta de pruebas

Fecha: 28 de septiembre de 2026. Cuenta de pruebas confirmada por el usuario. Datos ficticios rotulados `CLIENTE PRUEBA CODEX 01`; documento de prueba `TEST-CODEX-0001` y correo no entregable `example.invalid`. No se enviaron emails ni mensajes. Este documento registra comportamiento observado, no una especificación financiera aprobada.

## Caso 1: cliente → préstamo → pago → caja → cartera → cuenta

| Paso | Entrada/acción | Resultado observado |
| --- | --- | --- |
| Alta de cliente | Nombre, documento de prueba, dirección, ciudad, teléfonos con código de país, correo y comentario. | Se creó el expediente del cliente. La ficha muestra enlaces a préstamos, edición y secciones de archivos, datos laborales, garante, familiares y comerciales. El teléfono sin código de país mostró una validación explícita. |
| Préstamo | Producto `San`; capital 1,000; interés 10%; cuatro cuotas quincenales; primera fecha de pago 13/10/2026. | Se generó calendario: cuatro cuotas de 350, cada una con 250 de capital y 100 de interés. Interés total 400; balance contractual 1,400. |
| Confirmación de préstamo | Selección de la cuenta `Caja Chica` en un segundo cuadro de diálogo. | Préstamo activo guardado. Su expediente bloqueó los términos y ofreció acciones de borrar, editar, cobrador, mora, pagaré, notarial, renovar, presupuesto, acto de entrega e incobrable. El saldo de la cuenta pasó de 100,000 a 99,000. |
| Pago parcial | Se seleccionó la primera cuota de 350 y se cobró solo 100, sin mora. | Quedaron 250 en la primera cuota. El sistema asignó 71.43 a capital y 28.57 a interés. Abrió opciones de imprimir recibo, enviar email o enviar mensaje; se continuó sin activar ninguna. |
| Efecto del pago | Revisión de módulos vinculados. | Caja mostró 100 cobrados, capital 71.43, interés/ganancia 28.57; cartera mostró capital activo 928.57, interés por cobrar 371.43 y balance 1,300; `Caja Chica` subió a 99,100. El movimiento contable incluyó tipo, monto, saldo antes/después, usuario y razón. |
| Pago del resto de la cuota | Cobro de 250 con efectivo de 300. | La interfaz calculó 50 a devolver. La primera cuota quedó en cero; los totales pagados del préstamo llegaron a 250 de capital y 100 de interés. Caja registró 250, no los 300 entregados antes del cambio. |
| Reverso | En historial de pagos se marcó el pago de 250 y se escribió un motivo. | La primera cuota volvió a tener 250 pendientes. Caja conservó los movimientos 250 y −250 y volvió al neto de 100. Capital e interés pagados regresaron a 71.43 y 28.57. |

**Estado del caso antes de los demás ensayos:** préstamo activo, primera cuota parcialmente pagada (250 pendientes), otras tres cuotas de 350 sin pagar, cobro neto 100 y saldo de `Caja Chica` 99,100.

## Caso 2: solicitud → préstamo de pagaré abierto → presupuesto

| Paso | Entrada/acción | Resultado observado |
| --- | --- | --- |
| Simulación A Rédito | Capital 1,000; 10%; duración 4; quincenal. | Cuota 100; interés total 400; balance 1,400. |
| Simulación Amortizado | Mismos parámetros. | Cuota 315.47; interés total 261.88; balance 1,261.88. El resultado coincide aproximadamente con una cuota fija de amortización, pero falta aprobar la fórmula exacta. |
| Simulación Pagaré abierto | Capital 1,000; 10%; quincenal. | La duración cambió a 2; se mostraron cuota 100, interés 100 y balance 1,100. El calendario generado tuvo una fila #1 el 13/10/2026 con 100 de interés y cero capital, y una fila #99 el 28/09/2027 con 1,000 de capital y cero interés. La numeración y el vencimiento anual requieren aclaración. |
| Búsqueda por documento | Se buscó el documento ficticio de un cliente ya existente. | La pantalla «Cédula Información» indicó que no encontró datos. No queda claro si consulta una fuente externa o el registro interno. |
| Guardado y procesamiento | Se guardó la solicitud, luego se eligió procesar usando el cliente existente. | Se abrió un préstamo en borrador. Tras seleccionar `Caja Chica` y guardar, se creó un segundo préstamo para el mismo cliente, ID 582658. La cuenta bajó de 99,100 a 98,100. |
| Presupuesto | Se abrió desde el préstamo y se registraron garantía ficticia vehículo 5,000, ingreso salario 1,000/mes y gasto alimentación 300/mes. | Totales: garantía 5,000; ingresos 1,000; gastos 300; disponible 700. El presupuesto está vinculado al préstamo. |
| Incobrable | Se pulsó la acción del segundo préstamo. | Cambió inmediatamente a «Deshacer Incobrable», sin confirmación visible. La cartera siguió mostrando ambos préstamos y balance general 2,400; la clasificación del cliente quedó «Sin Clasificación». Se deshizo la marca y reaparecieron las acciones ordinarias. |

El segundo préstamo permanece activo. En el modal de renovación del segundo préstamo, el sistema mostró 1,100 por cubrir; con monto nuevo 1,000 resultó «va a recibir efectivo» −100 y con 1,500 resultó +400. **No se confirmó ninguna renovación.** El modal de mora pidió porcentaje y días por cuota atrasada; el intento de guardar mediante teclado terminó en HTTP 405 y al recargar no había valores guardados. No se ha verificado si el mismo problema ocurre con el ratón. Los documentos notarial y acto de entrega pidieron abogado y testigos, sin opciones disponibles en esta cuenta.

## Caso 3: gasto → caja → ganancia → cuenta

Se registró un `Gasto Negocio` ficticio de categoría `Otro`, monto 50, desde `Caja Chica` y con descripción de prueba. El formulario volvió a quedar vacío tras guardar. Caja mostró gastos 50 y efectivo neto 50, dado el cobro neto de 100 del caso 1. El saldo de `Caja Chica` bajó de 98,100 a 98,050. El tipo de formulario también permite `Gasto Personales` e `Ingreso Personales`; sus categorías y reglas quedan por probar.

## Caso 4: cuenta por pagar → pago parcial → reportes

| Paso | Entrada/acción | Resultado observado |
| --- | --- | --- |
| Alta de obligación | `Pago Internet`, fecha de pago 29/09/2026, importe 80, descripción ficticia; repetición desactivada. | Apareció como abierta con monto 80. El formulario también ofrece una casilla «Repite». |
| Pago parcial | Desde el detalle se cambió «Monto» a 30 y se eligió `Caja Chica`. | La obligación pasó a «Pagado» y su monto visible pasó de 80 a 30. En el filtro «Abierto» quedaron cero registros; en «Pagado» apareció un registro por 30. No quedó visible una cuenta pendiente por 50. Este comportamiento merece una prueba de regresión específica en el producto nuevo. |
| Conciliación | Se revisaron caja, ganancia y cuenta financiera. | Caja mostró gastos acumulados 80 (50+30), cobro neto 100 y efectivo neto 20. `Caja Chica` terminó en 98,020. El reporte Ganancia mostró gastos negocio 80, ingreso negocio 29 y ganancia −51; la cifra de ingreso redondea los 28.57 de interés cobrados. |

La etiqueta del resumen «Monto Total Pagado» mostraba 80 cuando la obligación estaba abierta. Por eso su significado no parece corresponder literalmente a pagos realizados; se debe definir y probar con más casos.

## Caso 5: ingreso personal y obligación vencida

- Se registró un `Ingreso Personales` ficticio de categoría `Otro` por 40 en `Caja Chica`. Las categorías visibles eran `Comisiones`, `Prestación de servicios`, `Utilidades` y `Otro`. Caja mostró ingreso personal 40 y efectivo neto 60; la cuenta subió de 98,020 a 98,060.
- El reporte Ganancia mostró ingreso negocio 29, ingreso personal 40, ingreso total 69, gastos 80 y «Ganancia» −11. Para el producto nuevo, un aporte o ingreso personal debe distinguirse de la rentabilidad del negocio y del flujo de caja.
- Se creó una segunda obligación ficticia por 20 con vencimiento 27/09/2026, un día antes de la fecha de operación. Apareció en `Abierto` y también en el filtro `Tarde`; el menú lateral mostró una obligación pendiente. El resumen volvió a etiquetar el monto abierto como «Monto Total Pagado».
- La casilla `Repite` en el alta de obligaciones reveló `Forma de Pago` (diario, interdiario, semanal, quincenal o mensual) y `Cuántas veces`.

## Caso 7: generación de obligación recurrente

Se creó una obligación ficticia `Pago Luz` de 15 con primer vencimiento 01/10/2026, repetición `Semanal` y «Cuántas veces» = 2. Al guardar, aparecieron **dos obligaciones abiertas** de 15, con fechas 01/10/2026 y 08/10/2026. El total de obligaciones abiertas de la cuenta de prueba pasó a tres registros por 50 (20 vencidos + 15 + 15). Así, en el caso probado, «Cuántas veces» incluye la primera ocurrencia. Después se editó la descripción de la ocurrencia del 01/10; el cambio persistió tras recargar y la del 08/10 conservó su descripción original. El formulario de edición mostró solo sucursal, fecha, tipo, monto y descripción, sin control de serie o repetición. No se verificó la eliminación de una ocurrencia o de toda la serie.

## Caso 6: cuentas financieras, transferencia y ajustes

Se creó `CUENTA PRUEBA CODEX` con saldo inicial cero. Desde `Caja Chica` se transfirieron 10 con motivo ficticio. El libro de origen registró −10 y balance 98,050; el libro de destino registró +10 y balance 10. El saldo total de ambas cuentas permaneció 98,060. El detalle del movimiento de destino mostró cuenta, fecha, tipo, monto, saldo antes/después, usuario y razón.

En la cuenta de prueba se registró un ajuste +5 con motivo y luego un contraajuste −5 con otro motivo. El libro conservó ambas filas y el saldo volvió a 10. Queda por verificar si ambos lados de la transferencia comparten una referencia interna y qué permisos existen para ajustes.

## Documentos PDF revisados

- `Imprimir Caja` abrió un PDF de dos páginas. La primera resume filtros y totales, con bastante espacio vacío; la segunda contiene la tabla de cobros y reversos del cliente de prueba. El resumen coincidió con la pantalla: cobro neto 100, capital 71.43, interés 28.57, gastos 80, ingreso personal 40 y efectivo neto 60. La tabla no desglosa los movimientos de gasto o ingreso que forman esos totales.
- `Imprimir Pagaré` abrió un PDF de una página con datos del cliente, calendario de cuatro cuotas de 350 y espacio de firmas. El texto del documento menciona una suma de 1,000 mientras el calendario suma 1,400; puede referirse al principal, pero el documento no aclara allí el total contractual. El contenido contractual y la base legal requieren revisión antes de reutilizar cualquier redacción.

## Simulación diaria y límite de la prueba de atrasos

En alta de préstamo se simuló `San`, capital 100, interés 10%, dos cuotas diarias: primera fecha automática 29/09/2026, dos cuotas de 60 (50 capital + 10 interés), balance 120. La opción `Préstamo Comenzado` mostró un campo adicional `Pago Hecho`. Se intentó seleccionar 27/09/2026 como primera fecha: en una prueba el campo volvió a 29/09/2026; en otra mostró 27/09/2026, pero la tabla continuó con cuotas del 29 y 30. **No se guardó este préstamo**, porque la fecha visible y el calendario no coincidían. Por esta vía no se pudo completar el escenario de mora con cuota vencida.

## Clasificación y comisiones observadas

La fila del cliente en `Clasificación` abrió un modal «Datos Préstamo» vinculado al préstamo de pagaré abierto. Mostró montos iniciales, cuota, estado 0/2, fechas, producto, frecuencia, tasa, capital e interés pendientes y atrasados, mora, último y próximo pago, cobrador y enlaces a imprimir o pagar. La calificación siguió en blanco; no se encontró una acción de asignación manual en este recorrido. El modal permitió acceder al préstamo sin pasar por la lista de clientes.

En `Empleados`, la acción «Comisión» abrió una tabla con fechas, ganancia, porcentaje y diferencia. «Configurar Comisión» pidió fecha desde/hasta, cantidad de ganancia de cobro y porcentaje de ganancia de cobro. **No se guardó ninguna configuración** ni se cambió contraseña o dato de empleado.

## Consulta consolidada y lista de cobro

- En `Consultar`, el documento ficticio del cliente sí devolvió su expediente y **ambos préstamos**. La pantalla agrupó identificación, contacto, trabajo/familia, fecha, monto inicial, cuota, pendiente, atraso, último pago y calificación. Mostró monto inicial total 2,000 y «Monto Pendiente» 1,929, que coincide aproximadamente con la suma del capital pendiente 1,000 + 928.57 redondeado; no equivale al balance contractual de 2,400. Mostró «Monto último Pago» −250, correspondiente al reverso, lo que puede confundir si se interpreta como el último cobro. El resultado contrasta con la búsqueda de «Cédula Información» en la solicitud, que no encontró el mismo documento ficticio; parecen consultas distintas, pero no se confirmó su fuente.
- En `Atrasos`, `Lista de cobro` → `Editar` permitió crear `LISTA PRUEBA CODEX` y añadir al cliente ficticio. La lista apareció luego como filtro. La selección del cliente quedó guardada inmediatamente. Los préstamos actuales no están vencidos, por lo que el reporte siguió sin filas y no se pudo verificar su efecto sobre montos atrasados. El editor también ofrece quitar clientes y borrar la lista; esas acciones no se usaron.

## Caso 8: préstamo pequeño → liquidación anticipada → recibo y carta de saldo

Se creó un tercer préstamo ficticio, ID 582692, `San`, capital 100, interés 10%, dos cuotas diarias de 60 (29 y 30/09/2026), financiado desde `Caja Chica`. La cuenta bajó de 98,050 a 97,950. Antes de vencer ninguna cuota, `Pagos` ofrecía `Terminar Préstamo`: el modal proponía capital a cobrar 100 (no editable), interés a pagar 20 (editable), mora 0 (editable), efectivo y cuenta. Se introdujeron 120 de efectivo; «A Devolver» mostró 0. Al pulsar `Pagado`, el préstamo quedó cerrado y apareció `Carta Saldo`. No se enviaron email ni mensaje.

**Conciliación observada:** la cuenta financiera registró un movimiento `Pago` de **+120** y terminó en 98,070; el préstamo mostró capital pagado 100 e interés pagado 20. Sin embargo, el historial de pagos mostró una fila con «Cobrado» **100**, capital 100 e interés 20. Caja sumó solo **100** a `Monto` y pasó de efectivo neto 60 a 160; simultáneamente aumentó capital en 100 e interés/ganancia en 20. La suma de conceptos (120) difiere de «Cobrado» y de `Monto` de caja (100), aunque la cuenta sí aumentó 120. Esto debe tratarse como un caso de conciliación crítico al diseñar y probar nuestro sistema.

El recibo PDF de la liquidación indicó `Pagó: 30.00 cuota 1 de 2` y `Pagó: 70.00 cuota 2 de 2`, total pagado **100**, mientras el historial de préstamo y la cuenta reflejaron interés 20 adicional. El PDF mostró saldo pendiente 0 y calificación `Excelente 100%`. La `Carta Saldo` afirmó que el préstamo #3 por 100 estaba saldado y también mostró `Excelente 100%`. El texto de ambos documentos debe verificarse contra el libro de pagos antes de adoptar su formato.

En `Cartera`, el filtro `Cerrados` dejó una fila y el contador `Total Préstamos` cambió a 1, pero los totales `Monto inicial` 2,100, `Capital Activo` 1,928.57, `Interés por Cobrar` 471.43 y `Balance General` 2,400 permanecieron iguales a los totales de los tres préstamos. Por lo observado, esas tarjetas no siguen el filtro de estado, aunque la tabla y el contador sí lo hacen; la semántica del reporte debe aclararse.

## Caso 9: renovación de pagaré abierto

Desde el préstamo #2 (ID 582658, capital 1,000, balance pendiente 1,100) se abrió `Renovar`. El modal mostró `Balance para cubrir: 1100`; con monto nuevo 1,500 calculó `Va a recibir efectivo: 400`. Se eligió `Caja Chica` y se confirmó. **La renovación creó de inmediato un nuevo préstamo**, ID 582693, por 1,500, con el mismo producto `Pagaré abierto`, tasa 10%, frecuencia quincenal y dos renglones de calendario: interés 150 el 13/10/2026 y capital 1,500 el 28/09/2027. Balance nuevo 1,650.

El préstamo original quedó cerrado y sus cuotas en cero. Su historial mostró un pago de 1,100, desglosado en capital 1,000 e interés 100; esa fila no mostró casilla de reverso en la vista observada. En la cuenta aparecieron dos movimientos: `Pago` +1,100 y `Préstamo` −1,500, con efecto neto −400. `Caja Chica` pasó de 98,070 a 97,670. No apareció en el expediente un enlace explícito entre préstamo anterior y renovado en las acciones visibles; debe verificarse si existe otra vista que lo muestre.

En `Caja`, el pago de renovación sumó 1,100 a `Monto`, 1,000 a capital y 100 a interés/ganancia; `Renovaciones` mostró 1,100 y `Efectivo neto en Caja` se mantuvo en 160. Este indicador no refleja la salida neta de 400 de la cuenta durante la renovación. `Ganancia` aumentó el ingreso negocio en 100 (de 49 redondeados a 149), aunque el interés se incorporó a la renovación sin entrada externa de efectivo separada. Son reglas de reporte que deben definirse explícitamente para el nuevo sistema.

Después de renovar, `Cartera` mostró cuatro préstamos históricos por monto inicial total 3,600, capital activo 2,428.57, interés por cobrar 521.43 y balance general 2,950. Los activos son el primer préstamo parcial y el nuevo pagaré de 1,500; el préstamo pequeño y el pagaré anterior están cerrados.

## Edición de calendario y configuración de mora

En el primer préstamo, que ya tenía un pago parcial, `Editar` habilitó **solo la primera fecha de pago**; producto, capital, tasa, duración, cuota, sucursal y opciones de fin de semana permanecieron bloqueados. Se cambió 13/10/2026 por 14/10/2026 y se guardó. Las cuatro fechas del calendario avanzaron un día (14/10, 29/10, 13/11 y 28/11); importes, pago parcial y balance permanecieron iguales. La interfaz no pidió motivo visible ni mostró una comparación antes/después. El último vencimiento cayó en sábado porque `No Sábados` estaba desactivado.

El modal `Mora` pide porcentaje y «Días por cuotas atrasadas». Se intentó guardar 5% y 1 día tanto mediante teclado como con ratón. En ambos casos la navegación terminó en `/prestamo/mora` con **HTTP 405 Method Not Allowed**. Después de recargar completamente el préstamo, los campos volvieron a estar vacíos; no se verificó una configuración persistida. Por ello sigue pendiente probar el cálculo y cobro de mora real.

## Caso 10: vencimiento, atraso y cobro con mora manual

En el préstamo #1 se editó la primera fecha de pago a **25/09/2026**, tres días antes de la fecha de operación **y anterior a la fecha de inicio del préstamo, 28/09/2026**. El sistema la guardó sin advertencia y regeneró las cuatro cuotas para 25/09, 10/10, 25/10 y 09/11. Esta prueba confirmó una falta de validación cronológica.

La primera cuota tenía 250 pendientes tras el pago parcial anterior. `Atrasos` mostró una fila con cliente, `Monto 250` y `Tiempo -3`; `Total Monto Atraso` fue 250, pero `Total Capital Atraso` y `Total Interés Atraso` fueron **0**. La lista de cobro creada antes incluyó al cliente y permitió filtrar esta fila. En `Pagos`, el mismo vencimiento se presentó con `Días -3` y `Resta 250`.

Se seleccionó únicamente esa cuota. El modal `Pagar Préstamo` propuso `Monto a Cobrar 250` y `Mora 0`, pero ambos importes eran editables; se introdujo **mora manual 5** y efectivo **255** en `Caja Chica`. Al guardar, la cuota pasó a `Resta 0` y desapareció del reporte de atrasos. El resumen de esa cuota indicó capital pagado 250, interés pagado 100 y mora pagada 5, sumando los pagos de 100 y 250 aplicados a la cuota. El historial añadió una fila `Cobrado 250`, capital 178.57, interés 71.43 y mora 5; por tanto, `Cobrado` excluye la mora aunque aparece en su misma fila. No se enviaron email ni mensaje.

El libro de `Caja Chica` registró **+255** (`Pago`), saldo 97,670 → 97,925, y el detalle mostró motivo con el cliente. La tabla de `Caja` añadió una fila **250**, `Monto` pasó a 1,550 (subió 250), `Mora` a 5, `Ganancia` a 225 y `Efectivo neto` a 415 (subió 255). `Ganancia` pasó de ingreso negocio 149 a 225, incremento 76 que coincide con interés 71.43 + mora 5 redondeados. El cobro base y el efectivo ingresado se manejan como magnitudes distintas; el producto nuevo debe etiquetarlas y conciliarlas sin ambigüedad.

Tras cobrar, se volvió a editar `Fecha de Pago` a **14/10/2026** para restablecer un calendario futuro. El renglón #1, ya pagado, **conservó** su fecha de 25/09/2026; las cuotas pendientes #2–#4 quedaron el 14/10, 29/10 y 13/11. El campo principal ahora muestra 14/10/2026, es decir, el próximo vencimiento editable. El historial de la prueba conserva la fecha inválida de la cuota pagada; no se encontró una opción visible para corregirla.

## Asignación de cobrador y documento notarial

`Cobrador` abrió un modal `Cambiar Cobrador?` con selector y `Guardar`. Solo apareció el usuario actual, así que no hubo un segundo cobrador para verificar el cambio de asignación. `Notarial` abrió `Imprimir Pagare Notarial` con selectores de abogado, testigo 1 y testigo 2 y botón `Imprimir`; los tres selectores no tenían opciones en esta cuenta, por lo que no se generó el documento. La ficha de cliente mostró las secciones `Archivos`, `Datos Laborales`, `Datos Garante`, `Datos Familiares` y `Datos Comerciales`, pero los controles de expansión no revelaron formularios en esta prueba. No se infiere que esas funciones estén ausentes: su flujo queda sin verificar.

## Caso 11: gasto personal y efecto en reportes

En `Gastos` se eligió `Gasto Personales`, categoría `Otro`, importe **10**, cuenta `Caja Chica` y descripción ficticia. El selector de categorías personales ofreció ahorro, alimentación, alquiler casa, ayuda, compras, deudas, educación, entretenimiento, higiene, hijos, hogar, inversiones, salud, servicios, transporte y otro. Guardar limpió el formulario; el movimiento apareció en `Ganancia`.

El reporte `Ganancia` pasó de gastos totales 80 a **90**: gastos negocio 80, personales 10; ingresos 265 y «Ganancia» de 185 a **175**. `Caja` mantuvo `Monto` 1,550 y `Ganancia` 225, pero `Gastos` subió de 80 a **90** y `Efectivo neto en Caja` bajó de 415 a **405**. El gasto personal se descuenta del indicador rotulado «Ganancia» y del efectivo neto; en el nuevo sistema se deben separar resultado operativo, retiros/gastos personales y flujo de cuenta.

## Caso 12: mora automática global

En el menú del avatar → `Configurar Mora` (`/mora`) se guardó **5 %**, **1 día por cuota atrasada** y **Mora Automática** activada. A diferencia del modal por préstamo (HTTP 405), la configuración global persistió tras recargar.

Luego, en el préstamo #1, `Editar` movió la próxima cuota pendiente al **20/09/2026**. El calendario quedó #1 25/09 (pagada), #2 **20/09**, #3 05/10 y #4 20/10: la cuota #2 vence antes que la #1, sin advertencia.

| Pantalla | Resultado |
| --- | --- |
| Pagos | Cuota #2 en naranja, `Días -8`, `Resta 350`. Toast: «CLIENTE PRUEBA CODEX 01 tiene 8 días con un monto en Atraso de 350 Gestiona su cobro de inmediato!» |
| Modal Pagar (cuota #2) | `Monto a Cobrar 350`, **`Mora 140`** (editable). **No se guardó el cobro.** |
| Atrasos | Fila con 350 y `Tiempo -8`; `Total Capital Atraso` 250 y `Total Interés Atraso` 100 (correcto con cuota completa, a diferencia del caso 10 con pago parcial) |
| Cartera | Sin cambios en totales; la mora pendiente no aparece. *Datos Importantes*: préstamos atrasados 1, índice de atrasos 50 % |
| Clasificación | Siguió «Bueno 95.0» |

**Fórmula verificada:** `mora = cuota × 5 % × floor(8 días / 1) = 17.50 × 8 = 140`. Es acumulativa, sin tope ni días de gracia.

## Caso 13: catálogos legales y documentos

- Se crearon `ABOGADO PRUEBA CODEX` (municipio, provincia, colegiatura y estudio ficticios), dos testigos vinculados a él y `ALGUACIL PRUEBA CODEX` (el botón Guardar del modal no era visible; se invocó por script).
- Con esos datos se generaron, sin descargarlos al disco (renderizados en el navegador): **Pagaré Notarial** (.docx), **Acto de Entrega Voluntaria**, **Acto de Intimación de Pago** y **Mandamiento de Pago** (PDF), además del pagaré y los reportes de Caja, Cartera, Atrasos y Gasto-Ingreso, y la carta de saldo. Su análisis está en [referencia/08-documentos.md](referencia/08-documentos.md).
- La intimación reclamó 1,050.00 (tres cuotas de 350 pendientes); el mandamiento reclamó el mismo monto.
- Las descargas generadas por Livewire traen 201 bytes de cabeceras HTTP antes de `%PDF`.

## Caso 14: gastos de cierre y secciones del cliente

- `Configurar Gastos de Cierre` exige porcentaje **o** valor fijo («Debe definir el porcentaje o el valor y no ambos»). Se guardó 2 %. El modal de guardado del préstamo expone `cierre_porcent`, `cierre_value` y `cierre_total`; no se creó un préstamo nuevo para medir el efecto.
- En la ficha del cliente se creó un familiar (`FAMILIAR PRUEBA CODEX`, Hermano) y una referencia comercial (`REFERENCIA PRUEBA CODEX`); ambos aparecieron en sus secciones. Los formularios de datos laborales y garante se inspeccionaron sin guardar.
- `Clave de Acceso → Generar` (GET `/cliente/{id}/show/clave`) mostró una clave de 8 caracteres en texto plano.
- En `Gastos → Buscar → Borrados` apareció el gasto personal de 10 del caso 11 como borrado. El saldo de `Caja Chica` (97,925) y los totales de Caja (gastos 80, efectivo neto 415) ya no lo incluyen.

## Caso 15: cobro de dos cuotas con mora automática → recibo → reverso

Préstamo #1 con cuota #2 vencida 8 días y cuota #3 por vencer. Se marcaron ambas: el modal propuso 700 + mora 140; efectivo 1,000 → cambio 160; cuenta `Caja Chica`. Resultado: una fila de historial (700 · 500 · 200 · 140), cuenta +840, Caja *Monto* +700, *Mora* +140 y *Efectivo neto* +840. Recibo PDF (`/pagos/108105/582642/pdf`): dos líneas «Pagó 350.00 cuota n de 4», «Mora 140.00», **«Total Pagado 700.00»**, calificación «Bueno 96.3 %». Luego se abrió el reverso de esa fila e intentó corregirse 100 + 40: los campos estaban deshabilitados y **se revirtió todo** (−700, −140); la cuenta volvió a 97,945 y la calificación bajó a 94 %.

## Caso 16: préstamo comenzado con gastos de cierre

San quincenal 1,000 al 10 %, 4 cuotas, «Préstamo Comenzado» con «Pago Hecho» 700. El modal de guardado propuso gastos de cierre 2 % = 20 y cuenta. Al guardar (ID 582763): cuotas 1 y 2 marcadas pagadas con fecha de pago igual a su vencimiento futuro; capital pendiente 500; **sin movimiento de desembolso**; la cuenta registró **«Gastos de Cierre» +20**. Caja y Ganancia no reflejan los 20.

## Caso 17: sobregiro y borrado de préstamo

Préstamo San 100 al 10 %, 2 cuotas, desembolsado desde `CUENTA PRUEBA CODEX` (saldo 10): la cuenta quedó en **−88** (−100 + 2 de gastos de cierre). *Borrar* (visible porque no tiene pagos) pidió confirmación; la cuenta registró «Prestamo» **+100** y quedó en 12: **conservó los 2** de gastos de cierre.

## Caso 18: solicitud → cliente nuevo → préstamo en borrador

Solicitud de `CLIENTE PRUEBA CODEX 02` (San semanal 800 al 5 %, 4 cuotas → 240). Guardar → *Buscar Solicitud* (#2) → *Procesar* → *Crear nuevo Cliente* con datos precargados → guardar → préstamo en borrador (ID 582769) con el calendario 200 + 40 × 4. No se desembolsó.

## Caso 19: listas de cobro e incobrables

Se quitó al cliente de `LISTA PRUEBA CODEX` (inmediato) y se borró la lista (confirmación en línea); desapareció del filtro. Se marcó el préstamo #1 como incobrable: *Incobrables* y *Todos* lo muestran, *Cobrables* lo oculta, pero la carga inicial (con «Cobrables») lo mostró con total 0. Se deshizo la marca.

## Caso 20: cliente, gastos, obligaciones, sucursal, empleado

- **Cliente:** imagen ficticia subida y borrada (con confirmación). La URL de la imagen respondía sin sesión. Datos laborales guardados (sueldo 25,000 → aparece como «Salario» en el presupuesto). Garante creado, quitado (sin confirmación) y, al *Seleccionar* del catálogo, **quedó vinculado un garante de otra empresa**; se quitó de inmediato y se creó `GARANTE PRUEBA CODEX 2`.
- **Gasto:** Gasto Negocio 15 creado y borrado con razón; la cuenta volvió a su saldo.
- **Cuentas por pagar:** borrada la ocurrencia del 08/10 (confirmación en línea); la del 01/10 siguió abierta.
- **Sucursal:** `SUCURSAL PRUEBA CODEX` creada y desactivada (sin confirmación).
- **Empleado:** función guardada; comisión 01–30/09, meta 100, 10 % → ganancia 220, comisión 22, diferencia 120.
- **Cartera:** tipo y frecuencia filtran tabla y totales; estado solo la tabla; fecha solo los totales.

## Reglas inferidas que requieren más pruebas

- Para `San` con estos parámetros: interés total = capital × 10% × cuatro períodos; cuota = (capital + interés total) / cuatro. Es una inferencia de un solo caso, no prueba de todas las variantes ni de la base temporal de la tasa.
- Un pago parcial de 100 sobre una cuota con proporción capital/interés 250/100 se reparte aproximadamente 71.43/28.57. Falta probar si se mantiene esta proporción con mora, cargos, redondeos y anticipos.
- El préstamo debitó la cuenta al guardarse; el pago la acreditó. El reporte de caja del día mostró cobros, pero no el desembolso como componente del efectivo neto. Hay que aclarar el significado comercial de ese reporte.
- El reporte `Ganancia` presentó 29 para un interés pagado de 28.57. Falta comprobar su regla de redondeo y si usa importes sin decimales en los totales.
- `Ganancia` suma ingresos personales a ingresos totales y al resultado. Falta acordar con negocio si eso representa utilidad, efectivo disponible u otro indicador.

## Funciones adicionales descubiertas

- La ficha de cliente contiene apartados de archivos, trabajo, garante, familia y referencias comerciales.
- El expediente del préstamo permite asociar cobrador, configurar mora, imprimir pagaré, generar documento notarial y acto de entrega, renovar, ver presupuesto y marcar incobrable. Se verificaron presupuesto, simulación de renovación y cambio reversible de incobrable; faltan los demás flujos completos.
- Cobros muestra cuotas y días hasta vencimiento, selección individual o total, historial, recibos y reverso con motivo.
- Contabilidad Profunda muestra movimientos por cuenta, detalle del movimiento, ajuste y transferencia.

## Casos siguientes

1. Profundizar en los cuatro tipos de préstamo y otras frecuencias; registrar fórmulas, fechas, redondeo y reglas de sábados/domingos.
2. ~~Verificar mora automática~~ (hecho en caso 12). Falta: mora sobre cuota parcialmente pagada, cobrar la mora propuesta y revertirla.
3. Medir el efecto de los gastos de cierre en un desembolso real.
4. Probar adjuntos del cliente, garante seleccionado del catálogo y datos laborales guardados.
5. Probar edición/cancelación de obligaciones recurrentes y filtros de reportes con varios usuarios y sucursales.
6. Crear un segundo usuario para verificar permisos «Limitado», cambio de cobrador y comisiones.
7. Umbrales de clasificación (Regular, Malo, Moroso, Castigado) con más escenarios de atraso.

## Diseño y UX observados en el flujo

- Identidad visual consistente en púrpura y verde, pero el logotipo ocupa espacio central en pantallas operativas mientras las tablas y acciones quedan comprimidas en tarjetas pequeñas.
- El alta de préstamo mezcla simulación y confirmación de cuenta en dos pasos; el desglose del calendario ayuda a comprobar el cálculo, pero los campos aparecen antes de explicar la fórmula aplicada.
- El cobro requiere abrir cliente, luego elegir préstamo en un modal. La selección de cuota y el desglose del pago están en áreas distintas; el nombre de la métrica `Ganancia` debe definirse con precisión.
- El historial de pagos ofrece reverso con motivo, pero el motivo y la relación entre movimiento original y reverso deben ser fáciles de auditar en el nuevo producto.
