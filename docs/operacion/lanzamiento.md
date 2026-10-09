# Lista de lanzamiento

Estado de los criterios del doc 10 §4 (que incluyen los del paso 02 §8) al cerrar la parte técnica de la fase 10, el 09/10/2026. **Hecho** = construido, probado y con evidencia; **Jonas** = depende de una decisión, una cuenta o una persona que solo Jonas puede conseguir.

| # | Criterio | Estado | Evidencia o qué falta |
| --- | --- | --- | --- |
| 1 | Recorrido completo aprobado por el primer cliente y migración de su cartera cuadrada (ensayada dos veces) | **Jonas** | La herramienta de migración (F16, decisión 074) y `verificar_integridad` están listas. Falta: el cliente, su archivo de cartera y dos ensayos en staging (pasos abajo) |
| 2 | E1–E15 y la matriz de permisos en verde; cero diferencias sin explicar entre pagos, caja y cartera | **Hecho** | 364 pruebas del backend en cada cambio, conciliación nocturna, semana simulada en cero (`test_simulated_week`), cobros simultáneos sin cobrar de más (decisión 106) |
| 3 | Aislamiento entre empresas en verde, con RLS activo en producción | **Hecho** | Pruebas de cruce en cada módulo; rol de base sin privilegios también en producción (decisión 101); `verificar_integridad` lo comprueba en cada restauración |
| 4 | Registro público de punta a punta: alta → prueba → aviso → suspensión → activación | **Hecho** | Registro con aceptación de términos (103), límites del plan, avisos 7/3/1 días y aviso al dueño (104), suspensión nocturna y activación al registrar el pago (pruebas de `apps/platform`) |
| 5 | Plantillas legales validadas por el abogado del primer cliente; términos y aviso de privacidad validados por el abogado del dueño (Ley 172-13) | **Jonas** | Borradores listos con la banda «pendiente de validación legal»: contratos, pagaré notarial, intimación, mandamiento, entrega voluntaria (fase 8) y términos y privacidad (decisión 103) |
| 6 | Planes, precios y límites cargados (PT3); recibo de suscripción definido con el contador | **Jonas** | Los límites se aplican y se muestran (104); los planes se cargan desde el panel de la plataforma. Falta: nombres, precios y límites de cada plan |
| 7 | Respaldo y restauración probados; plan de respuesta a incidentes escrito | **Hecho** (en local) | `backup.sh` y `restore.sh` ensayados de punta a punta (101); [plan de incidentes](incidentes.md). Se repite en el servidor real |
| 8 | Escaneo OWASP ZAP sin hallazgos altos y revisión manual de seguridad | **Hecho** (en local) | 0 altos y 0 medios ([revisión](revision-seguridad.md), 102). Se repite en staging con el escaneo activo |
| — | Capacitación | **Lista para usar** | [Manuales por rol](../manual/README.md) |

## Lo que necesita Jonas, en orden

1. **Dominio y cuentas:** registrar `cobradia.com`; elegir el servidor (VPS con *snapshots*), el destino externo de los respaldos, el proveedor de correo (SMTP) y la cuenta de Sentry. Con eso se monta `staging.cobradia.com` siguiendo [`infra/production/README.md`](../../infra/production/README.md).
2. **Llave de respaldos:** generarla en su computadora y guardar la privada fuera de línea (manual del servidor, «Respaldos»).
3. **Planes y precios (PT3):** cuántos planes, su precio mensual y sus límites de usuarios, sucursales y préstamos activos; y con el contador, el comprobante que recibe cada empresa por su suscripción.
4. **Abogados:** el de Jonas valida términos y privacidad; el del primer cliente, sus plantillas legales y los plazos citados.
5. **WhatsApp y SMS:** contratar Twilio (WhatsApp Business y SMS) y entregar sus credenciales (decisión 097).
6. **Primer cliente:** decidir si entra como proyecto pagado o como primer suscriptor (doc 10 §6), conseguir su cartera en el formato de migración y agendar el recorrido de aceptación en staging.
7. **Comprobantes fiscales electrónicos (e-CF):** el proveedor certificado y el certificado digital, si el cliente los necesita al arrancar.

## Ensayo de la migración (dos veces antes del día real)

1. Restaurar en staging una copia limpia y crear la empresa del cliente (registro normal).
2. Cargar sus productos, sucursales, cobradores y clientes.
3. `migrar_prestamos <archivo> --usuario <gerente>` sin `--aplicar`: corregir cada fila que el ensayo marque.
4. Con `--aplicar`: comparar con el cliente, préstamo por préstamo, el saldo de capital y la próxima cuota; los totales de cartera deben coincidir al centavo.
5. `verificar_integridad` sin problemas.
6. Anotar el tiempo que tomó y lo que se corrigió; repetir con el archivo final.
