# Pasarelas de pago para la suscripción (A7)

**Fecha:** 25/10/2026 · **Para:** Jonas · **Estado:** investigación; decisión pendiente.

Qué necesita Cobradía: cobrar cada mes RD$990, 2,290 o 3,690 a cada financiera, con tarjeta guardada (pago recurrente), en pesos, con pocos clientes al principio.

## Lo que cobran, según sus tarifarios públicos

| | **AZUL** (Grupo Popular) | **CardNET** |
| --- | --- | --- |
| Afiliación | RNC, registro mercantil, cuenta empresarial (ideal en Popular). Aprobación 2–6 semanas | Registro mercantil, acta de asamblea, estatutos, cédula del gerente, cuenta en un banco afiliado. Aprobación 2–4 semanas |
| Comercio electrónico (API, página de pago o plugins) | RD$2,500 al mes | Botón de pago RD$2,500; POS virtual o enlace de pago RD$850 |
| Pagos recurrentes | RD$595 al mes si facturas menos de RD$300,000, más RD$5 por transacción procesada y RD$10 por declinada | «Pagos automáticos» RD$850, más tokenización RD$7.50 por transacción |
| Guardar la tarjeta (tokenización) | Bóveda de datos RD$1,800 al mes | Incluida en la tokenización por transacción |
| Autenticación del tarjetahabiente (3D Secure) | RD$10 por transacción (menos de 1,000 al mes) | RD$7.50 por transacción |
| Comisión por tarjeta (MDR) | Hasta 6 %, según análisis del comercio; blogs citan 3.5–5 % | Negociada; blogs citan 3.75–4.25 % |
| Otros cargos | — | Cargo por servicio RD$850; cargo por facturación menor RD$695 si facturas menos de RD$350,000 |
| **Costo fijo mensual aproximado para cobros recurrentes** | **RD$4,900** (2,500 + 595 + 1,800) | **RD$2,400 a 3,000** (850 + 850 + 695, o 2,500 si hace falta el botón de pago) |

Fuentes: [tarifario AZUL](https://www.azul.com.do/Pages/es/tarifarioAzul.aspx) (actualizado el 29/01/2026), [tarifario CardNET](https://www.cardnet.com.do/tarifario), [afiliación empresarial CardNET](https://www.cardnet.com.do/afiliate/empresarial), [comparativa TAKUM](https://takum.io/azul-vs-cardnet-vs-pixelpay-rd/), [portal de desarrolladores AZUL](https://dev.azul.com.do/). Ninguna de las dos publica la documentación de la API de pagos recurrentes: hay que pedirla.

## Qué significa para Cobradía

- Con 5 clientes (unos RD$10,000 al mes) cualquiera de las dos se lleva entre el 25 % y el 50 % de lo cobrado solo en cargos fijos, antes de la comisión. Con 30 clientes (unos RD$60,000) el fijo baja a un 5–8 %: ahí empieza a tener sentido.
- Las dos exigen **registro mercantil** (A8): primero la empresa, después la pasarela.
- La alternativa internacional (Stripe) no opera en República Dominicana. PixelPay es más ágil pero no publica precios.

## Recomendación

1. **Hoy:** cobrar por transferencia o depósito, sin costo, con «subir comprobante» desde la app (D3) para que no tengas que leer correos.
2. **Al llegar a 25–30 clientes** o cuando tengas el registro mercantil, pedir cotización por escrito a las dos. **CardNET parte con ventaja** para un SaaS: fijo más bajo, «pagos automáticos» como producto propio y aprobación más rápida. AZUL es el checkout que más reconoce el cliente dominicano y conviene si tu cuenta empresarial está en Popular.
3. Preguntas que hay que hacerles a las dos, por escrito: comisión exacta para cobros recurrentes en pesos; si la tarjeta se guarda con token y se cobra cada mes sin que el cliente intervenga; documentación de la API y ambiente de pruebas; plazo de liquidación a tu cuenta; si cobran 3D Secure en cada cobro recurrente o solo en el primero.
