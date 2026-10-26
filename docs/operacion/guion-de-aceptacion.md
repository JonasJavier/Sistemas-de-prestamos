# Guion de aceptación (B3): fases 4 a 9 en 30 minutos

**Para:** Jonas, dueño del producto. **Objetivo:** recorrer con tus propias manos lo que construyeron las fases 4 a 9 y decir, bloque por bloque, «aprobado» o «cambiar esto». No hace falta que pruebes todo: el guion elige una ruta corta por cada módulo, con datos ya cargados.

## Antes de empezar (5 minutos, una sola vez)

Se hace en tu PC con la demo local, que ya trae una financiera con cartera, caja y usuarios de cada rol.

1. Docker Desktop abierto. En una terminal, en la carpeta del proyecto:

```bash
docker compose -f infra/compose.yml up -d
```

2. Backend y datos de demostración (repite `seed_demo` cuando la demo se quede sin un préstamo atrasado o sin efectivo):

```bash
cd backend && uv run python manage.py seed_demo && uv run python manage.py runserver 127.0.0.1:8800
```

3. En otra terminal, la app:

```bash
pnpm -C frontend dev
```

4. Abre http://localhost:5173. Correos de la demo (contraseña de todos: `demo-cobradia-2026`; el código de dos pasos no se pide en local):

| Rol | Correo |
| --- | --- |
| Gerente | gerente@modelo.test |
| Supervisor | supervisor@modelo.test |
| Oficial de crédito | oficial@modelo.test |
| Cajera | cajera@modelo.test |
| Cobrador | cobrador@modelo.test |
| Contabilidad | contabilidad@modelo.test |
| Dueño de la plataforma | dueno@cobradia.test |

Para cambiar de rol, cierra sesión (tu nombre, arriba a la derecha) y entra con el otro correo; o usa una ventana privada por rol. Los correos que manda el sistema se leen en http://localhost:8025 (Mailpit).

> **En producción** (app.cobradia.com) el mismo guion sirve con tu propia financiera de prueba, pero tendrás que crear antes un cliente y un préstamo (la tarjeta «Primeros pasos» del inicio te lleva). La demo local ya los trae, por eso el guion está escrito sobre ella.

## Cómo anotar

Al final de cada bloque marca una de las dos:

- **✅ Aprobado.**
- **✏️ Cambiar:** qué viste y qué esperabas, en una línea. Con eso basta; yo lo convierto en trabajo.

---

## Bloque 1 · Cobros y caja (fase 4) · 6 minutos

**Entra como la cajera** (cajera@modelo.test).

1. **Cajas → Mi caja** (`/caja`). Si dice «Abrir caja», pon un fondo de 50,000 y ábrela. Verás «Esperado en caja» con ese monto.
2. Busca arriba (Ctrl K) a **María Gómez** y abre su préstamo. Pulsa **Cobrar**. En «Monto a pagar» pon **500** y en «Recibido» **1000**, para ver el **cambio**; pulsa **Registrar pago · RD$ 500.00**.
3. Mira el **recibo**: imprimir en hoja y en 80 mm, el **enlace** público y el botón de WhatsApp. Vuelve a **Mi caja**: «Esperado en caja» subió 500.
4. En el recibo pulsa **Reversar o corregir**: monto correcto **400**, motivo «Monto digitado incorrecto», qué pasó, y **Pedir autorización**. La cajera no puede corregir sola lo que cobró.
5. **Entra como el supervisor** en una ventana privada (supervisor@modelo.test): **Avisos → pestaña Por autorizar → Autorizar**, con su contraseña (en producción, con su código de dos pasos).
6. De vuelta como la cajera: **Mi caja → Arqueo y cierre.** Cuenta por denominación lo que dice «Esperado» y pulsa **Cerrar caja**. Si cuentas de menos a propósito, el sistema pide el motivo y registra la **diferencia** a cargo de la cajera.
7. **Como el supervisor**, en **Cajas**, pulsa **Aprobar cierre**.

**Qué buscas:** que un cobro tome menos de 30 segundos, que el recibo se entienda, que nadie pueda corregir solo lo que cobró y que el cierre cuadre al centavo.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 2 · El cobrador en la calle (fase 4) · 4 minutos

