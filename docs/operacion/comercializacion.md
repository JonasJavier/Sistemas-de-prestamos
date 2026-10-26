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
  - [x] Sentry 👤🤖 *Hecho el 25/10/2026:* organización `jonnas-javier`, proyectos `cobradia-api` (Django) y `cobradia-web` (React); los DSN están en `api` (`SENTRY_DSN`) y `web` (`VITE_SENTRY_DSN`). Los errores se ven en <https://jonnas-javier.sentry.io>.
  - [ ] 👤 Crear la cuenta de UptimeRobot (gratis) con un monitor HTTPS a `https://app.cobradia.com/api/v1/salud/` cada minuto (palabra clave `ok`) y aviso por correo y WhatsApp. *Jonas lo pospone (25/10/2026).*
- [x] **A6. Planes y precios (PT3)** 👤 decide, 🤖 implementa · *Hecho el 25/10/2026 (decisión 124): Esencial RD$990, Profesional RD$2,290 y Empresa RD$3,690 cargados en el panel, con funciones por plan en el sistema, publicados en el sitio y en Suscripción.*
  - 👤 Cuántos planes, precio mensual y límites de cada uno (usuarios, sucursales y préstamos activos). 👤 *Decidido el 25/10/2026:* Esencial RD$990 · Profesional RD$2,290 · Empresa RD$3,690, préstamos sin límite y funciones por plan ([propuesta-planes.md](propuesta-planes.md)). 🤖 Falta construir el corte de funciones por plan, cargarlos y publicarlos.
  - 🤖 Cargados con `manage.py seed_plans`, publicados en `cobradia.com/#precios` y en la pantalla Suscripción (elegir un plan sigue abriendo un correo: el pago es manual, D3).
- [x] **A7. Cómo te pagan** 👤🤖 · *Hecho el 25/10/2026 (decisión 125): transferencia a Banreservas o Banco Popular con comprobante desde la app y confirmación con un clic en el panel.* Azul y CardNET investigados en [pasarelas-de-pago.md](pasarelas-de-pago.md); con pocos clientes su costo fijo (RD$2,400–4,900 al mes) no se justifica: empezar por transferencia con comprobante (D3) y cotizar al llegar a 25–30 clientes.*
  - 👤 Abrir una cuenta bancaria a nombre del negocio. Para empezar basta la **transferencia**: el sistema ya registra el pago manual y activa la empresa (decisión 045).
  - 🤖 Mostrar en Suscripción los datos bancarios, el monto y la referencia que debe poner la empresa.
- [ ] **A8. La empresa que vende** 👤 · *Revisado el 25/10/2026 ([revisión legal](revision-legal.md), §1).*
  - RNC como **persona física** (RC-01 por la Oficina Virtual, gratis; no hace falta SRL para empezar). Al tenerlo: certificado de firma digital y alta como emisor electrónico, porque la factura es **e-CF** (120 días desde la inscripción, Decreto 587-24). El Facturador Gratuito de la DGII basta al inicio. Las financieras reciben un E31 a su RNC por cada pago; el ITBIS (18 %) se agrega a los precios, que ya se publican sin impuestos.
  - **Urgente desde el 25/10/2026 (decisión 128):** registrar la marca **Cobradía** en la ONAPI (denominativa, clase 42; la 9 si habrá app en las tiendas), porque existe «CobraDia» (cobrodia.online, de la agencia SonhoLab, Brasil; cobros diarios para Colombia, Perú, México y Brasil, sin marca registrada y sin presencia en el país). En el país la marca es de quien la registra primero (Ley 20-00). Pasos en [revision-legal.md](revision-legal.md), §5. Reservar también @cobradia.do en Instagram, TikTok, YouTube y Facebook (el @cobradia está tomado en Instagram y X por cuentas personales sin actividad).
