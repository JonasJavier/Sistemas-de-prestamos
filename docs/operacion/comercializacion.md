# Checklist para comercializar Cobradía

Revisión del 16/10/2026 (código, documentos y producción en Railway). Complementa la [lista de lanzamiento](lanzamiento.md): aquella mide los criterios técnicos del doc 10; esta mide lo que falta para **vender**.

**Quién:** 👤 Jonas (cuentas, pagos, decisiones comerciales, abogado, personas) · 🤖 Claude (lo técnico) · 👤🤖 los dos (Jonas consigue el acceso y Claude lo monta).

## ¿Está listo para vender?

**El producto, sí. El negocio, todavía no.**

- **Producto: completo y probado.** Las fases 1–10 están construidas, con más de 380 pruebas del backend, 16 recorridos de punta a punta, aislamiento entre empresas con RLS, revisión de seguridad sin hallazgos altos y el rediseño en todas las pantallas. Cubre lo que anuncian los competidores del país (Prestan2, PrestamosCloud, Credidata, Easypres, PrestamistAPP) y algo más (decisión 111).
- **Producción: arriba, pero a medias.** `app.cobradia.com` y `cobradia.com` responden y la salud da «ok». Pero **el correo de producción va a Mailpit, un buzón de pruebas**: hoy ninguna empresa puede terminar su registro (la verificación del correo es obligatoria), ni recuperar su contraseña, ni recibir los avisos de fin de prueba. Tampoco hay respaldos externos, monitoreo de errores ni entorno de pruebas (staging).
- **Negocio: falta lo que solo decide o consigue Jonas.** Planes y precios, la forma de cobrar, la validación legal y la empresa que factura.

Con la fase A resuelta se puede vender a un primer cliente piloto. Con A y B, abrir el registro al público. C y D sirven para vender más y mejor.

---

## Fase A · Bloqueos: sin esto no se puede vender

- [x] **A1. Correo real en producción** 👤🤖 *Hecho el 17/10/2026.* Resend (plan gratis: 3,000 correos al mes y 100 al día) con `cobradia.com` verificado (DKIM, envío y DMARC en el DNS de Railway); `api`, `worker` y `beat` envían por SMTP desde `Cobradía <no-responder@cobradia.com>`; correos de prueba desde `api` y `worker` entregados; servicio `mailpit` borrado. Detalle en el [manual de Railway](../../infra/railway/README.md).
  - [ ] 👤 Prueba final: registrar una empresa de prueba en `app.cobradia.com` con tu correo y confirmar que el correo de verificación llega a la bandeja de entrada (no a spam).
  - [ ] 🤖 Subir al plan de pago de Resend cuando los recordatorios a clientes pasen de 100 correos al día.
- [x] **A2. Buzón `hola@cobradia.com`** 👤🤖 *Hecho el 20/10/2026.* Railway reenvía `hola@` a jonasjavier.dev@gmail.com (probado). En ese Gmail, «Enviar como» `Cobradía <hola@cobradia.com>` por el SMTP de Resend (clave `gmail-hola`), firma «Cobradía» con logo solo para esa dirección, y las respuestas salen desde la dirección que recibió el correo. Imágenes de marca en `cobradia.com/marca/`.
  - [ ] 👤 Foto de perfil del remitente: crear una cuenta de Google con `hola@cobradia.com` («Usar mi dirección de correo actual») y subir `site/public/marca/cobradia-perfil.png`. Así Gmail muestra el logo junto a los correos de `hola@`.
  - [ ] 🤖 Más adelante: BIMI (logo de marca en Gmail y Yahoo) cuando DMARC pase a `quarantine` y haya marca registrada; buzones reales con Google Workspace cuando haya personal de soporte.
- [x] **A3. Superusuario del dueño en producción** 👤 *Hecho:* jonasjavier.dev@gmail.com entra a `/plataforma` como dueño (23/10/2026).
- [x] **A4. Respaldos** 👤🤖 *Hecho el 23/10/2026 (decisión 123):* el servicio `respaldo` copia cada noche la base y los archivos, cifrados, al bucket `respaldos` (otra región), guarda 30 días y la restauración se ensayó en Railway con `verificar_integridad` (`infra/railway/README.md`, «Respaldos»).
  - [ ] 👤 Guardar `Documents/cobradia-respaldos/llave-privada-respaldos.asc` en dos lugares fuera de línea (USB y gestor de contraseñas). Sin ella los respaldos no se pueden leer.
  - [ ] 👤 Opcional: activar además los *snapshots* de *Postgres → Backups* en el panel de Railway (plan Pro).
