# Revisión de seguridad antes del lanzamiento

Criterio 8 de lanzamiento (doc 10 §4): escaneo OWASP ZAP sin hallazgos altos y revisión manual hecha. Revisión del 09/10/2026 sobre la versión de la fase 10 corriendo con la configuración de producción (`infra/production`) en una computadora local (decisión 102).

## 1. Revisión manual

| Área | Qué se revisó | Resultado |
| --- | --- | --- |
| Aislamiento entre empresas | RLS forzado en toda tabla con empresa (salvo 8 excepciones documentadas en `apps/core/rls.py`), rol de base sin privilegios, guardia que se niega a operar con un rol que ignore RLS, pruebas de cruce en cada módulo | Bien. `verificar_integridad` lo comprueba también después de restaurar un respaldo |
| Autenticación | Correo verificado, contraseñas de 12+ caracteres, 2FA obligatoria en producción, bloqueo por intentos fallidos, sesión de 30 min sin uso y 12 h máximo, sesiones nuevas al entrar | Bien |
| Autorización | Matriz de roles con una sola fuente (`authz.role_names`), alcance por sucursal, modo soporte de solo lectura | Bien (pruebas por rol y por empresa) |
| Endpoints públicos | Registro, invitación, recibo, verificación de QR y portal: todos con límite de intentos y tokens de 24 bytes imposibles de adivinar | Bien |
| **IP del cliente detrás del proxy** | Detrás de Caddy, Django veía la IP del proxy: los límites por IP se volvían **globales** (cinco registros por hora para todo el mundo; diez inicios fallidos por minuto bloqueaban a todos) y la auditoría guardaba siempre la misma IP | **Corregido:** se confía en exactamente un salto (`TRUSTED_PROXY_COUNT=1`) para DRF, allauth y la auditoría; Caddy, al ser el borde, reemplaza el `X-Forwarded-For` que mande el visitante |
| **Recursos de los PDF** | WeasyPrint cargaba cualquier URL o archivo del disco que apareciera en el HTML: un riesgo de SSRF o de lectura de archivos si algún día entrara contenido sin escapar | **Corregido:** solo `data:` (los QR) y archivos dentro de la carpeta de medios (el logo); todo lo demás se rechaza |
| **Exportación a Excel** | Un nombre de cliente o empresa que empiece con «=» se guardaba como fórmula (inyección de fórmulas al abrir el archivo) | **Corregido:** toda celda de texto queda como texto |
| Archivos subidos | Tipo verificado por su contenido (no por la extensión), 10 MB máximo, guardados fuera de la carpeta pública y servidos con enlace firmado que vence | Bien |
| Inyección | Consultas por el ORM; el único SQL armado a mano usa nombres fijos | Bien |
| XSS | React escapa todo; no hay `innerHTML`; las plantillas de Django escapan | Bien |
| CSRF | Sesión con token CSRF en toda escritura, también en el portal; cookies `Secure`, `HttpOnly` (sesión) y `SameSite=Lax` | Bien |
| Encabezados | HSTS con *preload*, CSP sin `eval` ni scripts en línea, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (solo ubicación, para las rutas) | Bien |
| Superficie | Admin de Django (sin 2FA) y esquema de la API apagados en producción; Postgres y Redis sin puertos publicados; la API corre sin privilegios de root | Bien |
| Secretos | Ningún secreto en el repositorio ni en su historial; `.env` con permiso 600; respaldos cifrados con llave pública | Bien |
| Dependencias | `pip-audit` y `pnpm audit` en cada cambio | Bien |
| Datos personales | Enmascarado por rol, regla de datos personales en reportes, registro de accesos sensibles, Sentry sin datos personales | Bien |

**Aceptado, con su razón:**

- Los enlaces públicos de recibos y verificación llevan su token en la ruta, que queda en el registro de accesos de Gunicorn. Solo lo ve quien administra el servidor, el enlace solo muestra ese recibo y se puede revocar.
- Redis no tiene contraseña: no está expuesto fuera de la red interna de Docker.
- Caddy corre como root dentro de su contenedor para abrir los puertos 80 y 443 (imagen oficial).

**Encontrado al probar la configuración de producción en el navegador** (la CSP estricta habría roto dos funciones que las pruebas de desarrollo no ven, porque en desarrollo no hay CSP):

- **Imprimir recibos y documentos** agregaba una etiqueta `<style>` con el tamaño de la hoja, que la CSP bloquea: ahora usa una hoja de estilo construida (CSSOM), que la CSP permite. Comprobado en el navegador con la CSP de producción.
- **El mapa de rutas** carga los mosaicos de OpenStreetMap: la CSP permite imágenes solo de ese dominio y no se activa COEP en la app. Si el uso crece, se contrata un proveedor de mosaicos.
- **Zod** probaba `Function("")` al construir esquemas: se configura sin compilación antes de cargar cualquier esquema.

## 2. Escaneo OWASP ZAP

Escaneo base (araña clásica y AJAX para la SPA, más reglas pasivas) con `zaproxy/zap-stable` sobre `app` y el sitio, servidos por la imagen de producción.

| | Altos | Medios | Bajos | Informativos |
| --- | --- | --- | --- | --- |
| Primera corrida, app | 0 | 1 (CSP con `style-src 'unsafe-inline'`) | 3 | 4 |
| Primera corrida, sitio | 0 | 1 (el mismo) | 2 | 3 |
| **Tras las correcciones, app** | **0** | **0** | 2 | 4 |
| **Tras las correcciones, sitio** | **0** | **0** | 1 → 0 con COEP | 3 |

Se quitó `'unsafe-inline'` de los estilos (el sitio genera sus hojas como archivos) y se agregaron `Cross-Origin-Resource-Policy` y, en el sitio, `Cross-Origin-Embedder-Policy`.

**Bajos asumidos:**

- *Cookie sin `HttpOnly`:* es `csrftoken`, que la SPA debe leer para mandar el token en cada escritura (diseño de Django); no es la cookie de sesión, que sí es `HttpOnly`.
- *Sin COEP en la app:* activarlo bloquearía los mosaicos del mapa; no hay nada que requiera aislamiento entre orígenes.

**Criterio 8: cumplido** en local. Se repite contra `staging.cobradia.com` cuando exista, con el escaneo completo (activo) de ZAP.
