# Revisión legal y fiscal de Cobradía (A8 y A9)

**Fecha:** 25 de octubre de 2026 · **Hecha por:** el responsable técnico, actuando como abogado a pedido de Jonas (decisiones 051 y 127) · **Alcance:** lo que Cobradía vende (A8: RNC, ITBIS, comprobantes), los términos de servicio y el aviso de privacidad, y las plantillas legales que el sistema entrega a todas las financieras (A9).

> Aviso honesto: esta revisión la hizo una IA con la ley dominicana vigente a la fecha y las fuentes que se citan al final. Es un trabajo serio y se aplicó al producto, pero no sustituye a un abogado colegiado cuando haya un pleito real. Lo que conviene que un abogado mire algún día está marcado con **⚖️**.

## 1. Lo fiscal: qué tiene que hacer Jonas para cobrar (A8)

| Punto | Lo que dice la norma | Qué hacer |
| --- | --- | --- |
| **RNC** | Una persona física con actividad comercial se inscribe en el RNC con el formulario RC-01 y su cédula, por la Oficina Virtual de la DGII. Es gratis; el RNC es el número de la cédula. Plazo: 24 horas, hasta 15 días laborables si la DGII verifica la actividad. | Inscribirse como **persona física** con actividad «servicios de software / informática». No hace falta SRL para empezar; se constituye cuando haya ingresos que justifiquen separar el patrimonio. |
| **ITBIS** | El servicio de software por suscripción está gravado con el 18 %. Los precios decididos (990 / 2,290 / 3,690) ya se publican **sin ITBIS** (decisión 124), así que el impuesto se agrega en la factura. | Declarar el ITBIS cada mes (IT-1) desde el primer cobro con factura. Nota: la financiera presta un servicio exento, así que el ITBIS que paga por Cobradía es costo para ella; es lo normal en el mercado. |
| **Comprobantes fiscales** | La factura en papel (B01) ya no es la vía: la Ley 32-23 obliga a la **factura electrónica (e-CF)** a todos; micro, pequeños y no clasificados vencen el **15/11/2026** (Aviso 06-26). Quien se inscribe en el RNC después del vencimiento de su grupo tiene **120 días desde la inscripción** para emitir e-CF (Decreto 587-24, art. 7). | Al tener el RNC: (1) obtener un **certificado de firma digital** de persona física (Cámara de Comercio / proveedores autorizados por el INDOTEL); (2) darse de alta como emisor electrónico en la Oficina Virtual; (3) usar el **Facturador Gratuito de la DGII** (sirve para el volumen de los primeros meses). Cada pago de suscripción lleva un **E31** (crédito fiscal) al RNC de la financiera, o **E32** si no tiene RNC. |
| **ISR** | Persona física: exención anual de RD$ 416,220 hoy y RD$ 480,000 desde el ejercicio 2027 (Ley 30-26, art. 10); el excedente paga por escala hasta el 25 % (27 % solo sobre RD$ 4.8 millones). Declaración anual IR-1 en marzo. | Con los ingresos del primer año no habrá impuesto; igual se declara. |
| **RST (opcional)** | La Ley 30-26 amplió el Régimen Simplificado de Tributación: personas físicas de servicios hasta RD$ 15 millones al año, con declaración anual simplificada de ITBIS e ISR. Su reglamento todavía no sale (Aviso 10-26 de la DGII). | No hace falta ahora. Revisar cuando la DGII publique el reglamento, porque simplifica mucho el mes a mes. |
| **Pagos al exterior** | La Ley 30-26 (art. 22) fija una retención del 15 % sobre pagos al exterior por licencias de software y almacenamiento de datos cuando el que paga es agente de retención. Railway, Sentry y similares se pagan con tarjeta personal. | **⚖️** Preguntar al contador, al inscribirse, si como persona física debe retener por esos pagos. Hoy no aplica (no hay RNC). |
| **Marca** | La marca Cobradía se registra en la ONAPI (Ley 20-00), clase 42 (software como servicio). Vale unos RD$ 5,000–8,000 y dura 10 años. | Antes de invertir en publicidad. No es urgente. |
| **Pro Consumidor** | Los términos de Cobradía son un contrato **entre empresas**; Pro Consumidor no registra contratos B2B. | Nada que registrar por Cobradía. (Las financieras sí: ver §3.) |

