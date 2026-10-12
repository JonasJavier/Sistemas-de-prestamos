# 08 · Sistema de diseño de Cobradía

**Estado:** aprobado el 04/10/2026 (decisiones 047 y 048) · **paleta definitiva «Bosque y Arena» elegida el 05/10/2026 (decisión 053)** por el dueño entre cuatro opciones de un lienzo comparativo, tras descartar el «solo blanco» por simplón; tipografías **Sora** (títulos y marca) e **Inter** (interfaz y cifras) de la decisión 052; tema claro predeterminado con oscuro opcional por interruptor. **Refinado el 10/10/2026 (decisión 110):** arena más clara, sombras suaves, menú con íconos y grupos plegables, menú de usuario con avatar y colores semánticos AA también en oscuro. **Cuarta revisión, 11/10/2026 (decisión 111):** identidad con carácter sin cambiar la paleta: la **textura de marca** (la retícula de puntos y la luz suave del panel de entrada) acompaña a la persona dentro de la app —menú lateral, hoja del celular y tarjeta de bienvenida del inicio—, el **punto dorado** como marca de la casa (títulos de sección, estados vacíos, riel plegado), títulos de pantalla en Sora negrita, una etiqueta superior en mayúsculas pequeñas, el **menú plegable** a riel de íconos con burbujas y la **cifra del día** en el inicio.

**En una frase:** la identidad **«Bosque y Arena»** (decisión 053, distinta de la referencia Púrpura Datos): menú lateral verde bosque, fondo arena cálido, tarjetas blancas, acciones esmeralda y un dorado discreto como firma, sobre Tailwind 4 con componentes propios (vocabulario de shadcn/ui, decisión 064), con alta densidad donde se trabaja, números tabulares para el dinero, modo claro (y oscuro opcional) y accesibilidad WCAG 2.2 AA.

