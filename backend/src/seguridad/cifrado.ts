import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomInt } from 'node:crypto';

/**
 * Cifra datos que se guardan en la base (secreto de la doble verificación) con AES-256-GCM.
 * La llave sale de JWT_SECRETO del .env: si se cambia JWT_SECRETO, los usuarios
 * deben volver a activar la doble verificación.
 */
function llave(secretoBase: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secretoBase, 'sgth', 'cifrado-datos-v1', 32));
}

export function cifrar(texto: string, secretoBase: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(secretoBase), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
}

export function descifrar(guardado: string, secretoBase: string): string {
  const [version, iv, etiqueta, datos] = guardado.split(':');
  if (version !== 'v1') throw new Error('Formato de cifrado desconocido');
  const d = createDecipheriv('aes-256-gcm', llave(secretoBase), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(etiqueta, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}

// Códigos de respaldo: 10 caracteres fáciles de dictar (sin 0/O, 1/I/L)
const CARACTERES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function nuevosCodigosRespaldo(cantidad = 8): string[] {
  return Array.from({ length: cantidad }, () => {
    const c = Array.from({ length: 10 }, () => CARACTERES[randomInt(CARACTERES.length)]).join('');
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

export function hashRespaldo(codigo: string, secretoBase: string): string {
  return createHash('sha256').update(`${secretoBase}|${codigo.replace(/[\s-]/g, '').toUpperCase()}`).digest('hex');
}