**Lo que construye Cobradía cuando Jonas tenga el RNC (D4):** el recibo de la suscripción en PDF con el RNC, el e-NCF, el ITBIS desglosado y el período pagado, descargable desde Suscripción. Mientras tanto, el comprobante confirmado en la app ya vale como constancia de pago.

## 2. Términos de servicio y aviso de privacidad (A9, parte 1)

Lo revisado y lo que se corrigió el 25/10/2026 en `cobradia.com/terminos` y `/privacidad`:

| # | Hallazgo | Norma | Corrección |
| --- | --- | --- | --- |
| T1 | No decían quién presta el servicio. | Ley 126-02 (identificación del oferente); práctica contractual | Nueva sección «Quién presta el servicio»: Jonas Javier Encarnación, República Dominicana, correo de contacto. Se agrega el RNC cuando exista. |
| T2 | La aceptación en línea no decía con qué valor. | Ley 126-02, arts. 4–9 (validez del documento y la firma digital) | Se explica que aceptar en línea vale como firma y que se guarda versión, fecha y cuenta (`LEGAL_TERMS_VERSION`). |
| T3 | Precios sin decir si incluían impuestos ni qué comprobante se da. | Código Tributario (ITBIS 18 %); Ley 32-23 (e-CF) | Precios sin impuestos; ITBIS en el comprobante cuando aplique; e-CF al RNC de la financiera; el período empieza al confirmar el pago; los cambios de precio aplican al período siguiente. |
| T4 | Faltaba la prohibición de captar fondos del público. | Ley 183-02 (intermediación financiera); Código Penal Ley 74-25, vigente desde el 03/08/2026 (intermediación financiera no regulada) | Cláusula expresa en «Uso permitido». |
| T5 | Faltaban las obligaciones propias de la financiera (lavado, Pro Consumidor, registro mercantil). | Ley 155-17; Ley 358-05, art. 81; Ley 3-02 | Párrafo que las deja a su cargo. |
| T6 | Faltaba la prohibición de cobrar con acoso o engaño. | Ley 358-05 (prácticas abusivas); Código Penal | Cláusula en «Uso permitido». |
| T7 | Consentimiento para burós de crédito: no se decía que debe ser escrito. | Ley 172-13, art. 5 (consentimiento libre, expreso y **por escrito** para las SIC) | Los términos lo exigen a la financiera; el pagaré y los contratos lo incluyen (§3). |
| T8 | Sin cláusula de indemnidad ni de fuerza mayor ni de cesión. | Derecho común | Agregadas, en lenguaje llano. |
| T9 | Jurisdicción directa sin intento previo de arreglo. | Ley 358-05, art. 83 d) (en B2C el arbitraje obligatorio es abusivo; en B2B vale) | 30 días de negociación de buena fe y después los tribunales del Distrito Nacional, «sin perjuicio de las normas de orden público». Al ser contrato entre empresas, es válido. |
| P1 | El aviso no identificaba al responsable. | Ley 172-13, art. 7 (deber de información) | Responsable y contacto en el primer párrafo. |
| P2 | El papel de encargado estaba enunciado pero sin obligaciones concretas. | Ley 172-13 (encargado del tratamiento); práctica de los contratos de encargo | Lista de obligaciones: solo instrucciones, confidencialidad, seguridad, subencargados con aviso de 30 días, **aviso de incidentes en 72 horas**, ayuda con derechos ARCO, no consultar SIC, devolución o borrado al terminar. |
| P3 | Transferencia internacional sin nombrar el país ni la base. | Ley 172-13 (transferencia a países con nivel adecuado o bajo contrato) | Se nombra Railway en Estados Unidos y la base contractual. |
| P4 | Plazo de respuesta indefinido («el que fija la ley»). | Ley 172-13 (vía judicial abierta si no hay respuesta en 10 días) | Respuesta en máximo 10 días hábiles y mención de la vía judicial. |
| P5 | Conservación: no se mencionaba lo fiscal. | Código Tributario (10 años) | Excepción explícita para los comprobantes de la suscripción. |
| — | Banda «borrador pendiente de validación legal». | — | Se quita (decisión 127). La versión sigue fechada. |