Este documento define los *tokens* y patrones que la Fase 1 convierte en código (`@theme` de Tailwind y los componentes de `frontend/src/components/`). Lo que funciona de la referencia se conserva ([ficha 09](../referencia/09-sistema-de-diseno.md#93-lo-que-funciona-y-conviene-conservar)); sus problemas de UX ([9.4](../referencia/09-sistema-de-diseno.md#94-problemas-de-ux)) se corrigen aquí.

## 1. Identidad

- **Marca:** Cobradía, siempre con su acento en la interfaz y los documentos; el dominio es `cobradia.com` (decisión 044).
- **Personalidad:** seria y confiable (maneja dinero ajeno), pero cercana y en español llano. Nada de jerga técnica en la interfaz.
- **Logotipo:** por ahora, un *wordmark* «Cobradía» en **Sora SemiBold** con la í en esmeralda claro (`--brand-400`), como detalle distintivo. Un logotipo profesional se encarga antes del lanzamiento; el sistema solo necesita que quepa en un cuadrado (favicon, menú plegado) y en horizontal (encabezados).
- **El punto dorado es la marca de la casa** (decisión 111): la í del *wordmark*, el punto del isotipo, el marcador del ítem activo del menú, el punto que antecede a cada título de sección, la insignia del riel plegado, el chip de la prueba gratis y el detalle del dibujo de los estados vacíos. Nunca es un botón.
- **La textura de marca** (decisión 111): la retícula fina de puntos y la luz suave que presentan la marca en el panel de entrada siguen a la persona dentro de la app —sobre bosque en el menú lateral y la hoja del celular; en dorado sobre arena en la tarjeta de bienvenida del inicio—, siempre como fondo, detrás del contenido y al 7–16 % de opacidad: se nota, no se lee.
- **Sin marca de agua** en las pantallas de trabajo (problema #1 de la referencia). El logo vive en el menú lateral y en los documentos.
- **El logo de cada empresa** (tenant) aparece en **sus** documentos y en su encabezado interno; la marca Cobradía queda en el pie de página de los documentos («Generado con Cobradía · cobradia.com») y en las pantallas públicas. Así el pagaré es de la financiera, no nuestro.

## 2. Color

Los valores cumplen contraste AA sobre su fondo de uso. Se definen una vez como tokens de Tailwind; los componentes nunca usan colores sueltos.

**La fórmula «Bosque y Arena»:** un solo bloque de color fuerte —el menú lateral verde bosque— ancla la identidad; el resto respira: fondo arena cálido, tarjetas blancas donde se trabaja, esmeralda en las acciones y un **dorado discreto como firma** (la í de la marca, la barrita del ítem activo, el aviso de prueba).

### Claro (predeterminado)

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand-950` | `#143B2C` | **El menú lateral** (verde bosque) |
| `--brand-900` | `#1C4E3B` | Hover dentro del menú |
| `--brand-800` | `#0B5C43` | Hover de la acción primaria; texto de insignia «al día» |
| `--brand-700` | `#0E6B4F` | **Acción primaria**, enlaces (AA sobre blanco) |
| `--brand-200` | `#B9CDC1` | Texto de navegación sobre el bosque |
| `--brand-100` | `#DCEFE4` | Selecciones, botón tonal de fila |
| `--brand-50` | `#EFF7F2` | Hover de filas y botones secundarios, insignia «al día» |
| `--gold-500` | `#C9A227` | **Firma dorada:** la í de la marca, marcador del ítem activo |
| `--gold-100` / `--gold-800` | `#F7EED8` / `#7D5F10` | Aviso de la prueba gratis (fondo / texto) |
| `--accent-500` | `#0E8A64` | Anillos de foco |
| `--success-600` | `#047857` | Pagado, cuadrado, confirmaciones (AA como texto sobre blanco) |
| `--warning-700` | `#B45309` | Vencido 1–30 días — semántico, no identidad |
| `--danger-600` | `#DC2626` | Errores, mora grave (31+ días), acciones destructivas; el texto sobre el rojo usa `--on-danger` |
| `--info-700` | `#0369A1` | Información neutral |
| `--canvas` | `#F6F3EC` | Fondo de la página (**arena cálido**, más claro desde la 110) |
| `--surface` | `#FFFFFF` | Tarjetas, tablas, barras: donde se trabaja |
| `--surface-2` | `#FAF8F3` | Zonas de contenido sutiles |
| `--text` | `#1F2925` | Texto principal |
| `--muted` | `#6B6659` | Texto secundario (5:1 sobre la arena) |
| `--border` | `#E8E2D5` | Bordes y separadores |
| `--on-forest` | `#FFFFFF` (oscuro `#E8EDE8`) | Texto sobre el bosque: el menú y los bloques verdes (decisión 114) |
| `--forest-accent` / `--on-forest-accent` | `#35B585` / `#0B1F17` (los dos modos) | Acento sobre el bosque: barras, anillos y el botón principal dentro de un bloque verde, con su texto |
| `--success-100` · `--warning-100` · `--danger-100` · `--info-100` | el estado al 12 % sobre `--surface` | Tintes suaves para chips y fondos de íconos; siguen el modo solos porque mezclan con la superficie del momento |

### Oscuro (opcional)

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand-950` / `--brand-900` | `#10251C` / `#1B3F2F` | Menú y su ítem activo |
| `--brand-700` | `#35B585` | Acción primaria y enlaces |
| `--brand-100` / `--brand-800` | `#1A3A2B` / `#9FE0C3` | Insignias (fondo / texto) |
| `--gold-500` | `#D4AF37` | Firma dorada |
| `--canvas` / `--surface` | `#121714` / `#1A211D` | Fondo y tarjetas |
| `--text` / `--muted` / `--border` | `#E8EDE8` / `#9DA69D` / `#2C3530` | Texto y bordes |
| Semánticos | éxito `#34D399` · advertencia `#F59E0B` · peligro `#F87171` · información `#38BDF8` | Más claros que en el tema claro para mantener AA como texto sobre las superficies oscuras |

### Reglas de uso

1. **El bosque es para lo que importa ahora (decisión 115).** El menú es el bloque fijo; en el área de trabajo, arena y blanco. Un bloque bosque aparece solo para **lo que la persona tiene que mirar o decidir en ese momento**: «Así queda» al cotizar, la siguiente parada del cobrador, la ruta elegida, el efectivo por rendir, el plan recomendado, «Pago registrado» y, desde la decisión 116, aprobar un cierre de caja, la entrega de un desembolso, la selección en atrasos y el próximo pago en el portal. Nunca dos compitiendo en la misma vista. Dentro del bosque, el acento es `forest-accent`. La textura de marca no cuenta como bloque. El dorado es firma, no botón: nunca para acciones.
2. **El dinero no se colorea por sí mismo.** Un importe es texto normal; el color lo da su **estado** (insignia), no el signo de pesos.
3. **Estados de cuota y préstamo:** al día `brand-100`/`brand-800` · pagada `success` · parcial `info` · vencida 1–30 `warning` · vencida 31+ o legal `danger` · saldado gris. Siempre color **más texto**: nunca solo color (accesibilidad).
4. **El ámbar ya no es identidad:** queda únicamente como color semántico de advertencia (`warning`).
5. **Un solo color primario por pantalla:** una acción principal verde; el resto, botones secundarios (borde) o fantasma. (Corrige los 11 botones púrpura iguales de la referencia.)

## 3. Tipografía (dos familias, decisión 052)

| Elemento | Valor |
| --- | --- |
| **Títulos y marca** | **Sora** (variable, 600/700), autoalojada: geométrica y moderna, con `letter-spacing -0.015em`. Se aplica a `h1–h3` y al *wordmark* |
| **Interfaz y cifras** | **Inter** (variable), autoalojada; `system-ui` de respaldo. Todo el cuerpo, formularios, tablas y documentos |
| Cuerpo | 14 px / 400 en escritorio; 16 px en móvil |
| Secundario y etiquetas | 12.5 px / 500, `--muted` |
| Títulos de pantalla | 24 px en el celular y 28 px en escritorio / **700** (Sora, `letter-spacing -0.025em`); el saludo del inicio, 28/34 px |
| Etiqueta superior (*eyebrow*) | 11 px / 600, mayúsculas con `letter-spacing 0.08em`, `--muted`: la fecha del inicio y las agrupaciones; precedida del punto dorado cuando encabeza una tarjeta |
| Cifras de tablero (KPI) | 28 px / 700 |
| **Importes** | `font-variant-numeric: tabular-nums` **siempre**: en tablas, totales, recibos y KPI. Alineados a la derecha en tablas |
| Documentos PDF | Inter para el cuerpo y Sora para encabezados (coherencia de marca); los legales pueden usar una serif si el abogado lo pide |

Formato regional fijo (es-DO): `RD$ 1,250.00`, fechas `04/10/2026`, sin notaciones como `97'925.00` (defecto #41 de la referencia).

## 4. Forma, espacio y elevación

| Elemento | Valor |
| --- | --- |
| Escala de espaciado | Múltiplos de 4 px; secciones separadas por 24 px |
| Relleno de tarjetas | 16 px en el celular y 20 px desde 640 px (`p-4 sm:p-5`, decisión 116); las tablas dentro de una tarjeta llegan hasta su borde |
| Radios | 8–10 px en controles (`rounded-control`, 10 px, en la barra superior); 12 px en tarjetas KPI y menús; 14 px en tarjetas grandes (`rounded-card`); 16 px en diálogos; 20 px en los bloques verdes (`rounded-block`); 24 px arriba en las hojas del celular; 999 px en insignias y avatares |
| Sombras | Dos niveles teñidos de bosque: tarjeta (`0 1px 2px` y `0 1px 3px` al 4–5 %) y flotante (`0 12px 32px -8px` al 18 %), más un `xs` de 1 px para controles. Nada más |
| Altura de controles | 36 px en escritorio; 44 px mínimo en móvil (objetivo táctil) |
| Filas de tabla | 40 px (densa pero legible); modo compacto opcional de 32 px en reportes |
| Menú lateral | **248 px; plegado, 76 px** (decisión 114): un riel con un ícono por opción, una burbuja que nombra la opción al pasar o enfocar y las insignias como punto dorado. Se pliega con «Plegar menú» al pie y la elección se recuerda en el navegador. **En la tableta (640–1023 px) siempre va plegado**: el contenido necesita el espacio |
| Barra superior | 64 px en tableta y escritorio; 56 px en el celular |
| Contenido | Margen de 32 px a los lados en escritorio (24 en tableta, 16 en el celular); ancho máximo de 1152 px, o 1280 px cuando la sección tiene submenú |
| Puntos de quiebre | Los de Tailwind (`sm 640 · md 768 · lg 1024 · xl 1280`); el diseño de cobro y «Mi ruta» se hace primero para 360–430 px |

## 5. Componentes

Los diez componentes clave definidos en la [dirección de diseño](../referencia/09-sistema-de-diseno.md#95-dirección-de-diseño-para-nuestro-sistema) se adoptan con estas precisiones. **Implementación (decisión 064):** componentes propios y livianos en `frontend/src/components/` con el mismo vocabulario de clases de shadcn/ui, en vez de importar shadcn y Radix: todo overlay (diálogos, búsqueda, menú del celular) usa el `<dialog>` nativo del navegador en modo modal, que atrapa el foco, vuelve inerte el fondo y cierra con Esc sin dependencias. Si una pieza futura lo justifica (menú desplegable, *combobox*), se adopta Radix solo para esa pieza.

| Componente | Base | Precisiones |
| --- | --- | --- |
| Barra de comandos (Ctrl+K) | `CommandPalette` sobre `Modal` | Resultados agrupados (clientes, préstamos, acciones); acción directa «Cobrar» con Enter |
| Tabla de datos | `Table` + `tableRowClass` + `Pagination` (decisión 116; TanStack Table cuando haga falta ordenar columnas) | Filtros segmentados y búsqueda en una sola fila sobre la tabla; totales al pie (`footer`) que respetan los filtros; estado vacío con acción. `RowList` queda para listas sin columnas |
| Estado vacío | `EmptyState` | El dibujo de la casa (dos tarjetas y el punto dorado), una frase que dice qué pasa y, si cabe, la acción |
| Tarjeta KPI | `Stat` | Valor, comparación y un «?» con la definición exacta del indicador (paso 9) |
| Panel de cobro | `Modal` lateral (escritorio) / inferior (móvil) | Desglose antes de confirmar, recibido y cambio con teclado numérico |
| Confirmación proporcional | `usePrompt` sobre `Modal` | Reversible: un clic. Delicada: motivo. Grave (castigo, anulación): motivo + escribir el número del préstamo |
| Insignias de estado | `Badge` | Siempre color + texto; tonos de la §2 |
| Avisos | `Toaster` propio + `Alert` | Toast para confirmaciones; banner persistente para prueba por vencer, empresa suspendida o modo soporte activo |
| Formularios | `Field` + React Hook Form + Zod; tasas con `PercentInput` (se escriben en %) | Error junto al campo; borrador automático en los largos |
| Línea de tiempo | propia | Cronología del préstamo y del cliente (`DomainEvent`) |
| Calendario de cuotas | propia | Tabla con insignias y barra de progreso del préstamo |
| Menú lateral | `shell/Sidebar` (modelo en `shell/menu.tsx`) | Decisión 114: la marca en Sora con la í dorada, la tarjeta de la empresa, tres grupos (**Operación · Cobro · Gestión**) con filas de 38 px; el activo sobre `brand-900`, en blanco, con el trazo del ícono más grueso y **la barrita dorada de 3 px contra el borde**; insignias en un círculo translúcido. Reportes, Finanzas y Ajustes son una sola entrada cada uno: sus pantallas viven en el submenú de sección (una sección con una sola pantalla se muestra como esa pantalla). Al pie, el usuario y «Plegar menú». Desplazamiento automático al ítem activo, la textura de marca y el riel de la §4 |
| Submenú de sección | `shell/SectionNav` | Las pantallas de Reportes, Finanzas o Ajustes: una columna de 208 px a la izquierda del contenido en escritorio (etiqueta superior y filas con ícono; la activa en `brand-100`/`brand-800`) y una tira de pastillas que se desliza en tableta y celular. Se queda quieta al cambiar de pantalla: solo sube el contenido |
| Barra superior | `shell/Topbar` | Migas (sección › pantalla › detalle, todas menos la última enlazan), el buscador de 340 px con su atajo (⌘K o Ctrl K según el equipo), el selector de sucursal, el tema y la campana con un punto rojo (la cuenta va en su nombre accesible). En el celular: la marca, buscar, la campana y el avatar |
| Selector de sucursal | `BranchPicker` + `lib/scope.ts` | «Toda la empresa» o una sucursal (punto esmeralda o dorado). Solo para quien ve todas las sucursales, solo con más de una y solo en las pantallas que lo respetan (`SCOPED_PATHS`, hoy el inicio): un filtro que no filtra no se muestra. En el celular va en la hoja «Más». Dura lo que la pestaña del navegador |
| Barra inferior del celular | `shell/MobileBar` | Pestañas con una píldora menta de 56×30 en la activa y, en el centro, **«Cobrar»: un círculo esmeralda de 52 px que sobresale 22 px** (solo para quien cobra). Oficina: Inicio · Clientes · Cobrar · Ruta · Más; cajero: Caja en lugar de Ruta; cobrador: Ruta · Clientes · Cobrar · Cobranza · Más; quien no cobra: Inicio · Clientes · Solicitudes · Préstamos · Más. «Más» abre el menú completo en una hoja verde |
| Textura de marca | `Texture` | Dos capas absolutas detrás del contenido (luz suave y retícula de puntos), tono `forest` o `sand`; el contenedor va `relative` (y `overflow-hidden` si tiene esquinas redondeadas) |
| Título de sección | `Section` | El título en 17 px y una nota a la derecha (el alcance de las cifras) |
| Tarjeta de bienvenida | `Welcome` (Inicio) | Textura en dorado sobre arena, la fecha como etiqueta superior, el saludo grande, la prueba gratis como chip dorado, las acciones y la cifra del día: lo cobrado hoy frente a lo que vencía, con su barra de avance (solo para quien lee los indicadores) |
| Menú de usuario | `shell/UserMenu` | Al pie del menú lateral (en el celular, el avatar de la barra superior): avatar menta con iniciales, nombre y rol; dentro: Mi cuenta, Cerrar sesión y, en el celular, el tema. El panel va fijo a la página para que el menú no lo recorte |
| Avatar | `Avatar` | Iniciales en un círculo con un tono suave fijo por nombre: clientes, usuario y empresa |
| Botones de fila | `Button size="sm"` · `variant="soft"` | La acción principal de cada fila de una lista es tonal (verde suave), nunca el verde relleno de la acción de la pantalla |
| Progreso | `TopProgress` | Barra fina arriba mientras una pantalla carga sus datos o se guarda algo; espera 180 ms para no parpadear |
| Lista de pagos | `PaymentList` | Recibos de un préstamo, un cliente o una caja, paginados de 25 en 25 |
| Insignia de estado | `Badge` (`dot`) | Decisión 115: tinte suave del estado, sin borde, 11 px; con punto cuando es un estado («● Al día», «● 3 días de atraso») |
| Selector segmentado | `Segmented` | Opciones lado a lado en una caja: filtros con su cuenta, frecuencia, mensual/anual; la elegida en menta |
| Tablas | `Table` (rejilla CSS) · `.data-table` (HTML) | `Table` recibe las columnas (`minmax(0, Nfr)` y anchos fijos, nunca `auto`: cada fila es su propia rejilla), el encabezado y el pie; en el celular, una tarjeta por fila. Las tablas HTML de finanzas y reportes llevan `.data-table`: encabezado en `surface-2` de 12 px, filas de 13 px, `tfoot` en negrita, y dentro de una tarjeta con relleno sangran hasta su borde (`-mx-4 sm:-mx-5`). Cifras a la derecha y sin partir |
| Calendario del préstamo | `LoanCalendar` | Cuotas pagadas con su barra, la próxima resaltada en `brand-50`, estados con color (pagada, con atraso, parcial, vencida, próxima, pendiente); se abre alrededor de la próxima y se despliega entera |
| Pasos | `Steps` | Tareas largas (la solicitud): verticales con línea en escritorio, barras cortas en el celular |
| Cotización | `QuoteBlock` | «Así queda»: la cuota en grande sobre bosque, total, interés, neto, última cuota y las primeras cuotas; la misma cotización del servidor en la solicitud y el simulador |
| Acciones del préstamo | `useLoanMenu` | Las mismas acciones (y sus diálogos) en «Más» del préstamo y en la lista de la ficha del cliente; las destructivas al final, en rojo |
| Contraseña | `PasswordInput` | Con su ojo para ver lo escrito |
| Pantallas públicas | `PublicPage` | Mitad bosque con la promesa de la marca y mitad arena con el formulario de 420 px; en el celular, el bosque arriba y el formulario en una hoja que sube |
| Resultado de una página pública | `Outcome` | Decisión 116: un sello (✓ en verde, ⚠ en rojo o ámbar), el título y una línea con el siguiente paso; debajo, el botón que lo da |
| Formularios largos | `Group` (Productos) | Por partes con título, una línea que dice qué gobierna y una raya entre partes; el botón de guardar en una franja al pie de la tarjeta |
| Detalle con columna lateral | rejilla `minmax(0,1fr) + 21–22rem` | Lo principal a la izquierda (el recibo, la tabla del equipo); al lado, lo que acompaña y la acción delicada en su propia tarjeta. La columna aparece desde `xl` cuando la pantalla tiene submenú |

**Jerarquía de acciones por pantalla:** 1 primaria (verde, rellena) · secundarias (borde) · el resto en «Más» (menú). Las destructivas, en rojo y al final.

## 6. Modo oscuro

- Se implementa desde la Fase 1 con los tokens de la §2 (es barato al inicio y carísimo después).
- **El tema claro es el predeterminado** (ajuste del 05/10/2026, a pedido del dueño). El oscuro se activa con el interruptor de la barra superior o desde el menú de usuario; los dos leen el mismo almacén (`lib/theme.ts`) y la elección se recuerda en el navegador.
- Los documentos PDF son siempre claros.

## 6 bis. Movimiento (decisión 112)

La interfaz responde a la mano: nada se queda plano al tocarlo. Un solo *easing* (`cubic-bezier(0.2, 0.8, 0.2, 1)`), duraciones de 80 a 320 ms y todo se apaga con `prefers-reduced-motion`.

| Pieza | Movimiento |
| --- | --- |
| Botones (`buttonClass`) | Se elevan 1 px al pasar (el primario gana sombra) y se encogen al 97 % al pulsar; desactivados, quietos |
| Enlaces del menú, barra del celular, botones de ícono | La misma pulsación (`press` + `press-down`); el botón «Cobrar» se encoge al 94 % |
| Menú lateral | Se pliega y despliega en 240 ms (`duration-240 ease-out-soft`) |
| Barras de avance y columnas (decisión 114) | Crecen desde la izquierda (`animate-grow-x`, 1 s con 250 ms de espera) o desde la base (`animate-grow-y`, 700 ms) |
| Indicador «en vivo» | Un punto esmeralda que respira cada 2 s (`animate-live`) |
| Filas de lista (`rowLinkClass`) | Fondo al pasar y un tono más fuerte mientras se pulsa |
| Mosaicos del inicio (`Tile`) | `lift`: suben 2 px con sombra al pasar y vuelven al pulsar; los KPI solo ganan sombra |
| Entrada de cada pantalla | El contenido de `main` sube 8 px y aparece (`animate-rise`, 260 ms); la clave es la ruta, así que cada navegación lo repite |
| Mosaicos y KPI del inicio | Aparecen uno tras otro (`animate-reveal`, 45 ms de desfase por tarjeta) |
| Pestañas (`Tabs`) | Un solo indicador verde se desliza de la pestaña anterior a la elegida (200 ms) |
| Diálogos | El panel entra con `animate-pop` y el fondo oscurecido aparece en 180 ms |
| Avisos y estados vacíos | `animate-fade` y `animate-rise` |
| Interruptor de tema | El ícono nuevo entra con `animate-pop` al cambiar |

Lo que no se anima, a propósito: las cifras, salvo **la cifra del día del inicio**, que cuenta hasta su valor en 1.2 s (`useCountUp`, con su valor real para los lectores de pantalla y quieta con `prefers-reduced-motion`); las tablas largas y los campos de formulario más allá del borde y el anillo de foco.

## 7. Accesibilidad (WCAG 2.2 AA)

- Contraste ≥ 4.5:1 en texto y ≥ 3:1 en controles; verificado por tokens, no pantalla por pantalla.
- Foco visible de 2 px (`--accent-500` sobre claro, `--brand-700` sobre oscuro) en todo control.
- Toda imagen e ícono funcional con texto alternativo; ícono nunca solo (texto o burbuja).
- Navegación completa por teclado; atajos: `Ctrl+K` buscar, `C` cobrar desde el expediente, `Esc` cierra.
- Etiquetas asociadas a cada campo; errores anunciados a lectores de pantalla.
- Objetivos táctiles ≥ 44 px en móvil.
- Sin información transmitida solo por color (§2).

## 8. Voz y textos

- **Tú** implícito y verbos directos: «Cobrar», «Abrir caja», «Registrar pago».
- Errores que dicen qué pasó y qué hacer: «La caja está cerrada. Ábrela para cobrar en efectivo».
- Pantallas vacías con acción: «Aún no hay solicitudes · Crear solicitud».
- Español dominicano neutro en la interfaz; los términos del negocio son los de la calle: cuota, mora, fiao no (demasiado coloquial), rendición, cuadre.

## 9. Decisiones de este paso

| # | Decisión | Estado |
| --- | --- | --- |
| 047 | Identidad propia de Cobradía en verde profundo + ámbar, distinta del morado de la referencia (riesgo de confusión de marca) | Aprobada |
| 048 | Sistema de diseño de este documento: tokens §2–§4, Inter con números tabulares, componentes §5, modo oscuro desde la Fase 1, accesibilidad AA y reglas de voz | Aprobada |
