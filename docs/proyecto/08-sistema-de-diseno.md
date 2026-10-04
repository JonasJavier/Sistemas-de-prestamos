# 08 · Sistema de diseño de Cobradía

**Estado:** aprobado el 04/10/2026 (decisiones 047 y 048)

**En una frase:** una identidad propia en **verde profundo y ámbar** (decisión 047, distinta de la referencia Púrpura Datos), sobre Tailwind 4 + shadcn/ui, con alta densidad donde se trabaja, números tabulares para el dinero, modo claro y oscuro, y accesibilidad WCAG 2.2 AA.

Este documento define los *tokens* y patrones que la Fase 1 convierte en código (`@theme` de Tailwind y componentes shadcn ajustados). Lo que funciona de la referencia se conserva ([ficha 09](../referencia/09-sistema-de-diseno.md#93-lo-que-funciona-y-conviene-conservar)); sus problemas de UX ([9.4](../referencia/09-sistema-de-diseno.md#94-problemas-de-ux)) se corrigen aquí.

## 1. Identidad

- **Marca:** Cobradía, siempre con su acento en la interfaz y los documentos; el dominio es `cobradia.com` (decisión 044).
- **Personalidad:** seria y confiable (maneja dinero ajeno), pero cercana y en español llano. Nada de jerga técnica en la interfaz.
- **Logotipo:** por ahora, un *wordmark* «Cobradía» en Inter SemiBold con el punto de la í en ámbar, como detalle distintivo. Un logotipo profesional se encarga antes del lanzamiento; el sistema solo necesita que quepa en un cuadrado (favicon, menú plegado) y en horizontal (encabezados).
- **Sin marca de agua** en las pantallas de trabajo (problema #1 de la referencia). El logo vive en el menú lateral y en los documentos.
- **El logo de cada empresa** (tenant) aparece en **sus** documentos y en su encabezado interno; la marca Cobradía queda en el pie de página de los documentos («Generado con Cobradía · cobradia.com») y en las pantallas públicas. Así el pagaré es de la financiera, no nuestro.

## 2. Color

Los valores cumplen contraste AA sobre su fondo de uso. Se definen una vez como tokens de Tailwind; los componentes nunca usan colores sueltos.

### Claro

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand-950` | `#06281A` | Menú lateral, texto sobre fondos de marca claros |
| `--brand-800` | `#14532D` | Texto de marca sobre blanco, hover de la acción primaria |
| `--brand-700` | `#166534` | **Acción primaria**, enlaces, ítem activo |
| `--brand-100` | `#DCFCE7` | Selecciones, filas destacadas, fondos de insignia «al día» |
| `--accent-500` | `#F59E0B` | Ámbar de marca: detalles, foco de atención, barra de la prueba |
| `--success-600` | `#16A34A` | Pagado, cuadrado, confirmaciones |
| `--warning-700` | `#B45309` | Vencido 1–30 días, atención (texto); fondo `#FEF3C7` |
| `--danger-600` | `#DC2626` | Errores, mora grave (31+ días), acciones destructivas |
| `--info-700` | `#0369A1` | Información neutral |
| `--canvas` | `#F5F7F4` | Fondo de la página (gris con un grado de verde) |
| `--surface` | `#FFFFFF` | Tarjetas, tablas, barras |
| `--text` | `#17201A` | Texto principal |
| `--muted` | `#5B6660` | Texto secundario |
| `--border` | `#D9DFDA` | Bordes y separadores |

### Oscuro

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand-700` | `#4ADE80` | Acción primaria y enlaces (con texto oscuro encima) |
| `--brand-100` | `#122A1C` | Selecciones |
| `--accent-500` | `#FBBF24` | Ámbar |
| `--canvas` | `#0C120E` | Fondo |
| `--surface` | `#151C17` | Tarjetas |
| `--text` | `#E7EDE8` | Texto |
| `--muted` | `#9AA69E` | Secundario |
| `--border` | `#2A332C` | Bordes |

Éxito, aviso, peligro e información usan las variantes claras de cada familia (`#4ADE80`, `#FCD34D`, `#F87171`, `#38BDF8`) con fondos oscuros de su mismo tono.

### Reglas de uso

1. **El verde de marca es acción e identidad; el dinero no se colorea por sí mismo.** Un importe es texto normal; el color lo da su **estado** (insignia), no el signo de pesos.
2. **Estados de cuota y préstamo:** al día `brand-100`/`brand-800` · pagada `success` · parcial `info` · vencida 1–30 `warning` · vencida 31+ o legal `danger` · saldado gris. Siempre color **más texto**: nunca solo color (accesibilidad).
3. **El ámbar es acento, no alarma:** barra de días de prueba, destellos del logo, resaltados. Las alertas usan `warning`/`danger`.
4. **Un solo color primario por pantalla:** una acción principal verde; el resto, botones secundarios (borde) o fantasma. (Corrige los 11 botones púrpura iguales de la referencia.)

## 3. Tipografía

| Elemento | Valor |
| --- | --- |
| Familia única | **Inter** (variable), autoalojada; `system-ui` de respaldo |
| Cuerpo | 14 px / 400 en escritorio; 16 px en móvil |
| Secundario y etiquetas | 12.5 px / 500, `--muted` |
| Títulos de pantalla | 20 px / 600 |
| Cifras de tablero (KPI) | 28 px / 700 |
| **Importes** | `font-variant-numeric: tabular-nums` **siempre**: en tablas, totales, recibos y KPI. Alineados a la derecha en tablas |
| Documentos PDF | La misma Inter (coherencia de marca); los legales pueden usar una serif si el abogado lo pide |

Formato regional fijo (es-DO): `RD$ 1,250.00`, fechas `04/10/2026`, sin notaciones como `97'925.00` (defecto #41 de la referencia).

## 4. Forma, espacio y elevación

| Elemento | Valor |
| --- | --- |
| Escala de espaciado | Múltiplos de 4 px; secciones separadas por 24 px |
| Radios | 8 px en controles y tarjetas; 12 px en diálogos y hojas; 999 px en insignias |
| Sombras | Dos niveles: tarjeta (`0 1px 2px rgba(6,40,26,.06)`) y flotante (`0 8px 24px rgba(6,40,26,.14)`). Nada más |
| Altura de controles | 36 px en escritorio; 44 px mínimo en móvil (objetivo táctil) |
| Filas de tabla | 40 px (densa pero legible); modo compacto opcional de 32 px en reportes |
| Menú lateral | 248 px; plegado, 56 px con íconos y burbujas de ayuda |
| Barra superior | 56 px |
| Puntos de quiebre | Los de Tailwind (`sm 640 · md 768 · lg 1024 · xl 1280`); el diseño de cobro y «Mi ruta» se hace primero para 360–430 px |

## 5. Componentes (sobre shadcn/ui)

Los diez componentes clave definidos en la [dirección de diseño](../referencia/09-sistema-de-diseno.md#95-dirección-de-diseño-para-nuestro-sistema) se adoptan tal cual, con estas precisiones:

| Componente | Base shadcn | Precisiones |
| --- | --- | --- |
| Barra de comandos (Ctrl+K) | `Command` | Resultados agrupados (clientes, préstamos, acciones); acción directa «Cobrar» con Enter |
| Tabla de datos | `Table` + TanStack Table | Filtros como chips removibles sincronizados con la URL; totales fijos al pie que respetan los filtros; estado vacío con acción |
| Tarjeta KPI | `Card` | Valor, comparación y un «?» con la definición exacta del indicador (paso 9) |
| Panel de cobro | `Sheet` lateral (escritorio) / inferior (móvil) | Desglose antes de confirmar, recibido y cambio con teclado numérico |
| Confirmación proporcional | `AlertDialog` | Reversible: un clic. Delicada: motivo. Grave (castigo, anulación): motivo + escribir el número del préstamo |
| Insignias de estado | `Badge` | Siempre color + texto; tonos de la §2 |
| Avisos | `sonner` (toast) + banner | Toast para confirmaciones; banner persistente para prueba por vencer, empresa suspendida o modo soporte activo |
| Formularios | `Form` + React Hook Form + Zod | Error junto al campo; borrador automático en los largos |
| Línea de tiempo | propia | Cronología del préstamo y del cliente (`DomainEvent`) |
| Calendario de cuotas | propia | Tabla con insignias y barra de progreso del préstamo |

**Jerarquía de acciones por pantalla:** 1 primaria (verde, rellena) · secundarias (borde) · el resto en «Más» (menú). Las destructivas, en rojo y al final.

## 6. Modo oscuro

- Se implementa desde la Fase 1 con los tokens de la §2 (es barato al inicio y carísimo después).
- Sigue la preferencia del sistema; el usuario puede fijarlo en «Mi cuenta».
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