- [x] **A9. Validación legal** 🤖 · *Hecha el 25/10/2026 por el responsable técnico como abogado, a pedido de Jonas (decisión 127; [revisión legal](revision-legal.md)).* Términos y aviso de privacidad reescritos (quién presta el servicio, Ley 126-02, precios sin ITBIS y e-CF, captación del público, obligaciones del encargado con aviso de incidentes en 72 h, transferencia a EE. UU.); plantillas corregidas a la Ley 45-20 (garantía mobiliaria y SEGM), la Ley 108-05 (hipoteca), la Ley 140-15 y el art. 545 CPC (pagaré notarial), el art. 583 CPC (mandamiento) y la Ley 358-05 (condiciones del crédito). La banda «pendiente de validación legal» se quitó. ⚖️ Queda, sin urgencia, una lectura de un abogado colegiado cuando haya 5–10 clientes.

## Fase B · Antes del primer cliente piloto

- [ ] **B1. Entorno de pruebas (staging)** 🤖 (👤 aprueba el costo extra de Railway) Un entorno `staging` copia de producción, para ensayar la migración del cliente y probar cada cambio antes de que llegue a los clientes.
- [ ] **B2. Despliegue automático y CI** 👤🤖
  - 👤 Resolver la facturación de GitHub (desde el 10/10 la CI no arranca) y darle a la app de Railway acceso al repositorio privado.
  - 🤖 Pasar de `railway up` a despliegue automático: cada commit verde en `main` se publica solo.
- [ ] **B3. Aceptación de las fases 4–9** 👤 Recorrer cobros y caja, cobranza, finanzas, reportes, renovación y vía legal, mensajes y portal, y decir «aprobado» o qué cambiar. 🤖 *Guion listo el 26/10/2026:* [guion de aceptación](guion-de-aceptacion.md), ocho bloques de 2 a 6 minutos sobre la demo local, con la casilla «aprobado / cambiar» en cada uno.
- [ ] **B4. Prueba en la calle** 👤🤖 Un cobrador real con su celular contra producción (HTTPS): la ruta con GPS, el cobro, el recibo en la impresora térmica de 58 mm y el cuadre de caja al final del día.
- [ ] **B5. Primer cliente** 👤 Decidir si entra como proyecto pagado o como primer suscriptor (doc 10 §6), conseguir su cartera en las plantillas de migración y agendar la aceptación.
- [ ] **B6. Dos ensayos de migración** 🤖 En staging, siguiendo «Ensayo de la migración» de la [lista de lanzamiento](lanzamiento.md): totales de cartera al centavo y `verificar_integridad` limpio.
- [ ] **B7. Seguridad en staging** 🤖 Repetir el escaneo OWASP ZAP (activo) y la prueba de carga sobre la infraestructura real.

## Fase C · Para vender: marketing, ventas y soporte

- [ ] **C1. Sitio que vende** 🤖 (👤 aprueba) · *26/10/2026 (decisión 133): precios publicados (124), **capturas reales** de la demo en el sitio (portada y galería «Así se ve», `frontend/e2e/capturas.spec.ts` con `CAPTURAS=1`) y **página de ayuda** `/ayuda` con los manuales por rol leídos de `docs/manual`.* Quedan, y dependen de Jonas: el video corto de demostración, el botón de WhatsApp (C4) y la analítica sin cookies (cuenta de Plausible o Umami).
- [x] **C2. Demo pública** 🤖 *Descartada por Jonas el 25/10/2026 (decisión 126): la prueba real de 15 días con todas las funciones es la demo.* Un botón «Ver demo» que entra a una financiera de ejemplo con datos realistas y se reinicia cada noche. Es lo que más convence a un prestamista: ver su día a día antes de registrarse.
- [x] **C3. Material de ventas** 🤖 redacta, 👤 valida · *Hecho el 26/10/2026 y validado por Jonas el mismo día: [docs/ventas](../ventas/README.md) (folleto PDF de una página, presentación de 9 láminas, comparativa con los competidores y guion de demostración de 15 minutos con las objeciones).*
- [ ] **C4. Canal de soporte** 👤 Un número de WhatsApp Business para Cobradía, un horario de atención y cuánto tardas en responder (va en los términos).
- [ ] **C5. Presencia** 👤 Perfil de Google Business, Google Search Console (🤖 lo conecta) e Instagram o Facebook con contenido para prestamistas.
- [ ] **C6. Prospectos** 👤 Lista de financieras y prestamistas a visitar (empezando por tu red), meta semanal de demos y seguimiento de cada una.
- [ ] **C7. Precio de lanzamiento** 👤 Opcional: descuento para los primeros 10 clientes a cambio de un testimonio y de su opinión.