**Entra como el cobrador** (cobrador@modelo.test), mejor desde el celular en la misma red (en la terminal del frontend sale la dirección `http://192.168…:5173`) o achicando la ventana del navegador.

1. **Mi ruta** (`/ruta`): la primera vez pide el permiso de ubicación (**Acepto**) y luego **Abrir mi ruta de hoy**. Verás la lista del día con cuota, atraso, **Llamar**, **WhatsApp** y **Cómo llegar**.
2. Pulsa **Cobrar** en **José Pérez Santana** (el atrasado): «Monto a pagar» **300** y **Registrar pago**. En el recibo, **WhatsApp** abre el chat con el texto listo.
3. Registra una **gestión** en otro cliente: «no estaba», con **promesa de pago** para mañana.
4. **Cerrar ruta:** el resumen de lo cobrado y lo que debe entregar.
5. **Entra como la cajera**: en **Cajas**, la rendición del cobrador espera con **Recibir**; pon el **efectivo contado** y **Confirmar recepción** (el dinero pasa a su caja).

**Qué buscas:** que el cobrador no se pierda con el celular, que el límite de efectivo avise si cobra mucho, y que la rendición cuadre con lo cobrado.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 3 · Cobranza y atrasos (fase 5) · 3 minutos

**Entra como el gerente** (gerente@modelo.test).

1. **Atrasos** (`/atrasos`): pestañas por tramo (1–7, 8–30, 31–60…) con el capital en riesgo de cada uno. Entra a un tramo y **asigna un gestor** a un préstamo.
2. **Cobranza** (`/cobranza`): la agenda de hoy con las promesas que vencen y los seguimientos; ahí está la promesa que registró el cobrador en el bloque 2.
3. **Rutas de cobro** (`/rutas`): el avance de las rutas del día y cuántas ya rindieron.
4. **Ajustes → Empresa**, sección **Escalamiento de la cobranza**: los días de cada paso (recordatorio, llamada, visita, revisar el caso). Cambia uno y **Guardar reglas**.

**Qué buscas:** que el gerente sepa en 10 segundos cuánto está en riesgo y quién tiene que hacer qué hoy.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 4 · Finanzas (fase 6) · 4 minutos

**Como el gerente.**

1. **Gastos e ingresos** (`/gastos`) → **Nuevo gasto**: alquiler, 25,000, con el NCF y el RNC de un proveedor inventado; pulsa **Registrar**. Fíjate en que valida el RNC y el NCF (prueba uno mal escrito).
2. **Cuentas por pagar** (`/cuentas-por-pagar`): registra una factura de un proveedor, pulsa **Pagar** y **Registrar pago**.
3. **Reportes → Resultados** (`/reportes/resultados`): lo cobrado en intereses y mora menos los gastos; los retiros del dueño van aparte.
4. **Contabilidad** (`/contabilidad`): **Cerrar el mes** anterior. Después intenta registrar un gasto con fecha de ese mes: debe bloquearlo. Pulsa **Reabrir** si quieres deshacerlo.
5. **Comprobantes fiscales** (`/comprobantes`): la cola «por emitir» que dejaron los cobros con interés, y los formatos **606 y 607** del mes para descargar.

**Qué buscas:** que un gerente sin contador entienda cuánto ganó el mes y que lo fiscal salga listo para la DGII.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 5 · Reportes e indicadores (fase 7) · 3 minutos

**Como el gerente.**

1. **Inicio** (`/`): los indicadores del mes (cartera activa, PAR30, desembolsado, resultado, promesas cumplidas, diferencias de caja). Pulsa el **?** de cada uno: dice cómo se calcula.
2. **Centro de reportes** (`/reportes`) → **Cobros** → **Excel** → **Descargar**. Luego **Cartera** (`/reportes/cartera`): elige una fecha anterior; el reporte dice su fecha de corte.
3. **Clasificación** (`/reportes/clasificacion`): la clasificación de cada cliente y el botón **¿Por qué?**.
4. **Comisiones** (`/reportes/comisiones`): **Nueva regla** para el cobrador (por ejemplo 2 % de lo cobrado), **Guardar** y **Calcular** el mes.
5. **Ajustes → Alertas antifraude** (`/ajustes/alertas`): las reglas que avisan de cobros raros (fuera de horario, montos repetidos, lejos del cliente); ajusta una.
6. **Entra como el supervisor** y exporta el reporte de **Atrasos**: no lleva cédulas ni teléfonos (datos enmascarados por rol).