**No hay ley nueva de datos:** se verificó que la Ley 172-13 sigue vigente en octubre de 2026 (no se aprobó la ley orgánica que se discute desde 2024). Si sale, se revisa el aviso.

## 3. Plantillas legales de las financieras (A9, parte 2)

Las plantillas se generan con los datos reales del expediente (`backend/apps/documents/legal.py`). Lo que se corrigió:

| Documento | Hallazgo | Norma | Corrección |
| --- | --- | --- | --- |
| **Contrato con garantía sobre vehículo** | Decía «prenda sin desapoderamiento», figura reemplazada en 2020. Faltaban el monto máximo garantizado, la autorización para inscribir y el pacto de ejecución. | **Ley 45-20** de Garantías Mobiliarias: art. 5 (toda prenda es garantía mobiliaria), art. 15 (no exige notario), **art. 16** (contenido mínimo: partes, monto máximo, domicilio, bien, obligación, autorización para inscribir en el SEGM, mención de la ejecución extrajudicial), **art. 46** (vehículos: publicidad en el SEGM, que sustituye la oposición en la DGII y la inscripción en el Juzgado de Paz), arts. 87 y 94–104 (ejecución extrajudicial: ejecutor, 3 días francos, aviso, venta, excedente al deudor, saldo insoluto), art. 121 (el deudor detiene la ejecución pagando). | Nuevo título «Contrato de préstamo con garantía mobiliaria sobre vehículo»; cláusula SEGUNDO con el **monto máximo garantizado** (capital + intereses programados, redondeado al millar); cláusulas QUINTO (autorización e inscripción en el SEGM, gastos y cancelación) y SEXTO (pacto de ejecución extrajudicial con los derechos del deudor). |
| **Contrato con garantía hipotecaria** | No decía su forma ni su inscripción. | **Ley 108-05** de Registro Inmobiliario; criterio de la SCJ (Primera Sala): la hipoteca sobre inmueble registrado puede constituirse por acto bajo firma privada con **firmas legalizadas por notario**, y debe inscribirse en el **Registro de Títulos** para ser oponible. Ley 140-15, art. 19 (notario de la jurisdicción del inmueble). | Cláusulas QUINTO (legalización, inscripción, gastos, radiación) y SEXTO (embargo inmobiliario; declaración de que no hay otros gravámenes). Nota: el impuesto de registro de hipotecas baja al 1 % en 2027 y desaparece en 2028 (Ley 30-26, art. 59). |
| **Ambos contratos** | No exponían tasa, mora ni costo; faltaba el consentimiento de datos; los fiadores sin renuncia a excusión y división. | **Ley 358-05, art. 53** (en toda operación a crédito: tasa, mora, cargos, cuotas, derechos en caso de atraso) y **art. 55** (pago anticipado con reducción proporcional de intereses); Ley 172-13, art. 5; Código Civil, arts. 2021 y 2026. | Cláusula PRIMERO con **tasa por período, equivalente mensual, días de gracia, mora y tope**, remitiendo al pagaré y la tabla; cláusula CUARTO con el pago anticipado; consentimiento de datos y SIC; fiadores solidarios con renuncia a excusión y división; elección de domicilio. |
| **Pagaré notarial** | Cumplía la forma (cantidades y fechas en letras y números, identificación con cédula, estado civil, lectura y firma), pero no exponía las condiciones ni citaba la base de su fuerza ejecutoria. | **Ley 140-15, art. 31** (un solo contexto, español, letras y números, identificación, lectura, firmas) y art. 44 (la primera copia sirve de título ejecutorio); **art. 545 del Código de Procedimiento Civil** (modificado por la Ley 45-20, art. 133): fuerza ejecutoria de los actos notariales con obligación de pagar. No exige testigos instrumentales salvo los casos del art. 30 (quien no sabe firmar) y 33 (quien no habla español). | Condiciones del crédito (358-05, art. 53), pago anticipado (art. 55), cláusula de título ejecutorio (art. 545), consentimiento 172-13 y lectura «en alta voz». |
| **Intimación de pago** | Correcta (solo con atraso real y por el monto exigible). | Práctica forense; Ley 358-05 (sin acoso) | Se indica dónde pagar y se advierte de la ejecución de las garantías con gastos a cargo del deudor. |
| **Mandamiento de pago** | «En el plazo de ley» sin decir cuál, y sin mencionar el título. | **Art. 583 del Código de Procedimiento Civil**: el embargo ejecutivo va precedido de un mandamiento de pago notificado al menos **un día** antes, con el título ejecutorio en cabeza si no se notificó antes. | Plazo de un (1) día franco, mención del título ejecutorio notificado en cabeza del acto y advertencia del embargo ejecutivo (arts. 583 y ss.). |
| **Entrega voluntaria** | No decía qué pasa con el bien después (riesgo de reclamo por apropiación). | Ley 45-20, arts. 88 (desposesión convenida), 94–104 (venta, excedente, saldo insoluto), 97 y 121 (el deudor recupera el bien si paga antes de la venta). | Párrafos que remiten al pacto de ejecución, explican el destino del producto y conservan el derecho del deudor a pagar. |

