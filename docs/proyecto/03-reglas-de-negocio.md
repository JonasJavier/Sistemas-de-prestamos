# 03 · Reglas de negocio y motor financiero

**Estado:** aprobado como base el 28/09/2026 (decisiones 021 y 022); los valores por defecto quedan sujetos a la validación del cliente (§15)
- Cada regla trae un **valor por defecto** que se puede configurar por producto.
- Lo marcado con **Validar** debe confirmarlo el cliente; lo legal y lo contable, con su abogado y su contador.

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
| Redondeo de la cuota | Al centavo, al peso, a 5 o a 10 | Al centavo |
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
- total de intereses;
- total de cargos;
- total a pagar.

**Validar con el abogado:** tasas máximas permitidas.

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

**Reglas de la mora:**
- Una tarea nocturna actualiza la mora para los reportes; el cobro siempre la recalcula a la fecha del pago.
- La mora nunca se aumenta a mano. Solo se **condona**, total o parcialmente, con permiso y motivo, y la condonación aparece aparte en el recibo.

**Validar con el abogado:** tasas máximas de mora.

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
- En el método plano, el pago extra adelanta cuotas. Para ahorrar interés existe la liquidación anticipada (§9).

### 8.4 Efectivo, cambio y medios de pago

**E11** · El cliente debe 250.00 y entrega 300.00: el cambio es de 50.00 y el pago registrado, de 250.00. La caja sube 250.00.

**Medios de pago:**
- Efectivo, que entra en la caja del cajero.
- Transferencia, depósito o cheque, que entran en la cuenta bancaria elegida, con su número de referencia.

### 8.5 Seguridad del cobro

- **Sin cobros dobles:** cada cobro lleva una clave de idempotencia y bloquea el préstamo mientras se registra, así que dos cajeros no pueden cobrar la misma cuota a la vez.
- **Recibo:** tiene numeración consecutiva, en hoja o en formato térmico de 80 mm, y siempre muestra el desglose completo.

## 9. Liquidación anticipada (saldo para saldar)

**Saldo para saldar** = capital pendiente + interés vencido sin pagar + mora + cargos pendientes + **interés del período en curso** (completo, o proporcional a los días si el producto lo indica).
- El interés de las cuotas futuras **se condona** por defecto (se cobra el 0 %); el producto puede fijar otro porcentaje. **Validar**.

**E12** · Plano E1 con la cuota 1 pagada y el período 2 en curso: 750.00 de capital + 100.00 de interés en curso = **850.00**. Se condonan 200.00 de interés futuro.

**E13** · Cuota fija E4 con la cuota 1 pagada: 784.53 de saldo + 78.45 de interés en curso = **862.98**.

**Reglas de la liquidación:**
- Cualquier descuento adicional requiere permiso y motivo, y aparece como concepto aparte en el recibo.
- La **carta de saldo** indica el monto y la fecha hasta la que es válido.

## 10. Reversos y correcciones

- **Nada se borra.** Un pago se **reversa completo**, con motivo, permiso y un enlace al pago original. Las cuotas vuelven a su estado anterior.
- **Si la caja del pago ya cerró:** el reverso entra en la caja abierta del día, como ajuste.
- **«Corregir pago»:** reversa el pago y registra el correcto en una sola operación. Así se logra el efecto de un reverso parcial sin romper la conciliación (la referencia sugería un reverso parcial que no existía, defecto #37).

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

**Validar con el contador:**
- Propuesta: reconocer el interés **al cobrarlo**, que es lo más simple para una financiera mediana. La alternativa es reconocerlo cuando se devenga.
- Tratamiento fiscal de intereses y cargos (NCF / e-CF).

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
10. **Contador:** reconocimiento de intereses y comprobantes fiscales.
11. **Ejemplos reales:** 2 o 3 préstamos anonimizados de cada tipo, con su tabla de pagos, para compararlos con este motor.
