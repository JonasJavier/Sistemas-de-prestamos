# 10 · Hallazgos y cómo lo haremos mejor

Consolidado de todo lo observado. Severidad: **Crítica** (dinero, legal o seguridad), **Alta** (datos incorrectos u operación bloqueada), **Media** (fricción frecuente), **Baja** (forma).

## 10.1 Defectos y riesgos de la referencia

| # | Severidad | Área | Hallazgo | Evidencia |
| --- | --- | --- | --- | --- |
| 1 | Crítica | Cobro | En la liquidación, la cuenta recibió 120 pero el historial, el recibo y la Caja dicen 100 | [FLUJOS caso 8](../FLUJOS_VERIFICADOS.md) |
| 2 | Crítica | Mora | Mora acumulativa sin tope ni gracia (40 % de la cuota en 8 días) y sobrescribible sin motivo | [04](04-cobros-mora-y-atrasos.md#fórmula-verificada-caso-12) |
| 3 | Crítica | Legal | Pagaré notarial con estado civil, ocupación y género fijos; «interés» = cuota | [08](08-documentos.md#84-defectos-encontrados-en-los-documentos) |
| 4 | Crítica | Legal | El pagaré nombra como acreedor a la persona usuaria, no a la empresa | [08](08-documentos.md) |
| 5 | Crítica | Privacidad | Consulta cruzada de deudas entre empresas sin registro de quién consulta | [02](02-clientes-y-consulta.md#21-consultar-consultar) |
| 6 | Crítica | Seguridad | Clave de acceso del cliente generada por GET y visible en texto plano | [02](02-clientes-y-consulta.md#25-clave-de-acceso-del-cliente) |
| 7 | Crítica | Seguridad | El administrador fija contraseñas ajenas; sin contraseña actual ni política | [07](07-administracion.md#79-perfil-y-contraseña-perfil-password) |
| 8 | Alta | Préstamo | Editar fecha acepta fechas anteriores al inicio y desordena cuotas (#2 antes que #1) | FLUJOS casos 10 y 12 |
| 9 | Alta | Préstamo | Guardar mora por préstamo → HTTP 405 | [03](03-solicitud-y-prestamos.md#35-expediente-del-préstamo-prestamoclienteshowprestamo) |
| 10 | Alta | Cuentas por pagar | Pago parcial marca como pagada y pierde el saldo | FLUJOS caso 4 |
| 11 | Alta | Reportes | Totales de Cartera no respetan el filtro; «capital activo» con dos cifras (2,250 y 2,000) | [06](06-cartera-y-clasificacion.md) |
| 12 | Alta | Reportes | «Ganancia» mezcla ingresos y gastos personales con el resultado del negocio | [05](05-finanzas.md#53-ganancia-ganancia) |
| 13 | Alta | Caja | «Efectivo neto» ignora desembolsos; no hay apertura, arqueo ni cierre | [05](05-finanzas.md#51-caja-caja) |
| 14 | Alta | Atrasos | Capital e interés atrasados = 0 cuando la cuota tiene pago parcial | FLUJOS caso 10 |
| 15 | Alta | Documentos | Descargas Livewire con cabeceras HTTP dentro del PDF | [08](08-documentos.md) |
| 16 | Alta | Documentos | Acto de entrega sin descripción del bien y con fecha equivocada | [08](08-documentos.md) |
| 17 | Alta | Préstamo | Incobrable y borrar sin confirmación ni motivo | [03](03-solicitud-y-prestamos.md) |
| 18 | Media | Gastos | Los gastos no se editan; al abrirlos, tipo y categoría aparecen vacíos | [05](05-finanzas.md#52-gastos-gastos) |
| 19 | Media | Cliente | Acordeones de la ficha no abren con clic en la cabecera | [02](02-clientes-y-consulta.md#24-ficha-del-cliente-clienteidshow) |
| 20 | Media | Admin | Botón Guardar del alguacil fuera de la vista | [07](07-administracion.md#77-alguacil-algualcil) |
| 21 | Media | Navegación | Tres pasos para cobrar; home vacía; configuración en el menú del avatar | [01](01-mapa-general.md) |
| 22 | Media | Solicitud | Solicitudes procesadas desaparecen; no hay aprobación ni rechazo | [03](03-solicitud-y-prestamos.md#31-solicitud-solicitud) |
| 23 | Media | Datos | Ciudad en texto libre; sin detección de duplicados | [02](02-clientes-y-consulta.md) |
| 24 | Media | Permisos | Sin roles; faltan permisos para aprobar, desembolsar, editar términos, renovar y configurar | [07](07-administracion.md#72-permisos-permisos-permisosusuario) |
| 25 | Baja | Forma | Errores ortográficos (Algualcil, Usario, Parantesco, Cuidad); rutas con mayúsculas; formato `97'925.00` | Varias |
| 26 | Baja | Técnica | 5 librerías de iconos; jQuery + Livewire mezclados; `/home` sin contenido | [01](01-mapa-general.md#2-stack-técnico-observado) |

### Hallazgos de la segunda pasada

| # | Severidad | Área | Hallazgo | Evidencia |
| --- | --- | --- | --- | --- |
| 27 | **Crítica** | Seguridad | *Seleccionar garante* vinculó a nuestro cliente el **garante de otra empresa** (confusión entre ID por empresa e ID global): fuga de datos personales entre empresas | [02](02-clientes-y-consulta.md#garante-verificado-con-incidente) |
| 28 | **Crítica** | Seguridad | Las imágenes del cliente (p. ej. la cédula) se descargan **sin iniciar sesión** con solo la URL | [02](02-clientes-y-consulta.md#archivos-verificado) |
| 29 | Alta | Cobro | Recibo con «Total Pagado» sin la mora (700 frente a 840 recibidos) | [04](04-cobros-mora-y-atrasos.md), [08](08-documentos.md) |
| 30 | Alta | Cuentas | Desembolso permitido sin fondos: la cuenta quedó en −88 | [03](03-solicitud-y-prestamos.md#344-sobregiro-de-cuentas-verificado-caso-17) |
| 31 | Alta | Cargos | Gastos de cierre ingresan a la cuenta pero no aparecen en Caja ni en Ganancia, y se conservan al borrar el préstamo | [03](03-solicitud-y-prestamos.md#343-gastos-de-cierre-al-guardar-verificado-casos-16-y-17) |
| 32 | Alta | Reportes | Cartera: cada filtro afecta de forma distinta a la tabla y a los totales | [06](06-cartera-y-clasificacion.md) |
| 33 | Alta | Legal | La intimación de pago se genera sin atraso y reclama el saldo total | [08](08-documentos.md) |
| 34 | Media | Préstamo | Préstamo comenzado: marca cuotas pagadas con fecha futura y no registra desembolso sin explicarlo | [03](03-solicitud-y-prestamos.md#342-préstamo-comenzado-verificado-caso-16) |
| 35 | Media | Cálculo | San mensual pierde 1 centavo (999.99 de capital) | [03](03-solicitud-y-prestamos.md#batería-de-calendarios-verificada-inicio-lunes-28092026) |
| 36 | Media | Técnica | Cada tecla del formulario crea o modifica un préstamo borrador y regenera el calendario; HTTP 500 sin fecha | [03](03-solicitud-y-prestamos.md#341-cómo-calcula-verificado-en-el-código-de-la-página) |
| 37 | Media | Cobro | El reverso solo es total; el modal sugiere un reverso parcial que no existe | [04](04-cobros-mora-y-atrasos.md) |
| 38 | Media | Clasificación | La calificación subió (95 → 96.3 %) tras pagar con 8 días de atraso | [06](06-cartera-y-clasificacion.md) |
| 39 | Media | Atrasos | Al cargar, el filtro «Cobrables» muestra préstamos incobrables con total 0 | [04](04-cobros-mora-y-atrasos.md) |
| 40 | Media | Gastos | Dos campos de razón de borrado; el visible está deshabilitado | [05](05-finanzas.md) |
| 41 | Baja | Confirmaciones | Quitar garante, quitar cliente de lista y desactivar sucursal sin confirmación | [02](02-clientes-y-consulta.md), [07](07-administracion.md) |
| 42 | Baja | UI | Gráficos de Ganancia y Clasificación ilegibles o vacíos; mapa de empleados con Google Maps sin clave | [05](05-finanzas.md), [06](06-cartera-y-clasificacion.md), [07](07-administracion.md) |
| 43 | Baja | Cuentas | No se puede borrar ni desactivar una cuenta, solo renombrarla; la anulación de un préstamo no enlaza al movimiento original | [05](05-finanzas.md) |

**Nota sobre el hallazgo 27:** es una vulnerabilidad real del sistema de referencia que expone datos de terceros. No se exploró más y se deshizo el vínculo. Si lo deseas, puedes avisar al proveedor de forma responsable. Para nosotros, la lección es validar **siempre** que cada ID recibido pertenezca a la compañía y al alcance del usuario, aunque tengamos una sola compañía (sucursales y permisos también son límites de acceso).

## 10.2 Funciones de la referencia que debemos cubrir

Inventario mínimo para no quedarnos atrás (MVP salvo que se indique):

- Clientes con laborales, familiares, referencias, garantes reutilizables y archivos.
- 4 productos (San, A Rédito, Amortizado, Pagaré abierto) × 5 frecuencias, días no laborables y migración de préstamos ya comenzados.
- Solicitud con simulador.
- Desembolso desde cuenta; gastos de cierre (% o fijo).
- Cobro parcial, múltiples cuotas, cambio, mora automática, liquidación anticipada con condonación de interés, reverso parcial con motivo.
- Renovación con cálculo de efectivo a entregar.
- Cobrador asignado, listas de cobro y notificación de atrasos.
- Presupuesto (garantías, ingresos, gastos).
- Caja, Cartera, Atrasos y Ganancia con filtros y PDF.
- Cuentas, transferencias y ajustes; gastos e ingresos categorizados; cuentas por pagar recurrentes.
- Clasificación de clientes y carta de saldo.
- Pagaré, pagaré notarial, intimación, mandamiento de pago y entrega voluntaria (fase 2; requieren revisión legal).
- Sucursales, permisos, comisiones (fase 2), ubicación de cobrador (fase 3), mensajería por email/SMS/WhatsApp desde recibo y clasificación (fase 3; la función existe en la referencia), portal del cliente (fase 3).
- **Fuera de alcance por ser una sola compañía:** registro de empresas, licencias y planes, pago de licencia y buró de crédito compartido.
- Estado de cuenta del préstamo (PDF) y modal de resumen rápido.
- Presupuesto con garantías, ingresos y gastos, importando el sueldo de los datos laborales.
- Préstamos ya comenzados (migración) y borrado de préstamos sin pagos.

## 10.3 Diferenciadores que proponemos

| Diferenciador | Por qué importa |
| --- | --- |
| **Conciliación exacta** pago = asignaciones = movimiento = recibo | Elimina los defectos #1 y #13; es el mayor argumento de confianza |
| **Tablero de inicio** con cobros del día, mora por tramos y tareas | Hoy la home está vacía |
| **Cobro en un paso** desde búsqueda global o lista de ruta | La operación más repetida del día |
| **Política de mora transparente** con tope, gracia y vista previa | Protege al cliente final y al prestamista (cumplimiento) |
| **Sesión de caja con arqueo y cierre** | Control interno real por cajero y sucursal |
| **Calendario versionado** y auditoría de todo cambio | Explicar cualquier saldo |
| **Roles y separación de funciones** | Seguridad y control del fraude interno |
| **Plantillas de documentos editables** con datos reales y QR de verificación | Documentos legales correctos y verificables |
| **App de cobrador** *mobile-first* (PWA) con modo sin conexión y recibo térmico | El cobro en calle es el núcleo del negocio |
| **Promesas de pago y gestión de cobro** | Convierte Atrasos en un flujo de trabajo |
| **Exportaciones y API** | Integración con contabilidad y bancos |

## 10.4 Decisiones que este estudio agrega a la matriz

1. ¿Replicamos exactamente los 4 productos o los modelamos como un motor genérico (interés plano, amortizado, solo interés, globo)?
2. ¿La mora se calcula sobre la cuota, el saldo vencido o el capital vencido? ¿Cuál es el tope y cuántos días de gracia?
3. ¿Los gastos de cierre se descuentan del desembolso o se financian en el préstamo?
4. ¿Los documentos legales entran en el MVP o en fase 2?
5. ¿Habrá app móvil de cobrador desde el MVP (PWA) o solo web adaptable?
6. ¿Se contempla compartir información crediticia con terceros? Requiere consentimiento y asesoría legal.
