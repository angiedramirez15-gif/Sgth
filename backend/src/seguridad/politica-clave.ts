/** Reglas de las contraseñas (Fase de seguridad). */

// Claves y palabras muy usadas en Colombia y en la empresa; se comparan sin mayúsculas ni números al final
const COMUNES = [
  'password', 'contrasena', 'contraseña', 'clave', 'qwerty', 'qwertyuiop', 'asdfgh', 'abc123', 'abcdef', 'iloveyou',
  'admin', 'administrador', 'usuario', 'bienvenido', 'bienvenida', 'colombia', 'palmira', 'cali', 'valle', 'america',
  'deportivo', 'millonarios', 'nacional', 'drimduit', 'drim', 'duit', 'sgth', 'talentohumano', 'empresa', 'secreto',
  'teamo', 'tequiero', 'princesa', 'mariposa', 'dragon', 'monkey', 'football', 'futbol', 'superman', 'batman',
  'welcome', 'letmein', 'sunshine', 'master', 'changeme', 'cambiar', 'cambiame', 'temporal', 'nueva', 'nuevaclave',
];

export interface DatosClave {
  usuario: string;
  nombre: string;
  minimo: number;
}

/** Devuelve el primer problema de la clave, o null si cumple. */
export function problemaDeClave(clave: string, d: DatosClave): string | null {
  if (clave.length < d.minimo) return `La clave debe tener al menos ${d.minimo} caracteres`;
  if (clave.length > 72) return 'La clave no puede superar 72 caracteres';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) return 'La clave debe tener letras y números';
  if (/(.)\1{3,}/.test(clave)) return 'La clave no puede repetir el mismo carácter más de 3 veces seguidas';
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef)/i.test(clave)) return 'La clave no puede tener secuencias como 1234 o abcd';

  const base = normalizar(clave).replace(/[\d\W_]+/g, '');
  if (COMUNES.some((c) => base === normalizar(c))) return 'Esa clave es muy común. Use una frase o combinación más difícil de adivinar';

  const sinEspacios = normalizar(clave);
  const partes = [d.usuario, ...d.nombre.split(/\s+/)].map(normalizar).filter((p) => p.length >= 4);
  if (partes.some((p) => sinEspacios.includes(p))) return 'La clave no puede contener su usuario ni su nombre';
  return null;
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
