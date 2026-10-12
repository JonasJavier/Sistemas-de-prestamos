# Handoff: Rediseño de Cobradía («Bosque y Arena»)

> **Variante elegida del panel principal:** `1a` *(cámbiala a `1b` o `1c` si prefieres otra)*

## Resumen
Rediseño visual del SaaS de préstamos Cobradía (financieras y prestamistas). Hay 9 pantallas, cada una en escritorio y móvil, en modo claro y oscuro, pensadas para el **gerente**. Objetivo: que la app deje de verse genérica y transmita una financiera seria, cercana y *premium*, sin cambiar el sistema «Bosque y Arena» que ya existe.

## Sobre los archivos de diseño
Los archivos `.dc.html` de esta carpeta son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento buscados. **No son código para copiar.** La tarea es **recrearlos dentro del código existente** (React + TanStack Router/Query + Tailwind v4, con los tokens `@theme` de `src/index.css`) usando sus patrones y componentes: `components/ui.tsx` (`Section`, `Field`, `Figure`, `Alert`, `Texture`…), `Kpi`, `buttonClass`, `lib/format` (`rd`, `pct`, `plural`) y `lib/roles`.

Para verlos, abre `Cobradia.dc.html` en un navegador. Ese índice enlaza al resto y `support.js` tiene que quedarse en la misma carpeta. En cada lienzo, la luna del encabezado cambia entre claro y oscuro y «Plegar menú» pliega el menú lateral.

## Fidelidad
**Alta fidelidad.** Colores, tipografía, espaciado, radios, sombras y movimiento son finales. Recréalos con precisión, pero **siempre a través de los tokens** de `index.css`: ningún color suelto en los componentes.

## Tokens: equivalencias con `index.css`
Los prototipos usan variables CSS cortas. Su equivalente en Tailwind:

| Prototipo | Token en index.css | Claro | Oscuro |
|---|---|---|---|
| `--forest` | `brand-950` | #143B2C | #0F231A |
| `--forest-2` | `brand-900` | #1C4E3B | #1A3A2C |
| `--nav` | `brand-200` | #B9CDC1 | #8FAE9D |
| `--emerald` | `brand-700` | #0E6B4F | #35B585 |
| `--emerald-h` (hover) | `brand-800` | #0B5C43 | (usa brand-800) |
| `--mint` | `brand-100` | #DCEFE4 | #1A3A2B |
| `--mint-50` | `brand-50` | #EFF7F2 | #18271F |
| `--badge-ink` | `brand-800` | #0B5C43 | #9FE0C3 |
| `--gold` | `gold-500` | #C9A227 | #D4AF37 |
| `--cream` | `gold-100` | #F7EED8 | #3B3114 |
| `--gold-ink` | `gold-800` | #7D5F10 | #E3C86A |
| `--sand` | `canvas` | #F6F3EC | #121714 |
| `--surface` / `--surface-2` | `surface` / `surface-2` | #FFFFFF / #FAF8F3 | #1A211D / #171D19 |
| `--ink` / `--muted` / `--edge` | `ink` / `muted` / `edge` | #1F2925 / #6B6659 / #E8E2D5 | #E8EDE8 / #9DA69D / #2C3530 |
| `--ok` `--warn` `--danger` `--info` | `success-600` `warning-700` `danger-600` `info-700` | #047857 #B45309 #DC2626 #0369A1 | #34D399 #F59E0B #F87171 #38BDF8 |
| `--on-brand` | `on-brand` | #FFFFFF | #0B1F17 |
| `--sh-sm` / `--sh-lg` | `shadow-sm` / `shadow-lg` | (los de index.css) | |

**Tokens nuevos que hay que añadir a `@theme`** (y a `:root.dark`):
- `--color-on-forest`: texto sobre el bosque. #FFFFFF en claro, #E8EDE8 en oscuro.
- `--color-forest-accent`: acento sobre el bosque (barras, anillo, botón principal dentro de bloques verdes). #35B585 en los dos modos; el texto encima es #0B1F17.
- **Tintes suaves de estado** para chips y fondos de iconos: los prototipos usan `color-mix(in oklab, var(--warn) 12–13%, var(--surface))`. En Tailwind v4 basta con `bg-warning-700/12`, `bg-danger-600/12` y `bg-info-700/12` sobre la superficie. Si se repiten mucho, conviene crear tokens `warning-100`, `danger-100` e `info-100`.