**Lo que sigue siendo responsabilidad de cada financiera (y lo dicen los términos):**

- **Registrar su contrato de préstamo en Pro Consumidor** (Ley 358-05, art. 81; RD$ 2,000 por contrato): el contrato con sus clientes es un contrato de adhesión con consumidores. El DOCX que entrega Cobradía sirve para ese registro.
- **Inscribir cada garantía mobiliaria en el SEGM** y cada hipoteca en el Registro de Títulos: sin inscripción no hay oponibilidad ni título ejecutorio.
- **Formalizar el pagaré ante un notario** de su jurisdicción.
- **Ley 155-17:** los prestamistas con capital propio **no** están en la lista de sujetos obligados (arts. 32 y 33: sí lo están las casas de empeño, el factoraje, las cooperativas y los agentes de cambio). El Comité Nacional contra el Lavado puede incluirlos por reglamento (art. 32, párrafo I). Cobradía ya trae el reporte de transacciones en efectivo desde US$ 15,000 (art. 52) para quien lo necesite.
- **Tasas:** no hay tope legal vigente en octubre de 2026. La sentencia **TC/0235/26** (05/05/2026) declaró inconstitucional la derogación de las sanciones a la usura y exhortó al Congreso; el proyecto de ley (07/05/2026) sigue en el Senado. Cobradía ya muestra el costo anual efectivo y tiene el tope configurable (`LEGAL_MAX_EFFECTIVE_ANNUAL_RATE`) para el día que salga la ley. **⚖️** Vigilar el Congreso.

## 4. La marca: CobraDia existe, Cobradía se registra (decisión 128)

El 25/10/2026 Jonas encontró **CobraDia** (cobrodia.online), de la agencia SonhoLab (Brasil): software de cobros diarios para Colombia, Perú, México y Brasil, nuevo (© 2026), en dólares, sin marca registrada y sin presencia en el país. El nombre suena igual y el rubro es el mismo, así que el riesgo es que registren primero en la ONAPI: en el país la marca es de quien la registra, no de quien la usa (Ley 20-00, sistema atributivo). Jonas se queda con Cobradía (tiene el .com) y la registra ya.

## 5. Cómo registrar la marca en la ONAPI (persona física, sin abogado)

Tasas oficiales de la ONAPI (página «Registro de marca denominativa», 2023, vigentes en 2026): solicitud **RD$ 5,720**, publicación **RD$ 1,210**, clase adicional **RD$ 4,110**; búsqueda de antecedentes **RD$ 600** (5 días laborables). Plazo de la ONAPI: certificado en no más de 3 meses si no hay oposición (45 días desde la publicación para que un tercero se oponga). Vigencia: 10 años, renovable.

