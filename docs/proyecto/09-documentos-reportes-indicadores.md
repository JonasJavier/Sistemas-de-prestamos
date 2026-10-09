# 09 · Documentos, reportes e indicadores

**Estado:** aprobado el 04/10/2026 (decisión 049)

Qué documentos emite Cobradía, cómo se ven, y la **definición exacta de cada indicador** para que una cifra signifique lo mismo en el tablero, el reporte y el PDF. Corrige los [defectos documentales de la referencia](../referencia/08-documentos.md#84-defectos-encontrados-en-los-documentos) y aplica el [plan de mejora 8.5](../referencia/08-documentos.md#85-qué-haremos-mejor).

## 1. Marco común de los documentos

- **Motor:** plantillas HTML → PDF con WeasyPrint; el pagaré notarial en DOCX (docxtpl) porque lo edita el notario. Excel con openpyxl.
- **Por empresa:** cada empresa usa las plantillas de fábrica y puede personalizarlas (texto y logo); cada plantilla tiene versión y `legal_status` (pendiente o validada). Las legales de fábrica no se usan sin validación (decisión 015).
- **Encabezado:** logo, razón social, RNC, sucursal y contacto **de la empresa** (tenant). Si no subió logo, un monograma generado con sus iniciales (nunca la foto de un usuario, defecto de la referencia).
- **Pie de página:** número de página «1 de N», folio del documento, usuario que lo emitió, fecha y hora, y la línea «Generado con Cobradía · cobradia.com». Desde la fase 9, código QR de verificación (`/v/:token`).
- **Formato:** carta (el notarial, A4 si el notario lo pide), Inter, `RD$ 1,250.00`, fechas `04/10/2026`, cifras en letras con librería probada para español.
- **Registro:** todo documento emitido queda en `GeneratedDocument` (quién, cuándo, versión de plantilla, `sha256`) y se reimprime idéntico, cualquier pago, no solo el último.
- **Condiciones:** un documento solo se genera si su condición se cumple (la intimación exige atraso real; la carta de saldo, cálculo vigente). Los legales nacen en borrador y piden confirmar los datos variables antes de emitir.

## 2. Catálogo de documentos

### Operativos (fases 3–4)

| Documento | Cuándo | Contenido clave |
| --- | --- | --- |
| Cotización del simulador | P25, al cotizar | Condiciones, tasas equivalentes (por período, mensual, anual), tabla de pagos, total a pagar; «no es una oferta» y vigencia |
| Pagaré y tabla de pagos | Al desembolsar | Acreedor = **la empresa** (no el usuario); capital, cargos, **total contractual**; tabla completa; consentimiento de datos; firmas cliente, garantes y empresa |
| Recibo de pago (carta y térmico 80 mm) | Al cobrar | Desglose por cuota y componente (cargos, mora, interés, capital), condonaciones aparte, **total recibido = suma exacta**, cambio, saldo posterior, forma de pago |
| Estado de cuenta | A pedido | Condiciones vigentes, calendario con pagos aplicados, **incluida la mora pendiente**, saldos a la fecha |
| Carta de saldo | P36 | Saldo para saldar con desglose y «válido hasta»; versión final de «saldado» al liquidar |
| Cierre de caja | F7 | Fondo, movimientos por medio de pago, rendiciones, arqueo por denominación, esperado vs. contado, diferencia y aprobación |
| Rendición del cobrador | F6 | Cobros del día del cobrador, efectivo a entregar, diferencia y firmas |

> **Fase 4 (decisiones 066 y 068):** el recibo se imprime desde el navegador en hoja o en 80 mm a partir de datos inmutables (el pago, su desglose y el saldo posterior congelado) y lleva la marca «Reversado» si se reversa; su enlace público solo muestra ese recibo. El estado de cuenta (cada vez que se pide, con su folio), el cierre de caja (al aprobarse), la rendición del cobrador (al recibirse), la carta de saldo y la carta de saldo final (al liquidar) se emiten en PDF y se guardan una vez en el registro de documentos (decisión 049).

### Legales (fase 8, validación previa del abogado)

| Documento | Formato | Notas |
| --- | --- | --- |
| Pagaré notarial | DOCX | Datos reales del expediente (estado civil, nacionalidad, ocupación); nada de texto fijo falso |
| Contrato de préstamo con garantía prendaria (vehículo) | PDF/DOCX | Descripción del bien desde Garantías |
| Contrato con garantía hipotecaria | PDF/DOCX | Título y designación catastral desde Garantías |
| Acto de intimación de pago | PDF | Solo con atraso real y por el monto exigible correcto |
| Mandamiento de pago | PDF | Con alguacil del catálogo |
| Acto de entrega voluntaria | PDF | Bien descrito automáticamente |

### Reportes (fases 6–7; todos con PDF y Excel)

Resumen y tabla en la misma página, totales al pie, filtros impresos en una línea, mismos filtros que la pantalla (el enlace de la pantalla reproduce el reporte).

| Reporte | Contenido |
| --- | --- |
| Caja | Por sesión o rango: movimientos por medio y tipo, diferencias |
| Cobros | Por rango, sucursal, cobrador y medio; con desglose por componente |
| Desembolsos | Por rango y producto; bruto, cargos y neto |
| Cartera | Saldos por sucursal, cobrador y producto; antigüedad; PAR30 |
| Atrasos | Por tramo, con días, monto vencido y gestor |
| Gestiones y promesas | Actividad por gestor; cumplimiento de promesas |
| Resultados (gasto-ingreso) | Ingresos cobrados por tipo menos gastos operativos; lo del dueño aparte (P61, fase 6: en pantalla e imprimible; PDF y Excel con el centro de reportes de la fase 7) |
| Cierre de mes | PDF emitido al cerrar: estado de resultados del mes, balance al último día, la lista verificada y el devengo (fase 6) |
| Formatos 606 y 607 | CSV con las columnas de la DGII: compras con NCF del mes (ITBIS llevado al costo) y comprobantes emitidos (ingresos financieros); se validan con la herramienta de la DGII (fase 6) |
| Comisiones | Cálculo del período por empleado, con su regla |

### De la plataforma (fase 1; emite Cobradía, no la empresa)

| Documento | Notas |
| --- | --- |
| Recibo de pago de suscripción | Para la empresa que pagó su plan; el tratamiento fiscal (NCF) se define con el contador del dueño. **Validar** |

## 3. Indicadores con definición exacta

Toda cifra sale del libro de movimientos o de las cuotas; nunca de una caché sin verificar. Cada KPI muestra su definición en un «?» (paso 8, §5).

| Indicador | Definición exacta |
| --- | --- |
| **Cartera activa** | Suma del capital pendiente de los préstamos `active` (excluye castigados, saldados, anulados) a la fecha de corte |
| **Cartera en riesgo (PAR30)** | Capital pendiente **total** de los préstamos con cuota vencida hace más de 30 días ÷ cartera activa. Se reporta también PAR7 y PAR90 |
| **Mora por tramos** | Conteo y capital pendiente de préstamos agrupados por su cuota impaga más antigua: al día, 1–7, 8–30, 31–60, 61–90, 90+ |
| **Cobrado hoy** | Suma de `monto aplicado` de los pagos `posted` de hoy (los reversos restan el día que se reversan) |
| **Esperado hoy** | Suma de cuotas que vencen hoy + vencidas con promesa para hoy, a valor exigible (incluye mora al corte) |
| **Tasa de recuperación del día** | Cobrado hoy ÷ esperado hoy |
| **Desembolsado del mes** | Suma de montos brutos de desembolsos del mes calendario |
| **Ganancia cobrada del período** | Intereses + mora + cargos **cobrados** − gastos operativos del período. Es la cifra de gestión; el estado de resultados contable agrega el devengo del cierre de mes (decisión 075) |
| **Cumplimiento de promesas** | Promesas `kept` ÷ promesas resueltas (`kept + broken`) del período |
| **Clasificación del cliente (A/B/C/D)** | Puntuación explicable: % de cuotas pagadas a tiempo (peso 50), días promedio de atraso (30), antigüedad y número de préstamos saldados (20); los umbrales exactos se calibran en la fase 7 y se muestran los factores |
| **Diferencias de caja del período** | Suma absoluta de diferencias justificadas en cierres; meta: 0 |
| **(Plataforma) Conversión de la prueba** | Empresas que pasaron a `activa` ÷ empresas cuya prueba terminó en el período |
| **(Plataforma) Empresas activas** | Empresas `activa` con suscripción vigente a la fecha |

**Regla de coherencia:** el tablero, el reporte en pantalla, el PDF y el Excel calculan cada indicador con **la misma consulta** (misma definición, mismos filtros, misma fecha de corte impresa).

## 4. Decisiones de este paso

| # | Decisión | Estado |
| --- | --- | --- |
| 049 | Marco documental (§1), catálogo (§2) y definiciones de indicadores (§3) de este documento | Aprobada |
