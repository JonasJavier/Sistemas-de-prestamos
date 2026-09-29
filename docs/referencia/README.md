# Estudio de la referencia: Púrpura Datos

Documentación pantalla por pantalla del sistema de referencia ([web.purpuradatos.net](https://web.purpuradatos.net)), levantada el 28/09/2026 en una cuenta de pruebas con datos ficticios (`CLIENTE PRUEBA CODEX 01`, `ABOGADO PRUEBA CODEX`, etc.). No se enviaron correos ni mensajes.

## Cómo leer esta carpeta

1. Empieza por el [mapa general](01-mapa-general.md): qué es el producto, stack, rutas, navegación, relaciones entre módulos y modelo de datos.
2. Cada ficha de módulo sigue la misma estructura: **propósito → pantallas y campos → acciones y modales → reglas observadas → relaciones → qué haremos mejor**.
3. Los [hallazgos](10-hallazgos-y-mejoras.md) consolidan defectos por severidad y los diferenciadores del producto nuevo.
4. La evidencia numérica paso a paso está en [../FLUJOS_VERIFICADOS.md](../FLUJOS_VERIFICADOS.md) y el estado de cobertura en [../MATRIZ_PRUEBAS_Y_DECISIONES.md](../MATRIZ_PRUEBAS_Y_DECISIONES.md).

| # | Ficha | Contenido |
| --- | --- | --- |
| 01 | [Mapa general](01-mapa-general.md) | Producto, stack, 40 rutas, menú, relaciones, modelo de datos |
| 02 | [Clientes y consulta](02-clientes-y-consulta.md) | Consultar (buró), lista, alta, ficha, laborales, garante, familiares, referencias, archivos, clave de acceso |
| 03 | [Solicitud y préstamos](03-solicitud-y-prestamos.md) | Simulador, 4 productos, alta, expediente, 11 acciones, gastos de cierre |
| 04 | [Cobros, mora y atrasos](04-cobros-mora-y-atrasos.md) | Pantalla de cobro, pagar, liquidar, reversar, fórmula de mora, atrasos, listas |
| 05 | [Finanzas](05-finanzas.md) | Caja, gastos, ganancia, cuentas, cuentas por pagar |
| 06 | [Cartera y clasificación](06-cartera-y-clasificacion.md) | Indicadores, Datos Importantes, calificación de clientes |
| 07 | [Administración](07-administracion.md) | Empleados, 27 permisos, sucursales, empresa, licencia, abogados, testigos, alguacil |
| 08 | [Documentos](08-documentos.md) | Plantilla común, galería y 13 documentos (PDF y DOCX) con sus defectos |
| 09 | [Sistema de diseño](09-sistema-de-diseno.md) | Tokens reales, patrones, problemas de UX y dirección visual propuesta |
| 10 | [Hallazgos y mejoras](10-hallazgos-y-mejoras.md) | 43 defectos priorizados (2 críticos de seguridad nuevos), funciones a cubrir y diferenciadores |

> **Alcance:** nuestro sistema es para **una sola compañía**. Lo multiempresa de la referencia (registro de empresas, licencias, planes, buró compartido) se documenta solo como contexto.

Las capturas de [capturas/](capturas/) muestran la interfaz real; algunas pantallas incluyen la foto de perfil de la cuenta de pruebas. En [capturas/documentos/](capturas/documentos/), los datos de contacto, la foto usada como logo y la cédula del usuario están tapados.

## Cobertura

Todas las pantallas del menú lateral y del menú de administración se recorrieron, y sus funciones se ejecutaron con datos ficticios, salvo:
- **Envío de email, SMS o mensajes:** la función existe (recibo y Clasificación) pero no se probó por decisión del proyecto.
- **Exportar Datos:** el navegador de pruebas bloquea la descarga; falta que el usuario la descargue manualmente.
- **Segundo usuario:** permisos «Limitado» y cambio de cobrador requieren crear otro usuario vía `/register` (ver [07](07-administracion.md#cómo-se-crean-usuarios-verificado)).
- **Búsqueda de cédula en padrón:** solo se probó con documentos ficticios (sin resultado); no se usaron cédulas reales.
- **Subir logo de la empresa:** no se hizo, para no alterar la marca de la cuenta.

## Estado de la cuenta de pruebas al terminar

Para repetir o continuar pruebas, estos cambios siguen activos en la cuenta:

- Mora global: 5 %, 1 día por cuota, **automática activada**.
- Gastos de cierre: **activados** al 2 %.
- Préstamo #1 (ID 582642): cuota #2 vencida el 20/09/2026, así que está **8 días atrasado** con mora propuesta de 140 (el cobro de 700 + 140 se revirtió).
- Préstamo «comenzado» de prueba (ID 582763) por 1,000, con 2 cuotas marcadas como pagadas; +20 de gastos de cierre en Caja Chica.
- Préstamo en borrador (ID 582769) del nuevo `CLIENTE PRUEBA CODEX 02`, creado desde una solicitud; sin desembolsar.
- Catálogos: `ABOGADO PRUEBA CODEX` con dos testigos y `ALGUACIL PRUEBA CODEX`.
- Cliente 01: familiar, referencia comercial, datos laborales y `GARANTE PRUEBA CODEX 2`; clave de acceso generada.
- `SUCURSAL PRUEBA CODEX` creada y **desactivada**. Comisión configurada para septiembre (10 %). Función del empleado: «Administrador (prueba)».
- `LISTA PRUEBA CODEX` borrada; una obligación recurrente (08/10) borrada; `CUENTA PRUEBA CODEX` con saldo 12.
