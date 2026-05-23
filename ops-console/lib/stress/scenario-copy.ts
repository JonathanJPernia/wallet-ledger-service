export type ScenarioCopy = {
  title: string;
  subtitle: string;
  whatItTests: string;
  tip: string;
};

export const SCENARIO_COPY: Record<string, ScenarioCopy> = {
  'caso-a-withdraw-same-key': {
    title: 'Mismo retiro pedido muchas veces',
    subtitle: 'Varias peticiones a la vez con el mismo código de operación',
    whatItTests:
      'Si pides retirar $50 varias veces en paralelo con el mismo código, el sistema solo debe descontar una vez y devolver el mismo resultado.',
    tip: 'En producción usa pocas peticiones seguidas (8–10) para no chocar con el límite de velocidad del servidor.',
  },
  'caso-b-withdraw-distinct-keys': {
    title: 'Muchos retiros distintos a la vez',
    subtitle: 'Cada petición lleva su propio código único',
    whatItTests:
      'Simula mucha gente retirando al mismo tiempo. El saldo nunca debe quedar negativo ni duplicarse movimientos raros.',
    tip: 'Ideal con montos pequeños ($1) para no vaciar la billetera de prueba.',
  },
  'duplicate-100-20': {
    title: 'El caso clásico: $100 y dos retiros de $20',
    subtitle: 'Dos clics al mismo tiempo con el mismo código',
    whatItTests:
      'Con $100 en la cuenta, si intentas retirar $20 dos veces a la vez con el mismo código, solo debe aplicarse un retiro.',
    tip: 'Prueba rápida: solo 2 peticiones en paralelo.',
  },
  'transfer-same-key': {
    title: 'Misma transferencia repetida',
    subtitle: 'Enviar dinero entre dos billeteras con el mismo código',
    whatItTests:
      'Si envías $30 varias veces en paralelo con el mismo código, solo debe moverse el dinero una vez.',
    tip: 'Comprueba después que los saldos de ambas billeteras tienen sentido.',
  },
};

export function friendlyAssertion(line: string): string {
  if (line.startsWith('PASS: single withdrawId')) {
    return 'Solo hubo un retiro real (mismo comprobante en todas las respuestas exitosas).';
  }
  if (line.startsWith('FAIL:') && line.includes('withdrawId')) {
    return 'Hubo más de un retiro distinto: revisa la integridad.';
  }
  if (line.startsWith('PASS: consistent balanceAfter')) {
    return 'Todas las respuestas exitosas muestran el mismo saldo final.';
  }
  if (line.startsWith('FAIL: multiple balanceAfter')) {
    return 'Los saldos reportados no coinciden entre peticiones.';
  }
  if (line.startsWith('PASS: both 201')) {
    return 'Las dos peticiones respondieron correctamente.';
  }
  if (line.startsWith('PASS: same balanceAfter')) {
    return 'Mismo saldo en ambas respuestas: no hubo doble cobro.';
  }
  if (line.startsWith('PASS: single transferId')) {
    return 'Solo se registró una transferencia.';
  }
  if (line.startsWith('PASS: no unexpected status')) {
    return 'No hubo errores inesperados del servidor.';
  }
  if (line.includes('HTTP 201')) {
    return line.replace(
      /(\d+)\/(\d+) HTTP 201/,
      '$1 de $2 peticiones completaron con éxito',
    );
  }
  return line.replace(/^PASS: /, '').replace(/^FAIL: /, '').replace(/^WARN: /, '');
}
