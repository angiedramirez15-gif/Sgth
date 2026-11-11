import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Códigos de 6 dígitos que cambian cada 30 segundos (TOTP, RFC 6238),
 * compatibles con Google Authenticator, Microsoft Authenticator, Authy, etc.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASO_SEGUNDOS = 30;

export function base32(datos: Buffer): string {
  let bits = 0, valor = 0, salida = '';
  for (const b of datos) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function desdeBase32(texto: string): Buffer {
  const limpio = texto.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, valor = 0;
  const salida: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Secreto no válido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(salida);
}

/** Secreto nuevo de 160 bits en base32. */
export function nuevoSecreto(): string {
  return base32(randomBytes(20));
}

export function pasoActual(ahora = Date.now()): number {
  return Math.floor(ahora / 1000 / PASO_SEGUNDOS);
}

export function codigoParaPaso(secreto: string, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac('sha1', desdeBase32(secreto)).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const numero = (hmac.readUInt32BE(desplazamiento) & 0x7fffffff) % 1_000_000;
  return String(numero).padStart(6, '0');
}

/**
 * Verifica el código aceptando un paso de diferencia (±30 s) por relojes desfasados.
 * Devuelve el paso aceptado, o null. Un paso ya usado (ultimoPaso) no se acepta de nuevo.
 */
export function verificarCodigo(secreto: string, codigo: string, ultimoPaso: number | null, ahora = Date.now()): number | null {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;
  const actual = pasoActual(ahora);
  for (const paso of [actual - 1, actual, actual + 1]) {
    if (ultimoPaso != null && paso <= ultimoPaso) continue;
    const esperado = Buffer.from(codigoParaPaso(secreto, paso));
    if (timingSafeEqual(esperado, Buffer.from(limpio))) return paso;
  }
  return null;
}

/** Dirección que lee la app del celular desde el código QR. */
export function enlaceApp(secreto: string, cuenta: string, emisor = 'SGTH DRIM DUIT'): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=${PASO_SEGUNDOS}`;
}
