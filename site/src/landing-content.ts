import { TRIAL_DAYS } from './config'

/** Decision 124: the three plans Jonas decided on 25/10/2026. */
export const PLANS = [
  {
    name: 'Esencial',
    price: 990,
    pitch: 'Para ordenar la cartera y la caja de la oficina.',
    size: '1 sucursal · 3 usuarios · préstamos sin límite',
    bullets: [
      'Clientes, solicitudes y préstamos',
      'Pagos con recibo impreso o por WhatsApp',
      'Atrasos con mora automática',
      'Caja: apertura, cierre y cuadre',
      'Reportes de cartera y cobros del día',
      'Portal del cliente y seguridad en dos pasos',
    ],
  },
  {
    name: 'Profesional',
    price: 2290,
    featured: true,
    pitch: 'Para financieras con cobradores en la calle.',
    size: '3 sucursales · 10 usuarios · préstamos sin límite',
    bullets: [
      'Todo lo de Esencial',
      'Rutas con GPS y app del cobrador',
      'Promesas, agenda y escalamiento',
      'Recordatorios por WhatsApp, SMS y correo',
      'Clasificación de clientes y antifraude',
      'Gastos, reportes completos y exportaciones',
    ],
  },
  {
    name: 'Empresa',
    price: 3690,
    pitch: 'Para financieras con contabilidad propia.',
    size: 'Sucursales y usuarios sin límite',
    bullets: [
      'Todo lo de Profesional',
      'Contabilidad NIIF, 606 y 607',
      'Comprobantes fiscales y cuentas por pagar',
      'Bancos y conciliación bancaria',
      'Comisiones y vía legal',
      'Soporte prioritario y migración acompañada',
    ],
  },
]

export const FAQ = [
  {
    q: '¿Necesito instalar algo?',
    a: 'No. Cobradía funciona en el navegador de la computadora y del celular. Tus cobradores solo necesitan un teléfono con internet.',
  },
  {
    q: '¿Puedo pasar los préstamos que ya tengo?',
    a: 'Sí. Cargas cada préstamo en curso con su calendario original y los pagos que ya recibió, y desde ahí sigues cobrando en Cobradía.',
  },
  {
    q: '¿Qué pasa cuando termina la prueba?',
    a: `Durante ${TRIAL_DAYS} días usas todo sin pagar. Al terminar, tu cuenta queda en solo lectura hasta que actives tu suscripción: no pierdes ningún dato.`,
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Cada financiera tiene sus datos aislados de las demás. Todos los usuarios entran con verificación en dos pasos, cada rol ve solo lo que le toca y todo queda en la auditoría.',
  },
  {
    q: '¿Sirve para varias sucursales?',
    a: 'Sí. Manejas sucursales con su propia caja, sus horarios y sus usuarios, y ves la cartera completa o la de cada sucursal.',
  },
  {
    q: '¿Está hecho para República Dominicana?',
    a: 'Sí: pesos dominicanos, cédula y RNC validados, días feriados nacionales en los calendarios de pago y documentos en español.',
  },
]