- [ ] **A5. Monitoreo** 👤🤖 *El código está listo (decisión 123): Sentry en servidor y navegador, `APP_VERSION` en cada despliegue.*
  - [ ] 👤 Crear la cuenta de Sentry (plan gratis) con un proyecto *Django* y uno *React*, y poner los DSN: `railway variables --service api --set SENTRY_DSN=…` y `railway variables --service web --set VITE_SENTRY_DSN=…`; luego `infra/railway/deploy.sh api web`.
  - [ ] 👤 Crear la cuenta de UptimeRobot (gratis) con un monitor HTTPS a `https://app.cobradia.com/api/v1/salud/` cada minuto (palabra clave `ok`) y aviso por correo y WhatsApp.
- [ ] **A6. Planes y precios (PT3)** 👤 decide, 🤖 implementa
  - 👤 Cuántos planes, precio mensual y límites de cada uno (usuarios, sucursales y préstamos activos). 🤖 puede prepararte una propuesta con tres planes comparada con los precios de los competidores, para que solo elijas.
  - 🤖 La pantalla Planes del panel ya los crea y edita (decisión 122, 23/10/2026): tú los cargas ahí. Falta publicarlos en `cobradia.com/#precios` (hoy dice «estamos por anunciar») y en la pantalla Suscripción (hoy elegir un plan solo abre un correo).
- [ ] **A7. Cómo te pagan** 👤🤖
  - 👤 Abrir una cuenta bancaria a nombre del negocio. Para empezar basta la **transferencia**: el sistema ya registra el pago manual y activa la empresa (decisión 045).
  - 🤖 Mostrar en Suscripción los datos bancarios, el monto y la referencia que debe poner la empresa.
- [ ] **A8. La empresa que vende** 👤
  - RNC (persona física o SRL) y alta en la DGII para emitir comprobantes fiscales: las financieras van a pedir factura con crédito fiscal por la suscripción.
  - Registrar la marca **Cobradía** en ONAPI antes de invertir en publicidad.
- [ ] **A9. Validación legal** 👤 (abogado), 🤖 (ajustes)
  - Términos de servicio y aviso de privacidad (Ley 172-13), con las propuestas de la decisión 103: aviso de 30 días por cambios, 90 días de copia tras cancelar, responsabilidad limitada y tribunales.
  - Plantillas que el sistema entrega a **todas** las financieras: contratos con garantía prendaria e hipotecaria, pagaré notarial, intimación, mandamiento y entrega voluntaria. Conviene que tu abogado valide una versión base una sola vez, en lugar de esperar al abogado de cada cliente.
  - 🤖 Aplicar las correcciones y quitar la banda «pendiente de validación legal».

## Fase B · Antes del primer cliente piloto

- [ ] **B1. Entorno de pruebas (staging)** 🤖 (👤 aprueba el costo extra de Railway) Un entorno `staging` copia de producción, para ensayar la migración del cliente y probar cada cambio antes de que llegue a los clientes.
- [ ] **B2. Despliegue automático y CI** 👤🤖
  - 👤 Resolver la facturación de GitHub (desde el 10/10 la CI no arranca) y darle a la app de Railway acceso al repositorio privado.
  - 🤖 Pasar de `railway up` a despliegue automático: cada commit verde en `main` se publica solo.
- [ ] **B3. Aceptación de las fases 4–9** 👤 Recorrer cobros y caja, cobranza, finanzas, reportes, renovación y vía legal, mensajes y portal, y decir «aprobado» o qué cambiar. 🤖 te prepara un guion de 30 minutos.
- [ ] **B4. Prueba en la calle** 👤🤖 Un cobrador real con su celular contra producción (HTTPS): la ruta con GPS, el cobro, el recibo en la impresora térmica de 58 mm y el cuadre de caja al final del día.
- [ ] **B5. Primer cliente** 👤 Decidir si entra como proyecto pagado o como primer suscriptor (doc 10 §6), conseguir su cartera en las plantillas de migración y agendar la aceptación.
- [ ] **B6. Dos ensayos de migración** 🤖 En staging, siguiendo «Ensayo de la migración» de la [lista de lanzamiento](lanzamiento.md): totales de cartera al centavo y `verificar_integridad` limpio.
- [ ] **B7. Seguridad en staging** 🤖 Repetir el escaneo OWASP ZAP (activo) y la prueba de carga sobre la infraestructura real.

## Fase C · Para vender: marketing, ventas y soporte