**Qué buscas:** que los números coincidan con lo que hiciste en los bloques anteriores y que cada reporte diga su fecha de corte.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 6 · Renovación, reestructuración y vía legal (fase 8) · 5 minutos

**Entra como el oficial** (oficial@modelo.test).

1. **Préstamos** (`/prestamos`) → el préstamo **al día** de **Ana Luisa Rodríguez** → **Más → Renovar**: un préstamo nuevo que liquida el anterior y entrega el neto. Mira cómo queda el viejo (Renovado) y el nuevo con su pagaré.
2. En otro préstamo, **Más → Reestructurar**: cambia el número de cuotas, **Ver el calendario nuevo** y **Pedir la aprobación**. **Como el supervisor**, en **Avisos**, recházala con un motivo; como el oficial verás el rechazo en la ficha.
3. **Como el gerente**: primero **Ajustes → Profesionales legales** → **Nuevo profesional** (un abogado con matrícula). Luego, en el préstamo atrasado de **José Pérez Santana**: **Más → Enviar a la vía legal** → **Abrir el caso**. En **Casos legales** (`/legal`) asigna el abogado y pulsa **Emitir PDF** del **Acto de intimación de pago**: sale con los datos reales del expediente y el monto exigible exacto; descarga también el **DOCX** editable. Cierra el caso con **Cerrar el caso**.
4. En **Ajustes → Empresa** revisa los **días para sugerir un castigo**; en **Préstamos**, el que ya pasó ese atraso aparece con el castigo sugerido y el gerente lo confirma (en producción, con su código de dos pasos).

**Qué buscas:** que renovar no deje un centavo descuadrado, que nadie apruebe lo suyo, y que el documento legal sea el que un abogado dominicano espera.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 7 · Mensajes y portal del cliente (fase 9) · 4 minutos

**Como el gerente.**

1. **Ajustes → Mensajería** (`/ajustes/mensajes`): los textos de los recordatorios (antes del vencimiento, el día, en atraso) y del recibo. Edita uno y pulsa **Enviar mensaje de prueba**; míralo en Mailpit (http://localhost:8025) y en el **registro de mensajes** de la misma pantalla.
2. **Clientes** → ficha de **María Gómez** → pestaña **Mensajes** → **Invitar al portal**. Copia el **enlace al portal**.
3. Abre ese enlace en una ventana privada: pide **Enviarme el código**, léelo en Mailpit y entra. La clienta ve sus préstamos, sus cuotas y sus recibos, y nada más.
4. Abre el **enlace** público de un recibo del bloque 1 (o escanea su QR): la página de verificación dice «Recibo auténtico», el número y la empresa, sin datos de más. Cambia una letra del enlace: «no corresponde a ningún documento».

**Qué buscas:** que un cliente sin cuenta pueda ver lo suyo con un código, y que un recibo falso no pase por verdadero.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

## Bloque 8 · Tu panel de dueño (plataforma) · 2 minutos

**Entra como el dueño de la plataforma** (dueno@cobradia.test).

1. **Empresas** (`/plataforma`): las financieras, su plan, los días de prueba que les quedan y los **comprobantes por confirmar**.
2. Entra a **Financiera Modelo SRL**: extiende la prueba 7 días y mira su auditoría. Luego **Más → Modo soporte → Dar acceso de soporte → Entrar**: ves la empresa en solo lectura; **Salir del modo soporte** al terminar. Como el gerente de la empresa, en **Ajustes → Empresa** se ve ese acceso y el botón **Revocar ahora**.
3. **Planes y cobros** (`/plataforma/planes`): los tres planes con sus precios y funciones, y tus cuentas bancarias para las transferencias.

- [ ] ✅ Aprobado  · [ ] ✏️ Cambiar: ____________________

---

## Al terminar

Mándame la lista de los «✏️ Cambiar». Lo que sea un error se arregla antes de seguir con lo demás; lo que sea una mejora entra a la lista de [comercialización](comercializacion.md) con su prioridad. Si los ocho bloques salen aprobados, las fases 4 a 9 quedan aceptadas y lo siguiente es la **prueba en la calle** (B4): un cobrador real con su celular contra producción.