## Fase D · Mejoras de producto que ayudan a vender

En orden recomendado (más impacto con menos esfuerzo primero). Todas 🤖, salvo el contrato con terceros donde se indica.

- [x] **D1. Importar la cartera desde la app** *(hecho el 26/10/2026, decisión 131)* Ajustes → Importar cartera: plantillas descargables, ensayo fila por fila sin guardar y «Aplicar» todo o nada, para clientes y para préstamos en curso. Los comandos de consola quedan sobre el mismo servicio.
- [x] **D2. Asistente de primeros pasos** *(hecho el 26/10/2026, decisión 129)* La tarjeta «Primeros pasos» en el inicio del gerente: datos de la empresa, sucursal, productos, equipo, caja y primer préstamo, con el avance leído de lo que la empresa hizo de verdad; desaparece al completar los seis o al ocultarla.
- [x] **D3. Pago de la suscripción desde la app** *(hecho el 25/10/2026, decisión 125; queda la pasarela con tarjeta para más adelante)* Datos bancarios y «subir comprobante de transferencia» que te avisa para confirmarlo; más adelante, cobro con tarjeta recurrente por una pasarela local (Azul o CardNet; 👤 contrato con el banco).
- [ ] **D4. Recibo de la suscripción** PDF con tu RNC, el e-NCF (E31/E32) y el ITBIS desglosado de cada pago, desde Suscripción (depende de A8).
- [x] **D5. Métricas del negocio en tu panel** *(hecho el 26/10/2026, decisión 134)* MRR y ARPU, cobrado este mes y el pasado, empresas por vencer en 30 días con lo que valen, cancelaciones de 30 días e ingreso por plan, con su «?» que dice cómo se calcula.
- [x] **D6. App instalable para el cobrador (PWA)** *(hecho el 26/10/2026, decisión 135)* Manifiesto, íconos y service worker: ícono en la pantalla de inicio, pantalla completa, los archivos de la app en caché y una página «Sin conexión» honesta. La API nunca se cachea. Mi ruta ofrece «Instalar» (Android) o explica los dos toques (iPhone). Cobrar sin señal queda para más adelante.
- [ ] **D7. WhatsApp y SMS reales** 👤 contrato (Twilio o la API de WhatsApp de Meta, que suele salir más barata). La mensajería ya está construida y espera las credenciales (decisión 097).
- [x] **D8. Cancelación y copia de los datos** *(hecho el 26/10/2026, decisión 132)* Suscripción → «Descargar la copia completa» (un Excel con una hoja por tabla) y «Cancelar la suscripción» (motivo + segundo factor): solo lectura, correos, 90 días de copia y borrado nocturno después.
- [ ] **D9. Facturación electrónica (e-CF) con proveedor certificado** 👤 proveedor y certificado digital. Hoy el sistema prepara cada comprobante y se registra el e-NCF a mano; con la Ley 32-23 cada vez más financieras están obligadas a emitir e-CF, así que emitirlo directo desde Cobradía será un argumento de venta fuerte.
- [ ] **D10. Consulta al buró de crédito** 👤 contrato con TransUnion o DataCrédito. Consultar el historial desde la solicitud, sin salir del sistema.
- [ ] **D11. Plan anual** Pago por 12 meses con descuento (por ejemplo, dos meses gratis): mejora tu flujo de caja y reduce cancelaciones.

---

## Orden sugerido

1. **Esta semana:** A1–A5 (correo, buzón, superusuario, respaldos y monitoreo). Son cuentas de pocos minutos para ti y el resto lo monto yo.
2. **En paralelo:** A6–A9 (precios, banco, RNC y abogado), que dependen de ti y tardan más.
3. **Luego:** fase B con el primer cliente piloto, mientras avanzo con C1, C2, D1 y D2.
4. **Con el piloto andando:** abrir el registro al público y seguir con C y D según lo que pidan los clientes.