**Tipografía:** Sora para títulos y cifras (600–700, `letter-spacing` de −0.015em a −0.035em; cuanto más grande, más cerrado). Inter para el texto (400–600). Activa `tabular-nums` en todas partes.
**Escala de tamaños usada:** 11 (eyebrow, mayúsculas, +0.08em), 12, 12.5, 13, 13.5, 14, 15, 16–17 (h2), 19–22, 24–30 (h1 de pantalla), 34 (saludo), 42–60 (cifra del día; 148 en 1b).
**Radios:** 7–10 (controles), 12 (tarjetas KPI), 14–18 (tarjetas grandes), 20 (bloque verde del panel), 999 (chips). La variante 1b va sin radios.
**Espaciado:** padding de página 28×32; separación entre secciones 20–28; dentro de tarjetas, 16–22.
**Detalle de marca:** la «í» de *Cobradía* en dorado; un punto dorado de 6 px antes de los eyebrows; textura de puntos y brillo (`.texture-*` / `<Texture>`) en el menú, en los bloques verdes y en la tarjeta de bienvenida.

## Movimiento
- **La pantalla sube al entrar:** `rise` de 260 ms, `cubic-bezier(.2,.8,.2,1)` (ya existe como `animate-rise`).
- **Las tarjetas aparecen una tras otra:** `rise` de 320 ms, con 35–45 ms de retraso por elemento (`animate-reveal` y el `Grid` actual).
- **Los botones se hunden al presionar:** `scale(.97)` en 150 ms (`press-down`). Las tarjetas clicables se elevan −2 px al pasar el ratón (`lift`).
- **Barras de progreso:** crecen desde la izquierda (`scaleX` de 0 a 1) en 900–1100 ms, con 200–350 ms de retraso. Las barras verticales crecen desde abajo en 700 ms.
- **Cifra del día:** cuenta de 0 al valor en 1.2 s (*ease-out* cúbico); el anillo de 1c se llena a la vez.
- **Menú lateral plegable:** el ancho pasa de 248 a 76 px en 240 ms. Al plegarse, las etiquetas se ocultan y las insignias se convierten en un punto dorado. Guarda la preferencia en `localStorage`.
- **Indicador «en vivo»:** punto esmeralda con pulso infinito de 2 s.
- Respeta `prefers-reduced-motion` (ya está en index.css).

## Estructura común
- **Menú lateral** (`Sidebar.dc.html`): fondo bosque, 248 px de ancho (76 plegado), con textura. Marca de 68 px de alto. Selector de empresa (tarjeta translúcida). Grupos **Operación** (Inicio, Clientes, Solicitudes, Préstamos, Desembolsos), **Cobro** (Rutas de cobro, Cobranza, Caja, Atrasos) y **Gestión** (Reportes, Contabilidad, Ajustes). Cada ítem mide 38 px de alto, radio 9, Inter 13.5/500. El ítem activo lleva fondo `brand-900`, texto blanco 600, icono relleno y **una barra dorada de 3 px pegada al borde izquierdo**. Abajo: avatar con nombre y rol, y «Plegar menú».
- **Barra superior** (`Topbar.dc.html`): 64 px, fondo `canvas` y línea inferior `edge`. Migas, buscador de 340 px («Buscar cliente, cédula o préstamo…» + ⌘K), selector de sucursal, alternador claro/oscuro y campana con punto rojo.
- **Móvil:** barra inferior (`TabBar.dc.html`) con Inicio, Clientes, **botón central «Cobrar»** (círculo esmeralda de 52 px que sobresale 22 px), Ruta y Más. La pestaña activa lleva una píldora menta de 56×30.

