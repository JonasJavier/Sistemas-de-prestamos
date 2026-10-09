# 03 · Reglas de negocio y motor financiero

**Estado:** aprobado como base el 28/09/2026 (decisiones 021 y 022); los valores por defecto quedan sujetos a la validación del primer cliente (§15) · **actualizado el 04/10/2026** al alcance multitenant (decisión 041)
- Las reglas del motor financiero son las mismas para todas las empresas de Cobradía; **cada empresa configura sus propios productos, cargos, políticas de mora, feriados y valores**, partiendo de los valores por defecto de este documento, que se siembran al crear la empresa.
- Cada regla trae un **valor por defecto** que se puede configurar por producto.
- Lo marcado con **Validar** debe confirmarlo el primer cliente; lo legal y lo contable, con su abogado y su contador. Cada empresa que se registre es responsable de ajustar su configuración a su práctica y a la ley.

**Principios del motor:**
- **Una sola fuente de cálculo:** el motor financiero es el único que calcula, en el servidor. La pantalla solo muestra sus resultados.
- **Redondeo comercial a 2 decimales:** 0.005 sube a 0.01. Cada suma cierra exacta y el residuo va en la última cuota.
- **Condiciones congeladas:** al desembolsar, el préstamo copia las condiciones del producto. Si después cambia el producto, los préstamos existentes no se alteran.
- **Ejemplos que son pruebas:** los ejemplos E1–E15 se convierten en pruebas automáticas y deben dar exactamente estas cifras.

## 1. Configuración de un producto

| Parámetro | Opciones | Por defecto |
| --- | --- | --- |
| Tipo | Personal, vehículo, hipotecario, microcrédito | — |
| Método de cálculo | Plano, solo interés, cuota fija, capital fijo, abierto (§3) | Según el tipo |
| Frecuencias permitidas | Diaria, interdiaria, semanal, quincenal, mensual | Todas |
| Unidad de la tasa | Por período, mensual o anual (§2) | Por período, como la referencia · **Validar** |
| Rangos | Monto, tasa y plazo, cada uno con su mínimo y su máximo | — |
| Redondeo de la cuota | Al centavo, al peso, a 5 o a 10. La cuota regular se redondea **hacia arriba**; lo que sobra abona capital y la última cuota cierra el saldo exacto, así que nunca es mayor que las demás (decisión 054). No aplica a solo interés ni a abierto: ahí la cuota es el interés | Al centavo · **Validar** |
| Días de cobro | Sábados sí o no, domingos sí o no, feriados sí o no | Sábados sí, domingos no, feriados no |
| Cargos | Lista de cargos con base y modalidad (§5) | Gastos de cierre 0 % |
| Orden de aplicación de pagos | Estándar o proporcional (§8.1) | Estándar |
| Política de mora | Gracia, método, tasa y tope (§7) | 3 días de gracia, 5 % mensual prorrateado, tope 10 % · **Validar** |
| Liquidación anticipada | Interés del período en curso y porcentaje del interés futuro que se cobra (§9) | Período en curso completo; interés futuro 0 % |
| Garantía | No requerida, garante o bien; cobertura mínima | Según el tipo |
| Documentos requeridos | Lista de documentos para aprobar | Cédula o RNC |

Los tipos usan por defecto estos métodos:

| Tipo | Métodos |
| --- | --- |
| Personal | Plano o cuota fija |
| Vehículo | Cuota fija |
| Hipotecario | Cuota fija o capital fijo |
| Microcrédito | Plano, cuota fija o capital fijo |

## 2. Tasas

El sistema convierte toda tasa a **tasa por período** (*i*) con el mes comercial de 30 días:

| Frecuencia | Días del período | *i* a partir de una tasa mensual *m* |
| --- | --- | --- |
| Diaria | 1 | *m* × 1/30 |
| Interdiaria | 2 | *m* × 2/30 |
| Semanal | 7 | *m* × 7/30 |
| Quincenal | 15 | *m* × 1/2 |
| Mensual | 30 | *m* |

- **Tasa anual:** primero se pasa a mensual (anual ÷ 12).
- **Tasa por período:** se usa tal cual.

El simulador, la solicitud y el pagaré siempre muestran lo siguiente, para dar transparencia al cliente:
- tasa por período;
- tasa mensual equivalente;
- tasa anual equivalente;
- **costo anual efectivo con cargos** (decisión 075);
- total de intereses;
- total de cargos;
- costo total (intereses + cargos);
- total a pagar.

