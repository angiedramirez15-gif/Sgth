// Funciones compartidas por respaldo.mjs y restaurar.mjs (solo usan módulos de Node).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const CARPETA_BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Lee el .env del backend (sin sobrescribir variables ya definidas). */
export function cargarEnv(ruta = join(CARPETA_BACKEND, '.env')) {
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m || linea.trimStart().startsWith('#')) continue;
    let valor = m[2];
    if (/^".*"$|^'.*'$/.test(valor)) valor = valor.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

export function requerida(nombre) {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta ${nombre} en el archivo .env`);
  return v;
}

/** Carpeta bin de MariaDB: MARIADB_BIN o la instalación estándar de Windows. */
export function binMariadb(programa) {
  const exe = process.platform === 'win32' ? `${programa}.exe` : programa;
  if (process.env.MARIADB_BIN) return join(process.env.MARIADB_BIN, exe);
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      if (!existsSync(base)) continue;
      const carpetas = readdirSync(base).filter((d) => /^MariaDB/i.test(d)).sort().reverse();
      for (const c of carpetas) {
        const ruta = join(base, c, 'bin', exe);
        if (existsSync(ruta)) return ruta;
      }
    }
  }
  return exe; // en el PATH
}

// ---------------------------------------------------------------------
//  Cifrado AES-256-GCM:  SGTHR1 | sal(16) | iv(12) | datos cifrados | etiqueta(16)
// ---------------------------------------------------------------------
export const MAGIA = Buffer.from('SGTHR1');
export const EXTRA = MAGIA.length + 16 + 12 + 16; // bytes que agrega el cifrado

const cacheLlaves = new Map();
export function llave(clave, sal) {
  const k = `${sal.toString('hex')}`;
  if (!cacheLlaves.has(k)) cacheLlaves.set(k, scryptSync(clave, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
  return cacheLlaves.get(k);
}

/** Transformación que cifra todo lo que pasa por ella. Una sal por ejecución (la llave se calcula una vez). */
export function cifrador(clave, sal) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(clave, sal), iv);
  let encabezado = true;
  return new Transform({
    transform(trozo, _cod, listo) {
      const salida = c.update(trozo);
      if (encabezado) {
        encabezado = false;
        listo(null, Buffer.concat([MAGIA, sal, iv, salida]));
      } else listo(null, salida);
    },
    flush(listo) {
      const fin = c.final();
      const prefijo = encabezado ? Buffer.concat([MAGIA, sal, iv]) : Buffer.alloc(0);
      listo(null, Buffer.concat([prefijo, fin, c.getAuthTag()]));
    },
  });
}

/** Lee el encabezado y la etiqueta de un archivo cifrado y devuelve el descifrador y el rango de datos. */
export async function prepararDescifrado(ruta, clave) {
  const f = await open(ruta, 'r');
  try {
    const { size } = await f.stat();
    if (size < EXTRA) throw new Error(`${ruta}: archivo incompleto`);
    const cab = Buffer.alloc(MAGIA.length + 28);
    await f.read(cab, 0, cab.length, 0);
    if (!cab.subarray(0, MAGIA.length).equals(MAGIA)) throw new Error(`${ruta}: no es un respaldo del SGTH`);
    const sal = cab.subarray(MAGIA.length, MAGIA.length + 16);
    const iv = cab.subarray(MAGIA.length + 16);
    const etiqueta = Buffer.alloc(16);
    await f.read(etiqueta, 0, 16, size - 16);
    const d = createDecipheriv('aes-256-gcm', llave(clave, sal), iv);
    d.setAuthTag(etiqueta);
    return { descifrador: d, inicio: cab.length, fin: size - 17 };
  } finally {
    await f.close();
  }
}

export function ahoraColombia() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}${p.minute}` };
}