## Pantallas
### 1 · Panel principal (`Panel principal.dc.html`) → `Dashboard.tsx`
Las tres variantes conservan las secciones de `Dashboard.tsx` (Bienvenida, Tu trabajo de hoy, Cartera y cobros, Mora por tramos, Operación). Cambia la jerarquía:
- **1a · La cifra del día:** tarjeta de bienvenida con textura arena, fecha, «Buenos días, Carolina» (Sora 34/700), chip de prueba dorado y los botones Simular / Nueva solicitud. Debajo, separada por una línea, una rejilla de dos columnas: a la izquierda «Cobrado hoy · en vivo» con la cifra en Sora 60/700 («RD$» y «.00» en gris a 22–24) y una barra de progreso de 8 px; a la derecha, **Por origen** (Ruta Norte / Este / Oeste / Caja oficina, cada una con su chip de estado, una mini barra y «cobrado / esperado»). Luego «Tu trabajo de hoy» en 6 columnas, «Cartera y cobros» (rejilla de 3×2) junto a «Mora por tramos» (barra apilada al 100 % y tabla) y «Operación de hoy» en una sola tarjeta dividida en 4.
- **1b · Editorial (toque Modernist):** sin tarjetas ni radios. Líneas de tinta de 2 px, cifra de 148 px, barra segmentada por ruta (columnas proporcionales a lo esperado), columna derecha con Esperado / Recuperación / Falta, y secciones numeradas «01 / 02 / 03» en `gold-800`.
- **1c · Centro de mando:** bloque bosque con radio 20 y textura. Contiene, en tres columnas: el saludo y la cifra en blanco, un anillo de recuperación de 200 px (trazo de 14 px en `forest-accent` con una marca dorada arriba) y las rutas en vivo. Debajo: «Requiere tu atención» (lista accionable) junto a «Últimos 7 días» (barras de recuperación diaria) y la mora por tramos, y al final una tira de 6 KPIs.

### 2 · Clientes y préstamos (`Clientes y prestamos.dc.html`)
- **2a · Clientes:** filtros segmentados (Todos / Al día / En atraso / Sin préstamo, con su cuenta), selectores de ruta y de cobrador. Tabla hecha con CSS grid: Cliente (avatar + cédula), Zona · ruta, Saldo, Próxima cuota, Estado (chip con punto) y chevron. **Al hacer clic en una fila se actualiza la vista rápida** de la derecha (340 px): saldo, progreso de cuotas, datos y los botones «Ver ficha» / «Registrar pago».
- **2b · Ficha:** cabecera con avatar de 60 px, nombre, chips («Al día», «Buena pagadora» en dorado), datos en línea y acciones (⋯, Nueva solicitud, Registrar pago). Pestañas por préstamo. 4 KPIs (saldo de capital, cuota, próxima, atraso). Pestañas Calendario / Pagos / Garantías / Familia / Ingresos / Archivos / Mensajes. Tabla del calendario con la próxima cuota resaltada en `brand-50`. Columna derecha: «Este préstamo», Garantías y las acciones de `LoanActions.tsx`, con las destructivas (vía legal, castigar) en `danger`.
- **2c · Nueva solicitud (asistente por pasos):** pasos verticales (Cliente ✓ → **Condiciones** → Garantías → Documentos → Revisión). El formulario tiene un monto grande con atajos, frecuencia segmentada (Diaria / Semanal / Quincenal / Mensual), cuotas con +/−, tasa por período, primera cuota y cobrador. A la derecha, el bloque bosque **«Así queda»** se recalcula en vivo: cuota (cuota fija con interés sobre saldo), total, interés y las primeras cuotas. Debe usar el mismo cálculo que `Simulator.tsx`.