Un tope de costo anual efectivo, legal o propio de la empresa, bloquea los préstamos nuevos más caros (§16.4). **Validar con el abogado:** el valor del tope cuando exista la ley.

## 3. Métodos de cálculo

Las fórmulas usan tres valores: **C** = capital, ***i*** = tasa por período y ***n*** = número de cuotas.

### 3.1 Plano («San»)

El interés de cada cuota es fijo y se calcula sobre el capital original:
- interés de cada cuota = C × *i*;
- capital de cada cuota = C / *n*.

Se usa sobre todo en préstamos personales diarios y semanales.

**E1** · 1,000 al 10 % por período en 4 cuotas: cada cuota es **350.00** (capital 250 + interés 100). Total a pagar: 1,400.00. Coincide con la referencia.

**E2** · 1,000 al 10 % en 3 cuotas:

| Cuota | Capital | Interés | Total |
| --- | --- | --- | --- |
| 1 | 333.33 | 100.00 | 433.33 |
| 2 | 333.33 | 100.00 | 433.33 |
| 3 | **333.34** | 100.00 | **433.34** |

El centavo del residuo va en la última cuota; así el capital suma exactamente 1,000 (la referencia pierde ese centavo, defecto #35).

### 3.2 Solo interés («A rédito»)

Cada cuota paga el interés (C × *i*) y el capital completo se paga en la última.

**E3** · 1,000 al 10 % en 4 cuotas: 100.00, 100.00, 100.00 y **1,100.00**. Total a pagar: 1,400.00.

### 3.3 Cuota fija (amortización francesa)

- **Cuota:** C × *i* / (1 − (1 + *i*)^−*n*).
- **Interés:** se calcula sobre el saldo pendiente.
- **Última cuota:** cierra el saldo exacto.

Es el método estándar para préstamos de vehículo, hipotecarios y personales mensuales.

**E4** · 1,000 al 10 % en 4 cuotas. La cuota es **315.47** y coincide con la referencia (1,261.88 en total):

| Cuota | Capital | Interés | Total | Saldo |
| --- | --- | --- | --- | --- |
| 1 | 215.47 | 100.00 | 315.47 | 784.53 |
| 2 | 237.02 | 78.45 | 315.47 | 547.51 |
| 3 | 260.72 | 54.75 | 315.47 | 286.79 |
| 4 | 286.79 | 28.68 | 315.47 | 0.00 |
| **Total** | **1,000.00** | **261.88** | **1,261.88** | |

**E5** · Conversión de tasa: 10,000 al **5 % mensual** en 6 cuotas **quincenales**. La tasa por período es *i* = 2.5 % y la cuota **1,815.50**:

| Cuota | Capital | Interés | Saldo |
| --- | --- | --- | --- |
| 1 | 1,565.50 | 250.00 | 8,434.50 |
| 2 | 1,604.64 | 210.86 | 6,829.86 |
| 3 | 1,644.75 | 170.75 | 5,185.11 |
| 4 | 1,685.87 | 129.63 | 3,499.24 |
| 5 | 1,728.02 | 87.48 | 1,771.22 |
| 6 | 1,771.22 | 44.28 | 0.00 |

Total de intereses: 893.00; total a pagar: 10,893.00.

### 3.4 Capital fijo (cuota decreciente)

El capital de cada cuota es igual (C / *n*) y el interés se calcula sobre el saldo, así que la cuota baja con el tiempo. El cliente paga menos interés en total. Es una opción para hipotecarios y microcrédito.

**E6** · 1,000 al 10 % en 4 cuotas: 350.00, 325.00, 300.00 y 275.00. Intereses: 250.00; total a pagar: 1,250.00.

### 3.5 Abierto («pagaré abierto»)

El cliente paga el interés de cada período sobre el capital pendiente y abona capital cuando quiere. Tiene un vencimiento máximo (por defecto, 12 meses); al llegar, se salda o se renueva. Mejora de la referencia: no hay una cuota #99 artificial.

En el motor, el calendario inicial del abierto es el de solo interés hasta el vencimiento; cada abono a capital (fase 4) crea una nueva versión con el interés sobre el saldo nuevo.

**Ejemplo** · 1,000 al 10 % mensual:
- Meses 1 y 2: interés de 100.00 cada mes.
- En el mes 2, el cliente abona 400 a capital.
- Desde el mes 3, el interés baja a 60.00.

## 4. Calendario

- **Frecuencias:**
  - Diaria, interdiaria (cada 2 días), semanal y mensual.
  - Quincenal, que puede ser «cada 15 días» (por defecto) o «los días 15 y fin de mes», cuando el cliente cobra en esas fechas. **Validar**.
- **Mensual:** vence el mismo día de cada mes; si ese día no existe (por ejemplo, el 31), vence el último día del mes.
- **Primera cuota:** por defecto, un período después del desembolso. Se puede cambiar, pero nunca antes del día siguiente al desembolso.
- **Días no laborables:**
  - En préstamos diarios, esos días se saltan: no hay cuota.
  - En las demás frecuencias, la cuota que cae en un día no laborable pasa al siguiente día laborable. Las fechas siguientes conservan su secuencia original; el corrimiento no se acumula, igual que en la referencia.
  - El interés no cambia por el corrimiento.
- **Feriados de RD:**
  - Viven en un catálogo en Ajustes; el sistema trae precargados los de fecha fija.
  - Los que la ley traslada a lunes los confirma el administrador cada año.
- **Cambiar fechas de un préstamo activo:**
  - Crea una **nueva versión del calendario**, con motivo, permiso y registro de quién la hizo.
  - Nunca antes del desembolso, y las cuotas siempre quedan en orden (corrige el defecto #8).

## 5. Cargos (gastos de cierre y otros)

- **Configuración:** cada producto puede tener varios cargos, como gastos de cierre, gastos legales, tasación, seguro o GPS del vehículo.
- **Base de cada cargo:** un porcentaje del monto o un monto fijo.
- **Modalidades:**

| Modalidad | Qué recibe el cliente | Sobre qué se calculan las cuotas |
| --- | --- | --- |
| **Descontado** del desembolso (por defecto) | Monto − cargos | Monto |
| **Financiado** | Monto | Monto + cargos |
| **Cobrado en caja** al desembolsar | Monto, y paga el cargo aparte | Monto |

**E7** · Préstamo de 1,000 con gastos de cierre del 2 % (20.00):
- **Descontado:** se entregan 980.00 y las cuotas se calculan sobre 1,000.
- **Financiado:** se entregan 1,000.00 y las cuotas se calculan sobre 1,020.
- **En todos los casos:** los 20.00 son un ingreso por cargos que aparece en la caja y en los resultados (en la referencia no aparecían, defecto #31).
- **Si se anula el préstamo:** el cargo se revierte.

## 6. Desembolso

- **Origen:** sale de una cuenta bancaria o de la caja del cajero, siempre que tenga fondos; no se permite sobregiro (defecto #30).
- **Registro atómico:**
  - Se hace en una sola operación: el movimiento de dinero, los cargos, el calendario, los asientos y los documentos (pagaré y tabla de pagos).
  - Lleva una clave de idempotencia: un doble clic no desembolsa dos veces.
- **Requisito:** solo se desembolsa un préstamo aprobado.
- **Fase 3 (decisión 055):** el origen es una cuenta financiera de la empresa: la caja general de la sucursal o un banco. La caja por cajero llega en la fase 4 y desde entonces el efectivo sale de la sesión de caja abierta. Un cargo «cobrado en caja» entra en la cuenta de origen o en la que se indique.
- **Desde la fase 4 (decisión 065):** el efectivo sale siempre de la caja abierta de quien desembolsa (y el cargo «cobrado en caja» entra en ella); el gerente y contabilidad, que no tienen caja, desembolsan por banco.

## 7. Mora

| Parámetro | Por defecto | Notas |
| --- | --- | --- |
| Días de gracia | 3 | Si se paga dentro de la gracia, no hay mora |
| Base | Saldo vencido de la cuota: capital + interés sin pagar | Si hubo un pago parcial, la mora solo se calcula sobre lo que falta (corrige #14) |
| Método | Prorrateado por día: base × tasa mensual × días de atraso / 30 | También se puede elegir «porcentaje por período completo» (como la referencia) o «cargo fijo por cuota» |
| Tasa | 5 % mensual | **Validar** |
| Días que cuentan | Desde el vencimiento, una vez superada la gracia | **Validar** |
| Tope | La mora de una cuota no supera el 10 % de su saldo vencido | **Validar**; corrige #2 |

**E8** · Cuota de 350.00 vencida, con los valores por defecto:

| Días de atraso | Mora |
| --- | --- |
| 2 (dentro de la gracia) | 0.00 |
| 8 | **4.67** |
| 45 | 26.25 |
| 60 | 35.00 (llega al tope) |
| 90 | 35.00 (limitada por el tope; sin tope serían 52.50) |

Con la configuración de la referencia (5 % por cada día de atraso), los 8 días dieron **140.00**: el 40 % de la cuota.

**Cómo se calcula (decisión 067):**
- Día a día, sobre lo que falta de la cuota: un pago parcial baja la base desde el día siguiente; el día del pago todavía cuenta con la base anterior.
- Pasados los días de gracia, se cuenta desde el vencimiento; dentro de la gracia no hay mora.
- El tope se mide sobre lo que estaba vencido el día del vencimiento.
- «Porcentaje por período completo» cobra la tasa entera por cada período iniciado de la frecuencia del préstamo (la referencia, con 5 % diario: 140.00 en 8 días); «cargo fijo» cobra el monto una vez superada la gracia, también con tope.
- La mora y el interés se reconocen como ingreso al cobrarse; el cierre de mes agrega el devengo del interés de los préstamos con hasta 90 días de atraso (decisión 075, §16.2). Condonar no genera asiento.

**Reglas de la mora:**
- Una tarea nocturna actualiza la mora para los reportes; el cobro siempre la recalcula a la fecha del pago.
- La mora nunca se aumenta a mano. Solo se **condona**, total o parcialmente, con permiso y motivo, y la condonación aparece aparte en el recibo.

**Valores por defecto validados (decisión 075, §16.4):** 3 días de gracia, 5 % mensual prorrateado por día sobre lo vencido, tope del 10 %. **Validar con el abogado:** los topes que fije la futura ley de usura.

## 8. Pagos

### 8.1 Orden de aplicación

Se paga primero la cuota más antigua. Dentro de cada cuota, el orden es: **cargos → mora → interés → capital**. Es el orden estándar y el producto puede cambiarlo a «proporcional», como la referencia.

**E9** · Pago parcial de 100.00 a una cuota de 350.00 (interés 100 + capital 250):

| Orden | Interés | Capital | Queda pendiente |
| --- | --- | --- | --- |
| Estándar | 100.00 | 0.00 | 250.00 de capital |
| Proporcional | 28.57 | 71.43 | 250.00 (71.43 de interés + 178.57 de capital) |

### 8.2 Varias cuotas y excedente

**E10** · Préstamo E1 con frecuencia semanal. La cuota 1 lleva 11 días de atraso y la cuota 2, 4 días. El cliente paga 800.00:

| Destino | Mora | Interés | Capital | Total |
| --- | --- | --- | --- | --- |
| Cuota 1 | 6.42 | 100.00 | 250.00 | 356.42 |
| Cuota 2 | 2.33 | 100.00 | 250.00 | 352.33 |
| Cuota 3 (adelanto) | — | 91.25 | — | 91.25 |
| **Recibo** | **8.75** | **291.25** | **500.00** | **800.00** |

A la cuota 3 le quedan 8.75 de interés y 250.00 de capital.

**Conciliación exacta:** el total recibido es igual a la suma de lo asignado, al movimiento de caja y al total del recibo. La referencia imprimía «Total pagado 700» cuando se habían recibido 840 (defecto #29).

**Excedente:**
- Por defecto, lo que sobra **adelanta las cuotas siguientes**.
- El **abono a capital** es una opción que el cajero elige a propósito (§8.3).

### 8.3 Abono a capital

Disponible en los métodos cuota fija, capital fijo, solo interés y abierto:
- Reduce el capital pendiente y crea una nueva versión del calendario.
- En cuota fija se elige entre **reducir el plazo** (por defecto) o **reducir la cuota**.
- Exige estar al día y reprograma solo las cuotas sin pagos; una cuota con un adelanto queda como estaba. Su reverso crea otra versión idéntica a la anterior (decisión 068).
- En el método plano, el pago extra adelanta cuotas. Para ahorrar interés existe la liquidación anticipada (§9).

### 8.4 Efectivo, cambio y medios de pago

**E11** · El cliente debe 250.00 y entrega 300.00: el cambio es de 50.00 y el pago registrado, de 250.00. La caja sube 250.00.

**Medios de pago:**
- Efectivo, que entra en la caja del cajero.
- Transferencia, depósito o cheque, que entran en la cuenta bancaria elegida, con su número de referencia.

### 8.5 Seguridad del cobro

- **Sin cobros dobles:** cada cobro lleva una clave de idempotencia y bloquea el préstamo mientras se registra, así que dos cajeros no pueden cobrar la misma cuota a la vez.
- **Recibo:** tiene numeración consecutiva, en hoja o en formato térmico de 80 mm, y siempre muestra el desglose completo.
- **Fase 4 (decisión 066):** el desglose se verifica también en la base de datos (las asignaciones suman el monto aplicado al confirmar la transacción); el recibo se imprime desde el navegador en cualquiera de los dos formatos, guarda el capital y el saldo posteriores tal como quedaron, y su enlace de WhatsApp muestra solo ese recibo y se puede revocar.

## 9. Liquidación anticipada (saldo para saldar)

**Saldo para saldar** = capital pendiente + interés vencido sin pagar + mora + cargos pendientes + **interés del período en curso** (completo, o proporcional a los días si el producto lo indica).
- El interés de las cuotas futuras **se condona** por defecto (se cobra el 0 %); el producto puede fijar otro porcentaje. **Validar**.

**E12** · Plano E1 con la cuota 1 pagada y el período 2 en curso: 750.00 de capital + 100.00 de interés en curso = **850.00**. Se condonan 200.00 de interés futuro.

**E13** · Cuota fija E4 con la cuota 1 pagada: 784.53 de saldo + 78.45 de interés en curso = **862.98**.

**Reglas de la liquidación:**
- Cualquier descuento adicional requiere permiso y motivo, y aparece como concepto aparte en el recibo.
- La **carta de saldo** indica el monto y la fecha hasta la que es válido.
- **Vigencia (decisión 068):** se calcula para hoy o hasta 30 días adelante; vale solo ese día si hay mora corriendo o el interés del período es proporcional, y si no, hasta el próximo vencimiento.

## 10. Reversos y correcciones

- **Nada se borra.** Un pago se **reversa completo**, con motivo, permiso y un enlace al pago original. Las cuotas vuelven a su estado anterior.
- **Si la caja del pago ya cerró:** el reverso entra en la caja abierta del día, como ajuste.
- **«Corregir pago»:** reversa el pago y registra el correcto en una sola operación. Así se logra el efecto de un reverso parcial sin romper la conciliación (la referencia sugería un reverso parcial que no existía, defecto #37).
- **Solo el último pago vigente** de un préstamo se reversa: los posteriores se asignaron encima de él. Lo pide quien cobra con un motivo del catálogo y lo autoriza otra persona dentro de su límite, reconfirmando con su 2FA (decisiones 066 y 069).

**E14** · Se registró 350.00 por error y el pago correcto era de 300.00. La operación genera un reverso de −350.00 y un pago nuevo de 300.00, enlazados.
- **Caja:** queda con +300.00 netos.
- **Cuota:** quedan pendientes 50.00 de capital (el pago cubre 100.00 de interés y 200.00 de capital).

## 11. Renovación, reestructuración, castigo, anulación y migración

- **Renovación:**
  - Es un préstamo nuevo que liquida el anterior.
  - Efectivo a entregar = monto nuevo − saldo para saldar del anterior − cargos del nuevo.
  - El anterior queda como «Renovado» y enlazado al nuevo.
  - La mora pendiente se paga o, con permiso, se incluye.
- **E15** · Se renueva el préstamo E12 con uno nuevo de 1,500.00 y gastos de cierre del 2 %: 1,500.00 − 850.00 − 30.00 = **620.00** a entregar.
- **Reestructuración:**
  - Crea una nueva versión del calendario en el mismo préstamo: plazo, tasa o cuota.
  - Requiere aprobación.
  - El préstamo queda marcado como «reestructurado» para los reportes y la clasificación.
- **Castigo:**
  - Requiere aprobación del gerente. El sistema lo sugiere a partir de 180 días de atraso. **Validar**.
  - El préstamo sale de la cartera activa; lo que se cobre después cuenta como recuperación.
- **Anulación:** solo para préstamos sin pagos; revierte el desembolso y los cargos.
- **Préstamos migrados** (ya comenzados en otro sistema):
  - Se cargan con su calendario original y sus pagos históricos, con las fechas reales y marcados como «migrados».
  - Esos pagos no mueven la caja, y el saldo inicial debe cuadrar (corrige #34).
  - **Fase 4 (decisión 074):** solo el capital pendiente entra al libro, contra «Saldos de apertura (migración)»; si no coincide al centavo con el sistema anterior, no se carga.

## 12. Atraso y estados

- **Días de atraso:** días transcurridos desde el vencimiento de la cuota impaga más antigua.
- **Tramos:** al día, 1–7, 8–30, 31–60, 61–90 y más de 90 días.
- **Estados del préstamo:**
  - Aprobado (pendiente de desembolso), activo, saldado, renovado, castigado y anulado.
  - Sobre un préstamo activo se calculan tres condiciones: al día o en atraso, en gestión y en vía legal.
  - Los ciclos de vida completos se definen en el paso 5.

## 13. Efecto en el libro de movimientos

Cada operación genera un asiento balanceado. Nombres de cuenta provisionales, que se fijan con el contador:

| Operación | Débito | Crédito |
| --- | --- | --- |
| Desembolso E7 (descontado) | Cartera 1,000.00 | Caja o banco 980.00 · Ingreso por cargos 20.00 |
| Cobro de la cuota 1 de E10 | Caja 356.42 | Cartera 250.00 · Ingreso por intereses 100.00 · Ingreso por mora 6.42 |
| Condonación de mora | — | No genera ingreso; queda registrada como descuento autorizado |
| Castigo | Gasto por castigo | Cartera (saldo de capital) |
| Reverso | Asiento inverso, enlazado al original | |

**Validado (decisión 075, §16.2 y §16.3):** al cobrarlo en la operación diaria, más el devengo mensual en el cierre; interés exento de ITBIS y gravado en el ISR; e-CF obligatorio desde el 15/11/2026.

## 14. Ejemplos que serán pruebas automáticas

| # | Caso | Resultado esperado |
| --- | --- | --- |
| E1 | Plano, 1,000 al 10 % en 4 cuotas | Cuota 350.00; total 1,400.00 |
| E2 | Plano, 1,000 al 10 % en 3 cuotas | 433.33, 433.33 y 433.34; capital exacto 1,000.00 |
| E3 | Solo interés, 1,000 al 10 % en 4 cuotas | 100 × 3 y 1,100.00 |
| E4 | Cuota fija, 1,000 al 10 % en 4 cuotas | Cuota 315.47; intereses 261.88 |
| E5 | Cuota fija, 10,000 al 5 % mensual en 6 cuotas quincenales | Cuota 1,815.50; intereses 893.00 |
| E6 | Capital fijo, 1,000 al 10 % en 4 cuotas | 350, 325, 300 y 275; intereses 250.00 |
| E7 | Gastos de cierre del 2 % | Descontado: entrega 980.00; financiado: base 1,020.00 |
| E8 | Mora de una cuota de 350.00 | 2 días: 0.00; 8 días: 4.67; 60 y 90 días: 35.00 (tope) |
| E9 | Pago parcial de 100.00 | Estándar: 100.00 a interés; proporcional: 28.57 de interés y 71.43 de capital |
| E10 | Pago de 800.00 a dos cuotas vencidas más un adelanto | 356.42 + 352.33 + 91.25; mora 8.75 |
| E11 | Efectivo con cambio | Recibe 300.00, devuelve 50.00, registra 250.00 |
| E12 | Liquidación de un préstamo plano | 850.00; condona 200.00 |
| E13 | Liquidación de un préstamo de cuota fija | 862.98 |
| E14 | Corregir pago de 350.00 a 300.00 | Caja neta +300.00; pendientes 50.00 de capital |
| E15 | Renovación | 620.00 a entregar |

## 15. Lista para validar con el cliente

Esta lista se le puede entregar al cliente tal cual:

1. **Tasas:** ¿las expresan por período, mensual o anual en cada producto? Si es quincenal, ¿«cada 15 días» o «15 y fin de mes»?
2. **Días de cobro:** ¿cobran sábados? ¿Domingos? ¿Cómo manejan los feriados?
3. **Mora:** gracia, tasa, método y tope que usan hoy.
4. **Orden de aplicación de pagos:** ¿estándar (mora → interés → capital) o proporcional?
5. **Liquidación anticipada:** ¿cobran el interés del período en curso completo? ¿Condonan todo el interés futuro?
6. **Cargos:** ¿cuáles cobran, cuánto y en qué modalidad (descontado, financiado o aparte)?
7. **Redondeo:** ¿las cuotas se redondean al centavo o al peso? En RD no circulan centavos: ¿la mora y los montos que se cobran en efectivo también se redondean al peso? El prototipo lo muestra así.
8. **Castigo:** ¿a partir de cuántos días de atraso? ¿Quién lo aprueba?
9. **Abogado:** tasas máximas de interés y de mora, y contenido de los contratos.
10. **Contador:** resuelto por el responsable técnico en la decisión 075 (§16); la empresa puede ajustarlo con el suyo.
11. **Ejemplos reales:** 2 o 3 préstamos anonimizados de cada tipo, con su tabla de pagos, para compararlos con este motor.

## 16. Validación contable y legal (decisión 075)

Jonas no tiene contador: el 08/10/2026 pidió que el responsable técnico validara los puntos contables con investigación propia. Lo que sigue es la posición de Cobradía; cada empresa puede ajustarla con su contador, y lo estrictamente legal sigue marcado para el abogado.

### 16.1 Faltantes y sobrantes de caja

- **Faltante:** se asienta en «Faltantes de caja por cobrar» (`1301`) solo mientras se aclara. Se resuelve de dos formas: el cajero lo **repone** en efectivo en su caja abierta, o el gerente lo **asume como pérdida** («Pérdidas por faltantes de caja», gasto). No se descuenta de la nómina desde el sistema: el artículo 201 del Código de Trabajo solo admite los descuentos autorizados por la ley, las cuotas sindicales, los anticipos, los préstamos bancarios garantizados por el empleador (hasta la sexta parte del salario) y los aportes a pensiones. Un faltante sin resolver por más de 30 días se avisa al gerente.
- **Sobrante:** no es ingreso de inmediato, porque puede ser dinero de un cliente (cambio no entregado, pago sin registrar). Va a un pasivo, «Sobrantes de caja por aclarar». En 30 días el supervisor lo **aplica** desde una caja abierta (devolución al cliente o un pago que se registró después); si nadie lo reclama, la tarea nocturna lo pasa a «Otros ingresos: sobrantes de caja» (`4201`).
- **Cuándo se construye:** con la contabilidad de la fase 6. Hasta entonces el sobrante se asienta directo en `4201`, como en la fase 4.

### 16.2 Reconocimiento de intereses, mora y cargos

- **En la operación diaria** (como hasta ahora): el interés, la mora y los cargos se registran como ingreso al cobrarse. Así la «ganancia cobrada» de la gerencia es exacta y no depende de estimaciones.
- **En los estados financieros:** la norma contable del país es la NIIF para las PYMES, adoptada por el ICPARD desde 2014, y exige la base de devengo (2.36). Los préstamos se miden al costo amortizado (sección 11). Por eso el **cierre de mes** (F15, fase 6) agrega un asiento de devengo: el interés corrido y no cobrado de los préstamos con **hasta 90 días de atraso** (débito «Intereses por cobrar», crédito «Ingreso por intereses»), que se reversa solo el día 1 del mes siguiente para que el cobro siga asentándose igual.
- **Préstamos con más de 90 días:** no devengan. Es la práctica prudencial del sistema financiero: la Superintendencia de Bancos provisiona por completo los rendimientos vencidos a más de 90 días.
- **La mora** se reconoce solo al cobrarse: es incierta y muchas veces se condona.
- **Los cargos de cierre** se reconocen al desembolso. En préstamos cortos, diferirlos no cambia la cifra de forma importante (materialidad, 2.6). Si una empresa da préstamos largos, su contador puede pedir el diferimiento, que se agregaría al cierre de mes.

### 16.3 Impuestos

- **ISR:** el interés es renta gravada de la empresa (27 % para personas jurídicas), y la DGII grava los intereses devengados. El reporte mensual de devengo del cierre sirve para la declaración.
- **ITBIS:** los intereses de préstamos están **exentos** (art. 344 del Código Tributario; Norma General 02-20 y Decreto 293-11, art. 14 d). La mora sigue al interés. Un cargo que no sea el servicio financiero en sí (por ejemplo, un seguro o un GPS que la empresa revende) puede estar gravado: en la fase 6 cada cargo del producto se marca «exento» (por defecto) o «gravado 18 %». Como presta un servicio exento, el ITBIS que la empresa paga en sus compras va a su costo.
- **Comprobantes fiscales:** la facturación electrónica (e-CF) es obligatoria para todos los contribuyentes desde el **15/11/2026** (Ley 32-23; la DGII prorrogó el plazo de las micro y pequeñas empresas con el Aviso 06-26).
  - Cada cobro que incluya interés, mora o cargos lleva su comprobante: E32 de consumo por defecto, o E31 de crédito fiscal si el cliente tiene RNC y lo pide. Lo mismo vale para un cargo cobrado al desembolsar.
  - El capital no es ingreso y no se factura.
  - La fase 6 construye los comprobantes y su numeración. Para emitirlos ante la DGII hacen falta el certificado digital de cada empresa y un proveedor certificado o un emisor propio: eso **depende de Jonas** (elegir el proveedor y obtener sus credenciales).

### 16.4 Mora por defecto y tasas máximas

- **Valores por defecto que se mantienen:**
  - 3 días de gracia;
  - 5 % mensual prorrateado por día, solo sobre lo vencido de cada cuota y sin capitalizar (nunca mora sobre mora ni sobre el saldo total);
  - tope del 10 % de lo vencido.

  Coincide con la práctica del mercado regulado: por ejemplo, el pagaré de préstamo personal de Promerica, aprobado por la Superintendencia de Bancos en 2025, pacta un 5 % mensual sobre la parte vencida.
- **Marco legal que cambió en 2026:**
  - La Ley 183-02 (art. 91) había derogado la Orden Ejecutiva 312 de 1919, que fijaba el interés convencional máximo en 1 % mensual y castigaba la usura.
  - El 05/05/2026 la sentencia **TC/0235/26** declaró inconstitucional esa derogación de las sanciones y exhortó al Congreso a legislar.
  - El 07/05/2026 se depositó en el Senado un proyecto de ley: la Junta Monetaria fijaría topes a la tasa y al **costo total del crédito**, en el mercado formal y en el informal.
  - Al 08/10/2026 no hay ley aprobada.
- **Lo que hace Cobradía:**
  - El simulador, la solicitud, el pagaré y la tabla de pagos muestran el **costo anual efectivo con cargos**: la tasa diaria compuesta a 365 días que iguala lo que el cliente recibe con lo que paga. A diferencia de la «tasa anual equivalente» nominal, revela el costo real de un préstamo plano.
  - Muestran también el **costo total** (intereses + cargos).
  - Hay un **tope de costo anual efectivo** en dos niveles: el legal, que la plataforma fija para todas las empresas cuando exista la ley (`LEGAL_MAX_EFFECTIVE_ANNUAL_RATE`), y el propio de cada empresa (Ajustes → Empresa).
  - Por encima del tope no se cotiza, ni se aprueba, ni se desembolsa un préstamo nuevo; los migrados ya existen y no se bloquean.
- **Validar con el abogado:** el valor del tope cuando salga la ley y el contenido de los contratos.

### 16.5 Límite de efectivo del cobrador

- No hay norma legal: es un control de riesgo (asaltos y pérdidas en la calle).
- RD$ 25,000 queda como valor por defecto y se cambia en Ajustes → Empresa. Conviene que no supere la cobertura de la póliza de valores en tránsito de la empresa, si la tiene.
- Para que el límite sirva, el cobrador puede **dejar efectivo en una caja sin cerrar su ruta** (entrega parcial). Al bajar del límite, un nuevo exceso vuelve a avisar al supervisor.

### 16.6 Otros puntos legales detectados (para el abogado)

- **Captación del público:** la financiera presta con capital propio. Captar fondos del público para prestarlos es intermediación financiera y requiere autorización de la Junta Monetaria (Ley 183-02); el nuevo Código Penal la castiga. Lo dirán los términos de servicio (fase 10).
- **Prevención de lavado (Ley 155-17):** las casas de empeño y las empresas de factoraje son sujetos obligados supervisados por la DGII. Los prestamistas con capital propio no aparecen expresamente. La fase 7 agrega un reporte de transacciones en efectivo desde un umbral configurable (US$ 15,000 por defecto) para quien lo necesite.

**Fuentes consultadas:**
- Resolución del ICPARD que adopta la NIIF para las PYMES.
- Orden Ejecutiva 312, publicada por la Superintendencia de Bancos.
- Notas de prensa de Acento, Diario Libre y El Caribe sobre la sentencia TC/0235/26 y el proyecto de ley de usura.
- Norma General 02-20 de la DGII y su consulta sobre leasing financiero.
- Prórroga del e-CF (DGII, 06/05/2026).
- Pagaré de préstamo personal de Promerica, aprobado por la Superintendencia de Bancos.
- Listado de sujetos obligados no financieros de la DGII.
- Artículo 201 del Código de Trabajo.
