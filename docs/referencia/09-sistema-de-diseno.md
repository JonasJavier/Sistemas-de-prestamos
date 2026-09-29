# 09 · Sistema de diseño de la referencia y dirección para el nuestro

Valores extraídos del CSS calculado en el navegador (`getComputedStyle`), no estimados a ojo.

## 9.1 Tokens observados

### Color

| Rol | Valor | Uso |
| --- | --- | --- |
| Púrpura marca | `#6D087A` (rgb 109, 8, 122) | Fondo del menú lateral, botones `.btn-purple`, cabecera de tablas, bandas de títulos en Consultar |
| Púrpura hover | `#A161AA` | Hover de botones |
| Lila fila alterna | `#E7BBED` (rgb 231, 187, 237) | Filas pares de tablas de calendario |
| Verde marca | `#519608` (rgb 81, 150, 8) | Ítem activo del menú, borde de foco en inputs, cuota pagada |
| Verde hoja (logo) | ≈ `#5A9E3A` | Logotipo de uva |
| Azul primario | `#2949EF` | Títulos de tarjeta (h5), enlaces, paginación activa |
| Naranja | `#FD7E14` | Cuota o cuenta vencida, botón Incobrable |
| Rojo | `#FE4D2E` | Errores, contador de pendientes |
| Cian | `#00BCD4` | Toast informativo |
| Fondo de página | `#F2F3FA` | Área de contenido |
| Superficie | `#FFFFFF` | Tarjetas, cabecera superior |
| Texto | `#212529` | Cuerpo |
| Texto de menú | `#B4BCC8` calculado (se ve blanco sobre púrpura) | Enlaces del menú |
| Borde de input | `#CED4DA` | Campos |

### Tipografía

| Elemento | Valor |
| --- | --- |
| Familia base | **Poppins** 300/400/500/600/700 |
| Cuerpo | 14 px / 400 |
| Título de tarjeta (h5) | 17,5 px / 500 / azul |
| Etiquetas | 12 px |
| Inputs y botones | 12,25 px (`form-control-sm`, `btn` pequeños) |
| Tablas de calendario y reportes | **monospace** del sistema |
| Documentos PDF | Serif tipo Times |

### Forma y elevación

| Elemento | Valor |
| --- | --- |
| Tarjeta | radio 8,4 px; sombra `0 1px 15px 1px rgba(62,57,107,.07)` |
| Cabecera superior | 66 px; sombra `0 2px 4px rgba(0,0,0,.08)` |
| Menú lateral | 255 px de ancho; ítems de 45 px con padding `5px 25px` |
| Inputs | 30,6 px de alto; radio 2,8 px |
| Botones | radio 2,8 px; padding `5px 10px`; tamaños `.btn-xs` y `.btn-xss` muy pequeños |
| Dropdown | radio 3,5 px; sombra `0 7px 14px rgba(0,0,0,.18)` |
| Breakpoints | 576 / 768 / 992 / 1200 (Bootstrap 4) |

## 9.2 Patrones de layout

1. **Shell:** menú lateral púrpura fijo + cabecera blanca con hamburguesa, título «Púrpura Datos» centrado y avatar (menú de administración). En móvil, el menú se oculta tras la hamburguesa.
2. **Marca de agua:** el logotipo de uva gigante está fijo en el centro del fondo de *todas* las pantallas y se ve a través de las tarjetas.
3. **Dos tarjetas lado a lado:** tabla o resultado a la izquierda, filtros y totales a la derecha (Caja, Cartera, Atrasos, Cuentas por Pagar, Préstamo). En móvil se apilan con la tabla primero.
4. **Filtros como selects en rejilla 2×n**, aplicados en vivo (Livewire), sin chips ni «limpiar filtros».
5. **Totales como pares etiqueta/valor** en texto plano, no como tarjetas de indicador.
6. **Modales para casi todo** (búsqueda de préstamo, cobro, recibo, reverso, renovar, mora, documentos). Algunos modales se abren solos al entrar (Consultar, Pagos).
7. **Tablas DataTables** con «Mostrar N registros» y búsqueda, en español.

## 9.3 Lo que funciona y conviene conservar

- Identidad fuerte y reconocible: púrpura profundo + verde, logotipo de uva.
- Codificación por color del estado de la cuota (verde, naranja, neutro), comprensible sin leer.
- Calendario siempre visible junto al formulario del préstamo: el usuario comprueba el cálculo antes de guardar.
- Densidad alta en pocas pantallas; el personal ve mucho sin navegar.
- Totales de reporte cerca de los filtros; el efecto del filtro se ve al instante.
- Funciona en móvil (apilado), algo importante para cobradores.

