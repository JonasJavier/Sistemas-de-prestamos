# Material de ventas (C3)

Lo que Jonas usa para vender Cobradía. Redactado por el responsable técnico el 26/10/2026 con los precios de la decisión 124 y las funciones de cada plan; **validado por Jonas el 26/10/2026**; se vuelve a validar cuando cambien precios o planes.

| Pieza | Para qué | Archivo |
| --- | --- | --- |
| **Folleto de una página** (A4) | Dejarlo en la mano o mandarlo por WhatsApp después de una visita | [folleto.pdf](folleto.pdf) · fuente [folleto.html](folleto.html) |
| **Presentación** (9 láminas) | Reuniones con el dueño o el gerente; se proyecta o se manda por correo | [presentacion.pdf](presentacion.pdf) · fuente [presentacion.html](presentacion.html) |
| **Comparativa** | Contestar «¿y en qué se diferencia de X?» | [comparativa.md](comparativa.md) |
| **Guion de demostración** | Los 15 minutos de la demo, con las objeciones y qué responder | [guion-demo.md](guion-demo.md) |

## Cómo regenerar los PDF

Los dos PDF salen de su HTML con el mismo motor que usa la app para sus documentos (WeasyPrint). Tras editar el HTML:

```bash
uv run --directory backend python ../docs/ventas/render.py
```

Las fuentes (Sora e Inter) se toman de `frontend/node_modules`, así que hace falta haber corrido `pnpm install` en el frontend; el logo se toma de `site/public/marca/`.

## Qué cambiar cuando cambie algo

- **Precios o planes:** el folleto, la lámina 7 y 8 de la presentación y la comparativa. Los precios viven también en `site/src/pages/index.astro` y en el panel de la plataforma (Planes y cobros).
- **Prueba gratis:** hoy 15 días (decisión 126); aparece en el folleto, en las láminas 7 y 9 y en el guion.
- **RNC y factura fiscal:** cuando Cobradía emita e-CF, quitar el paréntesis de la objeción «¿Tiene factura con crédito fiscal?» del guion.
- **WhatsApp de soporte (C4):** cuando exista, agregarlo al folleto y a la última lámina junto al correo.
