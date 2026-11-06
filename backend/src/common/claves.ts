import { randomInt } from 'node:crypto';

// Sin caracteres que se confunden al dictarlos o leerlos: 0/O, 1/l/I
const LETRAS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const NUMEROS = '23456789';

/**
 * Genera una clave temporal aleatoria de 10 caracteres con letras y números.
 * El usuario debe cambiarla en su primer ingreso.
 */
export function generarClaveTemporal(longitud = 10): string {
  const todos = LETRAS + NUMEROS;
  const caracteres = [
    LETRAS[randomInt(LETRAS.length)],
    NUMEROS[randomInt(NUMEROS.length)],
    ...Array.from({ length: longitud - 2 }, () => todos[randomInt(todos.length)]),
  ];
  // Mezclar para que la letra y el número no queden siempre al inicio
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}