## 9.4 Problemas de UX

| Problema | Ejemplo |
| --- | --- |
| Marca de agua compite con los datos | Uva gigante detrás de tablas y formularios; en inicio no hay nada más |
| Jerarquía plana de acciones | 11 botones púrpura del mismo tamaño en el préstamo; «Borrar» junto a «Editar» |
| Tipografía diminuta | Botones de 12 px con padding mínimo; objetivos táctiles < 32 px |
| Tres tipografías sin criterio | Poppins + monospace en tablas + serif en PDF |
| Estados ausentes | Sin vacíos útiles («Ningún dato disponible»), sin *skeletons* (pantalla «Loading…» completa) |
| Navegación con pasos de más | Cliente → préstamo → cuota para cobrar |
| Configuración escondida | Mora y gastos de cierre en el menú del avatar |
| Controles rotos | Acordeones del cliente, botón Guardar invisible en modal, HTTP 405 |
| Accesibilidad | Inputs sin `label` asociada, contraste bajo (texto `#B4BCC8`), foco verde poco visible, sin atajos |
| Formato de números | `97'925.00`, enteros en reportes, sin símbolo de moneda |
| Sin confirmaciones | Incobrable cambia al instante |

## 9.5 Dirección de diseño para nuestro sistema

**Principio:** conservar el carácter púrpura y verde, pero con un sistema moderno, accesible y denso donde hace falta.

### Paleta propuesta (a validar con contraste AA)

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--brand-900` | `#3E0647` | — | Menú lateral (más profundo que el actual para mejor contraste) |
| `--brand-700` | `#6D087A` | `#C07ACB` | Acción primaria, enlaces |
| `--brand-100` | `#F4E6F6` | `#2A1530` | Fondos de selección, filas destacadas |
| `--accent-600` | `#4E8F0A` | `#8BCB4A` | Éxito, pagado, ítem activo |
| `--warning-600` | `#C2410C` | `#FB923C` | Vencido, atención |
| `--danger-600` | `#B91C1C` | `#F87171` | Errores, acciones destructivas |
| `--info-600` | `#0369A1` | `#38BDF8` | Información |
| `--surface` | `#FFFFFF` | `#17121A` | Tarjetas |
| `--canvas` | `#F6F5F9` | `#0F0B12` | Fondo |
| `--text` | `#1C1622` | `#EDE9F0` | Texto |
| `--muted` | `#6B6475` | `#A39CAD` | Secundario |

### Tipografía

- **Interfaz:** Inter o Poppins en 14/16 px base; títulos 20–24 px.
- **Cifras:** números tabulares (`font-variant-numeric: tabular-nums`) en lugar de monospace, para alinear importes sin perder estética.
- **Documentos:** una sola sans o serif profesional coherente con la marca.

### Componentes clave

1. **Barra de comandos global** (Ctrl+K): buscar cliente, préstamo o documento; acciones «Cobrar», «Nuevo préstamo».
2. **Tarjetas de indicador (KPI)** con valor, variación y tooltip de definición.
3. **Tabla de datos** con filtros persistentes como chips, columnas configurables, orden, selección múltiple, exportación y estado vacío con acción.
4. **Línea de tiempo del préstamo:** desembolso, pagos, reversos, cambios de fecha y documentos.
5. **Calendario de cuotas** con badges de estado (Pagada · Parcial · Vencida · Pendiente) y barra de progreso del préstamo.
6. **Panel lateral de cobro** (*sheet*) en lugar de modal: desglose, efectivo, cambio y confirmación.
7. **Diálogo de confirmación proporcional:** simple para acciones reversibles; con motivo y escritura del nombre para acciones graves.
8. **Toasts** para confirmar y **banners** persistentes para alertas (atrasos, licencia).
9. **Logotipo discreto** en el menú, sin marca de agua en las pantallas de trabajo.
10. **Modo oscuro** y diseño *mobile-first* para la vista de cobrador.

### Reglas de accesibilidad

WCAG 2.2 AA: contraste ≥ 4,5:1, foco visible de 2 px, etiquetas asociadas, objetivos táctiles ≥ 44 px en móvil, navegación completa por teclado, mensajes de error junto al campo y anunciados.
