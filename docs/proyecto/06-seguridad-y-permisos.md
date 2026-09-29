# 06 · Roles, permisos, seguridad y auditoría

**Estado:** aprobado el 28/09/2026 (decisiones 033–036)

La referencia tiene 27 interruptores por usuario, sin roles ni límites, y dos fallas críticas de seguridad: el garante de otra empresa (#27) y los archivos públicos (#28). Aquí se define un modelo de permisos por rol, alcance y límite, y la seguridad del sistema de punta a punta.

## 1. Definiciones de este paso (aprobadas)

| # | Definición |
| --- | --- |
| 033 | **Cada empleado ve solo su sucursal.**<br>- El gerente, contabilidad y auditoría ven todas.<br>- Para atender a un cliente de otra sucursal se necesita un permiso especial, y el acceso queda registrado. |
| 034 | **Verificación en dos pasos (2FA) para todos los usuarios**, con un código de una app autenticadora |
| 035 | **Horario laboral solo para cajeros y cobradores:**<br>- Operan en el horario de su sucursal, que es configurable.<br>- El resto entra a cualquier hora, con todo auditado. |

## 2. Cómo funciona un permiso

Una acción solo se permite si pasa las **tres capas**:

1. **Permiso:** el rol del usuario incluye la acción, por ejemplo `loans.disburse`.
2. **Alcance:** el registro pertenece a una sucursal del usuario (033) y, en el caso del cobrador, a su cartera asignada.
3. **Límite y separación de funciones:**
   - el monto está dentro de su límite (`ApprovalLimit`);
   - el usuario no está aprobando algo que él mismo creó o solicitó.

**Aplicación en el código:**
- El **servidor** aplica las tres capas en cada petición:
  - Cada consulta a la base se filtra por el alcance del usuario.
  - Cada ID recibido se verifica contra ese alcance.
- La **pantalla** solo oculta los botones que el usuario no puede usar; no protege nada por sí sola.
- Una **prueba automática recorre la matriz** de la §3 y comprueba, para cada rol, qué operaciones de la API debe permitir y cuáles rechazar, incluidos los intentos con IDs de otra sucursal.

Los roles son plantillas: el administrador puede crear roles nuevos o ajustar los existentes, y cada cambio se audita.

## 3. Matriz de permisos por rol

**Roles:** **G** gerente · **A** administrador · **Su** supervisor · **O** oficial de crédito · **Ca** cajero · **Co** cobrador · **Ct** contabilidad · **Au** consulta o auditoría.

**Símbolos:**
- ✓ = puede.
- L = hasta su límite (§5).
- P = solo lo propio o lo asignado.
- — = no puede.

Todo queda además limitado a la sucursal del usuario, salvo para G, Ct y Au (033).

| Módulo | Permiso | G | A | Su | O | Ca | Co | Ct | Au |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clientes | Ver clientes | ✓ | ✓ | ✓ | ✓ | ✓ | P | ✓ | ✓ |
| | Crear y editar clientes | ✓ | — | ✓ | ✓ | — | — | — | — |
| | Ver archivos (cédula, ingresos) | ✓ | — | ✓ | ✓ | ✓ | — | — | ✓ |
| | Bloquear o desbloquear | ✓ | — | ✓ | — | — | — | — | — |
| | Exportar datos personales | ✓ | — | — | — | — | — | — | ✓ |
| Garantías | Registrar y editar bienes | ✓ | — | ✓ | ✓ | — | — | — | — |
| Solicitudes | Crear y editar | ✓ | — | ✓ | ✓ | — | — | — | — |
| | Aprobar (nunca la propia) | L | — | L | — | — | — | — | — |
| | Rechazar o devolver | ✓ | — | ✓ | — | — | — | — | — |
| Préstamos | Ver préstamos | ✓ | ✓ | ✓ | ✓ | ✓ | P | ✓ | ✓ |
| | Desembolsar (quien aprobó no desembolsa) | ✓ | — | — | — | ✓ | — | ✓ | — |
| | Cambiar fechas (con motivo) | ✓ | — | ✓ | — | — | — | — | — |
| | Cambiar el cobrador | ✓ | — | ✓ | — | — | — | — | — |
| | Pedir renovación o reestructuración | ✓ | — | ✓ | ✓ | — | — | — | — |
| | Aprobar reestructuración | L | — | L | — | — | — | — | — |
| | Anular (sin pagos) | ✓ | — | ✓ | — | — | — | — | — |
| | Castigar | ✓ | — | — | — | — | — | — | — |
| | Migrar préstamos existentes | ✓ | ✓ | — | — | — | — | — | — |
| Cobros | Cobrar | ✓ | — | ✓ | — | ✓ | P | — | — |
| | Condonar mora | ✓ | — | L | — | L | — | — | — |
| | Descuento en liquidación | ✓ | — | L | — | — | — | — | — |
| | Pedir reverso o corrección | ✓ | — | ✓ | — | ✓ | — | — | — |
| | Autorizar reverso (nunca el propio) | ✓ | — | L | — | — | — | — | — |
| | Reenviar un recibo | ✓ | — | ✓ | ✓ | ✓ | P | — | — |
| | Emitir carta de saldo | ✓ | — | ✓ | ✓ | ✓ | — | — | — |
| Caja | Abrir y cerrar su caja | — | — | ✓ | — | ✓ | — | — | — |
| | Recibir la rendición de un cobrador | — | — | ✓ | — | ✓ | — | — | — |
| | Aprobar un cierre (nunca el propio) | ✓ | — | L | — | — | — | — | — |
| | Ver todas las cajas | ✓ | — | ✓ | — | — | — | ✓ | ✓ |
| Ruta | Usar «Mi ruta» | — | — | — | — | — | ✓ | — | — |
| | Ver el mapa de ubicación de los cobradores | ✓ | — | ✓ | — | — | — | — | — |
| Cobranza | Registrar gestiones y promesas | ✓ | — | ✓ | ✓ | — | P | — | — |
| | Asignar la cartera a gestores | ✓ | — | ✓ | — | — | — | — | — |
| Legal | Llevar casos y emitir documentos legales | ✓ | — | — | — | — | — | — | — |
| Finanzas | Registrar gastos | ✓ | — | L | — | L | — | ✓ | — |
| | Aprobar gastos | ✓ | — | L | — | — | — | — | — |
| | Cuentas por pagar | ✓ | — | — | — | — | — | ✓ | — |
| | Transferencias entre cuentas | ✓ | — | — | — | — | — | ✓ | — |
| | Ajustes contables (con motivo) | ✓ | — | — | — | — | — | — | — |
| | Conciliación bancaria | ✓ | — | — | — | — | — | ✓ | — |
| | Cerrar el mes | ✓ | — | — | — | — | — | — | — |
| Reportes | Operativos (cartera, atrasos, caja) | ✓ | — | ✓ | P | P | P | ✓ | ✓ |
| | Financieros (resultados, contabilidad) | ✓ | — | — | — | — | — | ✓ | ✓ |
| | Exportar reportes | ✓ | — | ✓ | — | — | — | ✓ | ✓ |
| Ajustes | Empresa y sucursales | ✓ | ✓ | — | — | — | — | — | — |
| | Usuarios, roles y límites (nunca los propios) | ✓ | ✓ | — | — | — | — | — | — |
| | Productos, mora y cargos | ✓ | ✓ | — | — | — | — | — | — |
| | Plantillas de documentos | ✓ | ✓ | — | — | — | — | — | — |
| | Ver la auditoría | ✓ | ✓ | — | — | — | — | — | ✓ |

## 4. Separación de funciones (reglas fijas)

Estas reglas no se pueden desactivar desde la configuración:

1. **Nadie aprueba lo que creó o pidió:** solicitudes, reversos, condonaciones fuera de su límite, descuentos y el cierre de su propia caja.
2. **Quien aprobó una solicitud no la desembolsa.**
3. **Nadie cambia sus propios roles, límites ni sucursales.** Cada cambio de permisos avisa al gerente.
4. **El cobrador solo cobra y gestiona su cartera:** no reversa, no condona y no ve clientes ajenos.
5. **El administrador configura, pero no mueve dinero.** En una compañía pequeña, la persona gerente puede tener los dos roles, y todo queda auditado.
6. **Toda acción que altera dinero ya registrado** (reverso, condonación, descuento, anulación, castigo, ajuste o diferencia de caja) exige motivo y deja una `ApprovalRequest`.

## 5. Límites por monto

Los valores son **de ejemplo**: el cliente los fija en Ajustes. **Validar**.

| Operación | Cajero | Supervisor | Gerente |
| --- | --- | --- | --- |
| Aprobar una solicitud | — | Hasta RD$ 50,000 | Sin límite |
| Condonar mora (por cobro) | Hasta RD$ 500 | Hasta RD$ 5,000 | Sin límite |
| Descuento en liquidación | — | Hasta RD$ 2,000 | Sin límite |
| Autorizar un reverso | — | Hasta RD$ 20,000 | Sin límite |
| Registrar o aprobar un gasto | Hasta RD$ 1,000 (gasto menor de caja) | Hasta RD$ 5,000 | Sin límite |
| Aprobar un cierre de caja con diferencia | — | Hasta RD$ 500 | Sin límite |

Por encima de su límite, el usuario **pide autorización desde la misma pantalla**. El autorizador recibe un aviso y responde desde su propia sesión; si no puede estar presente, puede hacerlo de forma remota.

## 6. Acceso y sesiones

- **Inicio de sesión:** correo y contraseña, más **código 2FA** para todos (034).
  - **Códigos de respaldo:** 10, de un solo uso, para cuando se pierde el celular.
  - **Llaves de acceso (*passkeys*):** opción futura; allauth ya las admite.
- **Contraseñas:**
  - Mínimo 12 caracteres, sin contraseñas comunes ni datos personales.
  - Cada usuario crea la suya; nadie ve ni fija la de otro (#7).
  - Recuperación por enlace al correo.
- **Intentos fallidos:** tras 5 intentos, la cuenta se bloquea 15 minutos. Además hay límite por dirección IP.
- **Sesión:**
  - Va en una cookie segura.
  - Se cierra tras 30 minutos de inactividad y a las 12 horas en cualquier caso.
  - El usuario ve sus sesiones abiertas y puede cerrarlas; el administrador puede forzar el cierre.
- **Reconfirmación con 2FA** para las acciones críticas:
  - autorizar reversos;
  - castigar;
  - cambiar cuentas bancarias;
  - cambiar roles o límites;
  - exportar datos personales.
- **Horario (035):**
  - Cajeros y cobradores solo entran en el horario de su sucursal; al terminar el horario, la sesión se cierra.
  - Un supervisor puede dar una extensión temporal, que queda auditada.
- **Aviso de acceso nuevo:** el usuario recibe un correo cuando se inicia sesión desde un dispositivo nuevo.
- **Restablecer el 2FA de un usuario:** lo hace el administrador tras verificar la identidad; queda auditado y se avisa al gerente.

## 7. Protección de los datos personales

- **Mínimo necesario por rol:**
  - El cobrador ve el nombre, el teléfono, la dirección y los importes de sus clientes, pero no sus archivos ni sus ingresos.
  - En las listas, la cédula aparece enmascarada (`001-•••••67-8`).
- **Archivos privados:**
  - Se descargan con sesión y con un enlace que caduca a los 5 minutos.
  - Cada vez que alguien abre una cédula, queda registrado quién fue.
- **Fotos subidas:** se les quitan los metadatos, incluida la ubicación de la cámara.
- **Enlaces de recibo (024):**
  - Llevan un código que no se puede adivinar.
  - Muestran solo ese recibo, con los datos mínimos.
  - Son revocables y tienen límite de consultas.
- **Exportaciones con datos personales:** solo el gerente y auditoría pueden hacerlas, y cada una queda registrada.
- **Ubicación de los cobradores (031):** la ven solo el supervisor y el gerente, y se borra a los 90 días.
- **Derechos del titular:**
  - El sistema puede generar todo lo que se guarda de un cliente.
  - Al terminar el plazo de conservación, puede anonimizar a un cliente sin deudas.
  - **Validar con el abogado:** Ley 172-13 y los plazos de conservación.
- **Cifrado:**
  - En tránsito, HTTPS.
  - En reposo, disco cifrado en el servidor y respaldos cifrados.
  - Los números de cuentas bancarias se guardan enmascarados.

## 8. Seguridad de la aplicación

- **Alcance en cada ID** (lección del defecto #27), con pruebas automáticas que intentan acceder a datos de otra sucursal.
- **Cabeceras de seguridad:**
  - CSRF.
  - CSP estricta, sin scripts en línea.
  - HSTS.
  - `X-Frame-Options: DENY`.
  - `Referrer-Policy`.
  - `Permissions-Policy`: la ubicación solo para nuestro sitio.
- **Validación en dos niveles:** los serializadores de la API validan cada dato, y las restricciones de la base (paso 5, §7) son la última defensa.
- **Archivos subidos:**
  - Solo PDF, JPG, PNG y HEIC, de hasta 10 MB.
  - Se comprueba el contenido real, no solo la extensión.
  - Se guardan fuera del sitio público.
- **Límites de peticiones** por usuario y por IP, con Redis.
- **Base de datos con el mínimo privilegio:**
  - La aplicación usa un usuario sin permisos para cambiar la estructura; las migraciones usan otro.
  - Los disparadores impiden alterar el libro y la auditoría.
- **Admin de Django:** solo para el equipo técnico, con 2FA y restringido por IP en producción.
- **Registros técnicos sin datos sensibles:** las cédulas y los códigos aparecen enmascarados.
- **Dependencias y secretos:** Dependabot y `pip-audit` en cada cambio; los secretos van en variables de entorno y se rotan si hay sospecha.
- **Respaldos:**
  - Diarios, cifrados y guardados fuera del servidor.
  - Se conservan 30 diarios y 12 mensuales.
  - La restauración se prueba cada mes.
- **Antes del lanzamiento (fase 10):**
  - Escaneo automático (OWASP ZAP) y una revisión manual de seguridad.
  - Un plan de respuesta a incidentes: a quién avisar, qué rotar y cómo comunicarlo.

## 9. Auditoría

### Qué se registra

| Tipo | Ejemplos | Cómo se registra |
| --- | --- | --- |
| Cambios de datos | Antes y después de cada campo, con usuario, IP, petición y motivo | pghistory, en todos los modelos editables |
| Hechos de negocio | Desembolso, cobro, reverso, aprobación, cierre de caja | `DomainEvent` |
| Accesos | Inicio y cierre de sesión, intentos fallidos, cambios de 2FA y de contraseña, sesiones revocadas, accesos fuera de horario | Registro de seguridad |
| Lecturas sensibles | Ver la cédula u otros archivos, exportar datos, ver el mapa de cobradores, emitir documentos legales, atender a un cliente de otra sucursal | Registro de acceso |
| Autorizaciones | Quién pidió, quién autorizó, el monto y el motivo | `ApprovalRequest` |

### Cómo se consulta

- **Pantalla de auditoría:** filtra por usuario, fecha, módulo, registro y acción.
- **Cronologías:** la ficha del cliente y el expediente del préstamo muestran su propia historia completa.

### Protección y conservación

- **Protección:** las tablas de auditoría solo admiten nuevos registros, y nadie puede editarlas desde la aplicación.
- **Conservación** (**Validar con el contador y el abogado**):
  - Registros financieros y auditoría: al menos 10 años.
  - Ubicación de cobradores: 90 días.
  - Registros técnicos: 90 días.

### Alertas antifraude

El gerente recibe un aviso cuando aparece un patrón inusual:
- muchos reversos o condonaciones de un mismo usuario;
- diferencias de caja repetidas;
- accesos fuera de horario o desde dispositivos nuevos;
- cobros fuera de ruta;
- un cobrador que supera su límite de efectivo en mano;
- cambios de permisos.

Las reglas y sus umbrales son configurables.

## 10. Decisiones de este paso

| # | Decisión | Estado |
| --- | --- | --- |
| 033 | Cada empleado ve solo su sucursal; el gerente, contabilidad y auditoría ven todas | Aprobada |
| 034 | 2FA obligatorio para todos los usuarios | Aprobada |
| 035 | Horario laboral solo para cajeros y cobradores | Aprobada |
| 036 | Matriz de permisos (§3), separación de funciones (§4), límites de ejemplo (§5), sesiones (§6), protección de datos (§7), seguridad (§8), auditoría y alertas antifraude (§9) | Aprobada |
