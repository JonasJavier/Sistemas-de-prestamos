# Plan de respuesta a incidentes

Qué hacer cuando algo sale mal en producción (doc 10 §4, criterio 7; decisión 101). Lo aplica el dueño de la plataforma con quien lleve la parte técnica. El manual del servidor está en [`infra/production/README.md`](../../infra/production/README.md).

## 1. Qué es un incidente y qué tan grave

| Nivel | Ejemplos | Respuesta |
| --- | --- | --- |
| **Crítico** | La app no abre para nadie; datos de una empresa visibles para otra; sospecha de acceso no autorizado; pérdida o daño de datos; la conciliación nocturna marca diferencias en varias empresas | Empezar de inmediato, a cualquier hora |
| **Alto** | Una función central falla (cobrar, desembolsar, cerrar caja) para una o más empresas; los correos no salen; un respaldo nocturno falló | El mismo día |
| **Normal** | Un error que tiene vuelta (un reporte, una pantalla); lentitud puntual | En la próxima versión |

Ante la duda, se trata como el nivel más alto.

## 2. Cómo nos enteramos

- El chequeo externo de `/api/v1/salud/` (avisa al dueño).
- Sentry (errores de la aplicación).
- La conciliación nocturna (avisa al gerente de la empresa en la campana).
- El registro de respaldos (`/var/log/cobradia-backup.log`).
- Una empresa que escribe o llama.
- Las alertas antifraude de cada empresa (fase 7).

## 3. Los pasos

1. **Registrar:** abrir una nota con la hora, quién avisó, qué se ve y el nivel. Todo lo que se haga se anota ahí con su hora.
2. **Contener** (primero frenar el daño, después entender):
   - **Acceso no autorizado o fuga entre empresas:** cerrar la puerta. Rotar `DJANGO_SECRET_KEY` (cierra todas las sesiones) y las contraseñas afectadas; si el problema está en el código, apagar el servicio (`docker compose stop web`) hasta corregirlo. Se prefiere la app caída a datos expuestos.
   - **Una versión nueva rompió algo:** volver a la etiqueta anterior (manual del servidor, «Volver atrás»).
   - **Datos dañados:** detener `api`, `worker` y `beat` para que no se escriba más; no borrar nada.
   - **El servidor no responde:** revisar el proveedor; si no vuelve, levantar un servidor nuevo y restaurar el último respaldo.
3. **Diagnosticar:** `docker compose ps`, `docker compose logs --since 2h api worker`, Sentry, la auditoría de la empresa (doc 06 §9) y `python manage.py verificar_integridad`.
4. **Corregir:** con prueba que reproduzca el fallo, CI en verde y etiqueta nueva; o restaurando el respaldo, si hace falta.
5. **Comprobar:** salud en 200, `verificar_integridad` sin problemas y una prueba real de la función afectada.
6. **Avisar** (abajo).
7. **Aprender:** en la semana, una nota corta con la causa, qué la dejó pasar y qué se cambió para que no se repita (una prueba, una alerta, un paso del proceso). Sin culpables: se arregla el proceso.

## 4. A quién se avisa

- **A las empresas afectadas,** en el mismo día si su operación se detuvo: qué pasó, desde cuándo, qué se hizo y si deben revisar algo (por ejemplo, cobros registrados en el intervalo).
- **Si hubo acceso indebido a datos personales,** además: a las empresas afectadas por escrito, con qué datos y de qué clientes, para que cumplan sus propias obligaciones con sus clientes; y lo que la Ley 172-13 exija a Cobradía como encargada del tratamiento. **Validar con el abogado** el plazo y la forma (decisión 101).
- El aviso lo da el dueño; el texto se escribe con los hechos comprobados, sin suposiciones.

## 5. Contactos

| Quién | Para qué | Cómo |
| --- | --- | --- |
| Dueño de la plataforma (Jonas) | Decide, avisa a las empresas | *por completar* |
| Responsable técnico | Contiene, diagnostica y corrige | *por completar* |
| Proveedor del servidor | Caída del servidor, red, *snapshots* | *por completar al contratarlo* |
| Proveedor de correo y Twilio | Envíos que no salen | *por completar al contratarlos* |
| Abogado | Avisos por datos personales | *por completar* |

## 6. Ensayos

- **Restauración:** cada mes, con `restore.sh` (manual del servidor), anotando el tiempo y el resultado.
- **Este plan:** una vez al año, un ejercicio de mesa con un caso inventado (por ejemplo, «un cobrador ve clientes de otra empresa»), para ver si los pasos y los contactos siguen sirviendo.