### 3 · Ruta y cobro (`Ruta y cobro.dc.html`)
- **3a · Ruta del día (gerente):** tarjetas seleccionables, una por ruta (la activa en bosque), una tira de KPIs (cobrado con barra, visitas, promesas, no estaba, falta), la tabla de paradas en orden con chips de resultado (Pagó / Pago parcial / Prometió / No estaba / Pendiente / **Siguiente**), un feed de actividad en vivo y «Por rendir en caja». **En el móvil es la vista del cobrador:** progreso del día, una tarjeta bosque con la **siguiente parada** (Cobrar / Prometió / No estaba) y la lista de las paradas siguientes.
- **3b · Registrar pago:** monto en 4 opciones con radio (Cuota / 2 cuotas / Saldar / Otro), método (Efectivo / Transferencia / Cheque / Tarjeta; el activo en bosque), recibido y devuelta (en efectivo) o referencia (en transferencia), y nota. A la derecha, **«Cómo se aplica»** (mora → interés → capital, con barra apilada), el saldo que queda después y una **vista previa del recibo de 80 mm** con el borde dentado. Al confirmar aparece «Pago registrado» con un check que hace *pop*. En el móvil hay teclado numérico, atajos y una pantalla de éxito a pantalla completa en bosque.

### 4 · Cuenta y reportes (`Cuenta y reportes.dc.html`)
- **4a · Entrar / crear cuenta → `Login.tsx`:** mitad bosque con textura y un titular en Sora 52; mitad arena con un formulario de 420 px de ancho y las pestañas «Entrar / Crear cuenta». Se conservan todos los textos y avisos de `Login.tsx`, incluidos los de sesión cerrada y fuera de horario. En el registro aparece el chip dorado «14 días gratis · sin tarjeta». En el móvil, el formulario va en una hoja que sube desde abajo.
- **4b · Reportes · Cobros:** submenú de reportes, 4 KPIs, barras por día (esperado en menta y cobrado en esmeralda dentro; **al hacer clic** se resalta el día y se actualiza el texto de arriba) y una tabla por ruta con su barra de recuperación (esmeralda si llega al 90 %, ámbar si no).
- **4c · Suscripción → `Subscription.tsx`:** banner crema y dorado con los 14 días de la prueba como segmentos (pasados en oro, hoy con aro, futuros en un tinte suave), el uso del plan en tarjetas (las que están en el límite, en `warning`), un alternador mensual / anual y 3 planes. El recomendado va en bosque, con una franja dorada de 3 px y la etiqueta «Tu plan en la prueba». Al final, la tarjeta de pago por transferencia. **Los precios son de referencia:** los textos dicen que los definitivos se publican antes del lanzamiento.

## Comportamiento y estado
- El tema claro/oscuro sigue siendo `:root.dark`. El plegado del menú se guarda en `localStorage`.
- Todos los números salen de la API existente (`getDashboard`, `listLoans`, etc.). Los datos de los prototipos son de ejemplo (es-DO, RD$).
- Respeta los roles (`hasRole` / `ACCESS`): cada bloque del panel solo aparece para quien lo puede ver, como hoy.
- Las tablas son CSS grid con columnas `minmax(0, Nfr)`. Las etiquetas cortas (chips, botones, cifras) llevan `white-space: nowrap` para que no se partan.

## Recursos
- Fuentes: Sora e Inter (ya instaladas con `@fontsource-variable`).
- Iconos: los prototipos usan **Material Symbols Rounded** de forma provisional. **Usa el set de `components/icons`** del proyecto; si falta alguno, añádelo en el mismo estilo.
- No hay imágenes.

## Archivos
- `Cobradia.dc.html`: índice con la paleta, la tipografía, las sombras y el movimiento.
- `Panel principal.dc.html`: 1a, 1b, 1c.
- `Clientes y prestamos.dc.html`: 2a, 2b, 2c.
- `Ruta y cobro.dc.html`: 3a, 3b.
- `Cuenta y reportes.dc.html`: 4a, 4b, 4c.
- `Sidebar.dc.html`, `Topbar.dc.html`, `TabBar.dc.html`: estructura compartida.
- `support.js`: el entorno que permite abrir los `.dc.html` en el navegador (no forma parte del diseño).

## Orden sugerido
1. Añadir los tokens nuevos a `index.css`.
2. Estructura: menú lateral plegable, barra superior y barra inferior móvil.
3. Panel principal con la variante elegida.
4. Clientes → Ficha → Registrar pago → Ruta.
5. Nueva solicitud (asistente) → Reportes → Login → Suscripción.
6. Revisar cada pantalla en claro y en oscuro, y en el móvil.
