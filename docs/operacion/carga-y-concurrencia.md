# Carga y concurrencia

Pruebas del doc 10 §2 (fila «Carga»: 30 usuarios concurrentes por empresa y cobros simultáneos al mismo préstamo), decisión 106. Hechas el 09/10/2026 con las imágenes de producción (`infra/production`) en una computadora local, sobre los datos de `seed_demo`.

## Concurrencia (en la CI)

`apps/payments/tests/test_concurrency.py` lanza hilos reales, cada uno con su conexión y su transacción en PostgreSQL, que arrancan juntos:

| Caso | Resultado esperado | Resultado |
| --- | --- | --- |
| 8 cajeros cobran RD$ 350 a la vez sobre un préstamo que debe 4 × 350 | Se aceptan exactamente 4; el resto se rechaza; el préstamo queda saldado y los libros cuadran | Bien |
| El mismo cobro enviado 6 veces a la vez con la misma clave (doble clic) | Un solo pago; las 6 respuestas devuelven ese pago | Bien |

El préstamo se bloquea fila por fila (`select_for_update`) antes de mirar la clave de idempotencia, así que los cobros simultáneos se ordenan en vez de pisarse.

## Carga (Locust)

`backend/loadtest/locustfile.py`: 30 personas de la misma empresa durante 2 a 3 minutos. 25 navegan lo que abre un día de trabajo (tablero, cartera, clientes, atrasos, búsqueda y un préstamo) y 5 cajeros cobran RD$ 5 una y otra vez sobre los mismos tres préstamos, para que los cobros choquen a propósito. Cada rol abre solo lo que la matriz de permisos le deja.

| Medida | Resultado |
| --- | --- |
| Solicitudes | ≈ 16 por segundo, 1,900 a 3,000 por corrida |
| Fallos | **0** (en la corrida final) |
| Tiempo de respuesta, mediana | 15 ms |
| Tiempo de respuesta, p95 | 83 ms (incluye el inicio de sesión) |
| Cobro, p95 | 93 ms |
| Después de la carga | `verificar_integridad` sin problemas; ningún cobro duplicado |

La máquina que genera la carga es la misma que sirve la app, así que las cifras son orientativas: sirven para ver que no hay cuellos de botella ni errores bajo concurrencia, no para dimensionar el servidor. Se repite contra `staging.cobradia.com` con el tamaño de servidor elegido.

**Encontrado:** Gunicorn 26 intentaba crear su socket de control en `/app`, que el usuario sin privilegios no puede escribir; se movió a `/tmp`.

## Cómo repetirla

```bash
# Servidor con la configuración de producción y la demo (nunca contra producción):
# REQUIRE_MFA=false en su .env, `seed_demo --allow-non-debug` y la caja de la cajera abierta.
cd backend
uvx --from locust locust -f loadtest/locustfile.py --headless -u 30 -r 5 -t 3m --host https://localhost:8443
```
