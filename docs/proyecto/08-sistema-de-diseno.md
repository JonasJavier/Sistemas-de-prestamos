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

1. **Un solo bloque de color: el menú.** El bosque vive en el lateral; el área de trabajo es arena y blanco. Si aparece otro bloque grande de color, sobra. La textura de marca no cuenta como bloque: es un fondo tenue, no un color. El dorado es firma, no botón: nunca para acciones.
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
| Radios | 8 px en controles; 12 px en tarjetas y menús; 16 px en diálogos; 24 px arriba en las hojas del celular; 999 px en insignias y avatares |
| Sombras | Dos niveles teñidos de bosque: tarjeta (`0 1px 2px` y `0 1px 3px` al 4–5 %) y flotante (`0 12px 32px -8px` al 18 %), más un `xs` de 1 px para controles. Nada más |
| Altura de controles | 36 px en escritorio; 44 px mínimo en móvil (objetivo táctil) |
| Filas de tabla | 40 px (densa pero legible); modo compacto opcional de 32 px en reportes |
| Menú lateral | 240 px; **plegado, 64 px**: un riel con un ícono por opción, una burbuja que nombra la opción al pasar o enfocar, las insignias como punto dorado y una línea fina por cada grupo. Se pliega con «Plegar el menú» al pie y la elección se recuerda en el navegador |
| Barra superior | 56 px |
| Puntos de quiebre | Los de Tailwind (`sm 640 · md 768 · lg 1024 · xl 1280`); el diseño de cobro y «Mi ruta» se hace primero para 360–430 px |

## 5. Componentes

Los diez componentes clave definidos en la [dirección de diseño](../referencia/09-sistema-de-diseno.md#95-dirección-de-diseño-para-nuestro-sistema) se adoptan con estas precisiones. **Implementación (decisión 064):** componentes propios y livianos en `frontend/src/components/` con el mismo vocabulario de clases de shadcn/ui, en vez de importar shadcn y Radix: todo overlay (diálogos, búsqueda, menú del celular) usa el `<dialog>` nativo del navegador en modo modal, que atrapa el foco, vuelve inerte el fondo y cierra con Esc sin dependencias. Si una pieza futura lo justifica (menú desplegable, *combobox*), se adopta Radix solo para esa pieza.

| Componente | Base | Precisiones |
| --- | --- | --- |
| Barra de comandos (Ctrl+K) | `CommandPalette` sobre `Modal` | Resultados agrupados (clientes, préstamos, acciones); acción directa «Cobrar» con Enter |
| Tabla de datos | `RowList` + `Pagination` (TanStack Table cuando haga falta ordenar columnas) | Filtros como chips removibles sincronizados con la URL; totales fijos al pie que respetan los filtros; estado vacío con acción |
| Estado vacío | `EmptyState` | El dibujo de la casa (dos tarjetas y el punto dorado), una frase que dice qué pasa y, si cabe, la acción |
| Tarjeta KPI | `Stat` | Valor, comparación y un «?» con la definición exacta del indicador (paso 9) |
| Panel de cobro | `Modal` lateral (escritorio) / inferior (móvil) | Desglose antes de confirmar, recibido y cambio con teclado numérico |
| Confirmación proporcional | `usePrompt` sobre `Modal` | Reversible: un clic. Delicada: motivo. Grave (castigo, anulación): motivo + escribir el número del préstamo |
| Insignias de estado | `Badge` | Siempre color + texto; tonos de la §2 |
| Avisos | `Toaster` propio + `Alert` | Toast para confirmaciones; banner persistente para prueba por vencer, empresa suspendida o modo soporte activo |
| Formularios | `Field` + React Hook Form + Zod; tasas con `PercentInput` (se escriben en %) | Error junto al campo; borrador automático en los largos |
| Línea de tiempo | propia | Cronología del préstamo y del cliente (`DomainEvent`) |
| Calendario de cuotas | propia | Tabla con insignias y barra de progreso del préstamo |
| Menú lateral | `AppShell` | Ícono de línea por ítem, marcador dorado del activo, grupos plegables (Ajustes plegado por defecto; el grupo de la pantalla en uso siempre abierto; la elección se recuerda en el navegador), desplazamiento automático al ítem activo, la textura de marca de fondo y el riel plegado de la §4 |
| Textura de marca | `Texture` | Dos capas absolutas detrás del contenido (luz suave y retícula de puntos), tono `forest` o `sand`; el contenedor va `relative` (y `overflow-hidden` si tiene esquinas redondeadas) |
| Título de sección | `Section` | El punto dorado, el título en 15 px y una nota a la derecha (el alcance de las cifras) |
| Tarjeta de bienvenida | `Welcome` (Inicio) | Textura en dorado sobre arena, la fecha como etiqueta superior, el saludo grande, la prueba gratis como chip dorado, las acciones y la cifra del día: lo cobrado hoy frente a lo que vencía, con su barra de avance (solo para quien lee los indicadores) |
| Menú de usuario | `AppShell` | Avatar con iniciales y nombre con rol; dentro: Mi cuenta, tema claro/oscuro y Cerrar sesión (reemplaza el botón «Salir») |
| Avatar | `Avatar` | Iniciales en un círculo con un tono suave fijo por nombre: clientes, usuario y empresa |
| Botones de fila | `Button size="sm"` · `variant="soft"` | La acción principal de cada fila de una lista es tonal (verde suave), nunca el verde relleno de la acción de la pantalla |
| Progreso | `TopProgress` | Barra fina arriba mientras una pantalla carga sus datos o se guarda algo; espera 180 ms para no parpadear |
| Lista de pagos | `PaymentList` | Recibos de un préstamo, un cliente o una caja, paginados de 25 en 25 |

**Jerarquía de acciones por pantalla:** 1 primaria (verde, rellena) · secundarias (borde) · el resto en «Más» (menú). Las destructivas, en rojo y al final.

## 6. Modo oscuro

- Se implementa desde la Fase 1 con los tokens de la §2 (es barato al inicio y carísimo después).
- **El tema claro es el predeterminado** (ajuste del 05/10/2026, a pedido del dueño). El oscuro se activa con el interruptor de la barra superior o desde el menú de usuario; los dos leen el mismo almacén (`lib/theme.ts`) y la elección se recuerda en el navegador.
- Los documentos PDF son siempre claros.

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