1. **Búsqueda de antecedentes** (RD$ 600): pedirla en línea en onapi.gov.do/siteServices (ESERPI) o en la sede (Av. de los Próceres 11, Los Jardines del Norte, 7:30 a 3:00). Confirma que nadie tenga «Cobradía», «Cobradia» o «CobraDia» en las clases 42, 9 y 36.
2. **Solicitud de marca denominativa** en ESERPI (cuenta con la cédula): denominación **COBRADÍA**; tipo denominativa (solo la palabra, sin logo: protege el nombre en cualquier diseño); solicitante Jonas Javier Encarnación, cédula, domicilio, correo y teléfono; **clase 42** (Niza): «software como servicio (SaaS) para la administración de préstamos, cobros, caja y contabilidad; alojamiento de plataformas en línea». Opcional, **clase 9** (RD$ 4,110 más): «aplicaciones móviles descargables para la gestión de préstamos y cobros», si habrá app en las tiendas. Se paga con tarjeta en línea.
3. **Examen de forma y publicación** (RD$ 1,210): la ONAPI publica la solicitud en su boletín; corren 45 días de oposición.
4. **Certificado**: sin oposición, la ONAPI lo emite (en línea, por correo). Guardarlo con los documentos de la empresa; renovar a los 10 años.
5. **Después:** usar «Cobradía®» en el sitio y la app, y vigilar el boletín de la ONAPI por si alguien pide un nombre parecido (la oposición se presenta en esos 45 días).

**Redes sociales (25/10/2026):** @cobradia está tomado en Instagram (cuenta personal privada, 0 seguidores) y en X (cuenta sin actividad desde 2021); libre en YouTube, LinkedIn, GitHub y, al parecer, en Facebook. Se reserva **@cobradia.do** en Instagram, TikTok, Facebook y YouTube (y «Cobradía» como página de empresa en LinkedIn), con el correo hola@cobradia.com. Si más adelante se quiere @cobradia en Instagram, se puede pedir a Meta por la marca registrada (reclamo de usurpación de marca).

## 6. Qué queda abierto

- **⚖️ Abogado de verdad, una vez:** cuando haya 5–10 clientes, pagar una revisión de los cuatro contratos modelo y de los términos a un abogado colegiado (RD$ 15,000–30,000). Esta revisión le ahorra la mayor parte del trabajo.
- **Jonas:** RNC y alta como emisor electrónico (§1), marca en la ONAPI cuando haya publicidad.
- **Cobradía:** el recibo de la suscripción (D4) cuando exista el RNC; el tope legal de tasas cuando exista la ley; revisar el aviso de privacidad si se aprueba la ley orgánica de datos.

## Fuentes consultadas (octubre de 2026)

- Ley 45-20 de Garantías Mobiliarias (texto íntegro, Guzmán Ariza) y nota de la DGII sobre el SEGM y la oposición de vehículos.
- Ley 108-05 de Registro Inmobiliario; guía de requisitos de la DNRT para la hipoteca convencional; criterio de la Primera Sala de la SCJ sobre la hipoteca bajo firma privada (FC Abogados, Inmobiliario.do).
- Ley 140-15 del Notariado (arts. 16, 19, 30–33, 44, 46).
- Código de Procedimiento Civil, arts. 545 y 583 (y su modificación por la Ley 45-20, art. 133).
- Ley 358-05 de Protección al Consumidor (arts. 53–55, 81–83, 109) y el Registro de Contratos de Adhesión de Pro Consumidor.
- Ley 172-13 de Protección de Datos (art. 5 y deber de información) y circular SB CSB-REG-2026000010 sobre las SIC; verificación de que no hay ley nueva.
- Ley 155-17 (arts. 31–33, 52–55) y su reglamento (Decreto 408-17).
- Ley 32-23 de Facturación Electrónica, Decreto 587-24 (art. 7, nuevos inscritos) y Aviso 06-26 de la DGII (prórroga al 15/11/2026).
- Ley 30-26 de medidas pro crecimiento y simplificación fiscal (18/06/2026) y Aviso 10-26 de la DGII con su calendario.
- Guía de la DGII para la inscripción de personas físicas (RC-01).
- Ley 74-25, Código Penal (vigente desde el 03/08/2026).
- Sentencia TC/0235/26 y proyecto de ley sobre usura (Acento, Diario Libre, El Nuevo Diario, mayo de 2026).
- Ley 126-02 de Comercio Electrónico; Ley 310-14 sobre mensajes comerciales no solicitados; Ley 183-02 Monetaria y Financiera.