- [ ] **C1. Sitio que vende** 🤖 (👤 aprueba) Precios publicados, capturas reales de la app, un video corto de demostración, botón de WhatsApp, página de ayuda con los manuales por rol y analítica que respete la privacidad (Plausible o Umami, sin banner de cookies).
- [ ] **C2. Demo pública** 🤖 Un botón «Ver demo» que entra a una financiera de ejemplo con datos realistas y se reinicia cada noche. Es lo que más convence a un prestamista: ver su día a día antes de registrarse.
- [ ] **C3. Material de ventas** 🤖 redacta, 👤 valida Presentación para reuniones, folleto PDF de una página, comparativa con los competidores y guion de demostración de 15 minutos.
- [ ] **C4. Canal de soporte** 👤 Un número de WhatsApp Business para Cobradía, un horario de atención y cuánto tardas en responder (va en los términos).
- [ ] **C5. Presencia** 👤 Perfil de Google Business, Google Search Console (🤖 lo conecta) e Instagram o Facebook con contenido para prestamistas.
- [ ] **C6. Prospectos** 👤 Lista de financieras y prestamistas a visitar (empezando por tu red), meta semanal de demos y seguimiento de cada una.
- [ ] **C7. Precio de lanzamiento** 👤 Opcional: descuento para los primeros 10 clientes a cambio de un testimonio y de su opinión.

## Fase D · Mejoras de producto que ayudan a vender

En orden recomendado (más impacto con menos esfuerzo primero). Todas 🤖, salvo el contrato con terceros donde se indica.

- [ ] **D1. Importar la cartera desde la app** Hoy la migración es un comando de consola que corre el equipo de Cobradía, pero el sitio promete «cargar tus préstamos actuales desde el primer día». Una pantalla para subir las plantillas de Excel, ver el ensayo con los errores por fila y aplicarlo deja que cada financiera arranque sola.
- [ ] **D2. Asistente de primeros pasos** Una lista en el inicio de la empresa nueva: datos de la empresa y logo, sucursal, productos, usuarios, caja y primer préstamo, con el avance marcado. Sube la conversión de prueba a pago.
- [ ] **D3. Pago de la suscripción desde la app** Datos bancarios y «subir comprobante de transferencia» que te avisa para confirmarlo; más adelante, cobro con tarjeta recurrente por una pasarela local (Azul o CardNet; 👤 contrato con el banco).
- [ ] **D4. Recibo de la suscripción** PDF con tu RNC y el NCF de cada pago, desde el panel de la plataforma (depende de A8).
- [ ] **D5. Métricas del negocio en tu panel** Ingreso mensual recurrente (MRR), cancelaciones, ingreso por plan y empresas por vencer. Hoy el panel muestra conteos y la conversión de la prueba.
- [ ] **D6. App instalable para el cobrador (PWA)** Ícono en la pantalla del celular y pantalla completa, sin pasar por una tienda de aplicaciones. Paso siguiente, más delicado por la caja: cobrar sin señal y sincronizar al volver la conexión.
- [ ] **D7. WhatsApp y SMS reales** 👤 contrato (Twilio o la API de WhatsApp de Meta, que suele salir más barata). La mensajería ya está construida y espera las credenciales (decisión 097).
- [ ] **D8. Cancelación y copia de los datos** Que la empresa pida la cancelación y descargue toda su información (clientes, préstamos, pagos y libros en Excel), como prometen los términos.
- [ ] **D9. Facturación electrónica (e-CF) con proveedor certificado** 👤 proveedor y certificado digital. Hoy el sistema prepara cada comprobante y se registra el e-NCF a mano; con la Ley 32-23 cada vez más financieras están obligadas a emitir e-CF, así que emitirlo directo desde Cobradía será un argumento de venta fuerte.
- [ ] **D10. Consulta al buró de crédito** 👤 contrato con TransUnion o DataCrédito. Consultar el historial desde la solicitud, sin salir del sistema.
- [ ] **D11. Plan anual** Pago por 12 meses con descuento (por ejemplo, dos meses gratis): mejora tu flujo de caja y reduce cancelaciones.

---

## Orden sugerido

1. **Esta semana:** A1–A5 (correo, buzón, superusuario, respaldos y monitoreo). Son cuentas de pocos minutos para ti y el resto lo monto yo.
2. **En paralelo:** A6–A9 (precios, banco, RNC y abogado), que dependen de ti y tardan más.
3. **Luego:** fase B con el primer cliente piloto, mientras avanzo con C1, C2, D1 y D2.
4. **Con el piloto andando:** abrir el registro al público y seguir con C y D según lo que pidan los clientes.
