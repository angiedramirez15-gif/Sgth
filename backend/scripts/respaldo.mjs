#!/usr/bin/env node
// =====================================================================
//  SGTH - Respaldo diario cifrado (RNF-08)
//
//  1. Base de datos: mariadb-dump → gzip → AES-256-GCM
//     base-datos/sgth_AAAA-MM-DD_HHMM.sql.gz.sgth
//  2. Documentos: copia cifrada de cada archivo nuevo de la carpeta de archivos
//     archivos/<misma ruta>.sgth  (los archivos del SGTH nunca se modifican,
//     así que solo se copian los nuevos)
//  3. Verifica que el respaldo de la base se pueda descifrar y esté completo.
//  4. Conserva 30 días + el primero de cada mes durante 12 meses.
//  5. Escribe el resultado en C:\SGTH\logs\ultimo_respaldo.json (el SGTH avisa
//     al administrador si el último respaldo falló o tiene más de 2 días).
//
//  Uso:  node scripts/respaldo.mjs            (lee el .env del backend)
//  Lo ejecuta la tarea programada "SGTH - Respaldo diario".
// =====================================================================
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { ahoraColombia, binMariadb, cargarEnv, cifrador, EXTRA, prepararDescifrado, requerida } from './comun.mjs';

cargarEnv();
const inicio = Date.now();
const estadoRuta = process.env.RESPALDO_ESTADO || 'C:\\SGTH\\logs\\ultimo_respaldo.json';
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

function guardarEstado(e) {
  try {
    mkdirSync(dirname(estadoRuta), { recursive: true });
    writeFileSync(estadoRuta, JSON.stringify({ ...e, segundos: Math.round((Date.now() - inicio) / 1000) }, null, 2));
  } catch (err) {
    log(`No se pudo escribir el estado: ${err.message}`);
  }
}

async function respaldarBase(clave, sal, destinos, nombre) {
  const usuario = requerida('RESPALDO_DB_USUARIO');
  const opciones = join(tmpdir(), `sgth-dump-${randomBytes(6).toString('hex')}.cnf`);
  // La clave va en un archivo temporal (no en la línea de comandos, donde otros procesos la verían)
  writeFileSync(opciones, `[client]\nuser=${usuario}\npassword=${requerida('RESPALDO_DB_CLAVE')}\nhost=${process.env.DB_HOST || '127.0.0.1'}\nport=${process.env.DB_PORT || 3306}\n`, { mode: 0o600 });
  const tmp = join(destinos[0], `${nombre}.tmp`);
  try {
    const dump = spawn(binMariadb('mariadb-dump'), [
      `--defaults-extra-file=${opciones}`, '--single-transaction', '--routines', '--triggers', '--events',
      '--hex-blob', '--default-character-set=utf8mb4', '--skip-dump-date', process.env.DB_NAME || 'sgth',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errores = '';
    dump.stderr.on('data', (d) => (errores += d));
    const terminado = new Promise((ok) => dump.on('close', ok));
    await pipeline(dump.stdout, createGzip({ level: 6 }), cifrador(clave, sal), createWriteStream(tmp));
    const codigo = await terminado;
    if (codigo !== 0) throw new Error(`mariadb-dump terminó con error ${codigo}: ${errores.trim()}`);
  } finally {
    rmSync(opciones, { force: true });
  }
  // Verificación: se descifra todo y el volcado debe terminar en "-- Dump completed"
  const { descifrador, inicio: ini, fin } = await prepararDescifrado(tmp, clave);
  let cola = '';
  await pipeline(createReadStream(tmp, { start: ini, end: fin }), descifrador, createGunzip(), async (fuente) => {
    for await (const t of fuente) cola = (cola + t.toString('utf8')).slice(-200);
  });
  if (!/-- Dump completed/.test(cola)) throw new Error('El respaldo de la base quedó incompleto');
  const final = join(destinos[0], nombre);
  renameSync(tmp, final);
  for (const otro of destinos.slice(1)) {
    mkdirSync(otro, { recursive: true });
    await pipeline(createReadStream(final), createWriteStream(join(otro, `${nombre}.tmp`)));
    renameSync(join(otro, `${nombre}.tmp`), join(otro, nombre));
  }
  return statSync(final).size;
}

function* recorrer(carpeta) {
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) yield* recorrer(ruta);
    else if (e.isFile()) yield ruta;
  }
}

async function respaldarArchivos(clave, sal, origen, destino) {
  if (!existsSync(origen)) return { nuevos: 0, total: 0, aviso: `No existe la carpeta de archivos ${origen}` };
  let nuevos = 0, total = 0, bytes = 0;
  for (const ruta of recorrer(origen)) {
    total++;
    const rel = relative(origen, ruta);
    const dest = join(destino, `${rel}.sgth`);
    const tamano = statSync(ruta).size;
    if (existsSync(dest) && statSync(dest).size === tamano + EXTRA) continue;
    mkdirSync(dirname(dest), { recursive: true });
    await pipeline(createReadStream(ruta), cifrador(clave, sal), createWriteStream(`${dest}.tmp`));
    renameSync(`${dest}.tmp`, dest);
    nuevos++;
    bytes += tamano;
  }
  return { nuevos, total, mb: Math.round((bytes / 1048576) * 10) / 10 };
}

/** Conserva los últimos `dias` días y el primer respaldo de cada mes durante `meses` meses. */
function depurar(carpeta, dias, meses) {
  if (!existsSync(carpeta)) return 0;
  const archivos = readdirSync(carpeta).filter((f) => /^sgth_\d{4}-\d{2}-\d{2}_\d{4}\.sql\.gz\.sgth$/.test(f)).sort();
  const hoy = new Date(`${ahoraColombia().fecha}T00:00:00`);
  const primerosDelMes = new Set();
  const vistos = new Set();
  for (const f of archivos) {
    const mes = f.slice(5, 12);
    if (!vistos.has(mes)) { vistos.add(mes); primerosDelMes.add(f); }
  }
  let borrados = 0;
  for (const f of archivos) {
    const edad = (hoy - new Date(`${f.slice(5, 15)}T00:00:00`)) / 86400000;
    const conservar = edad <= dias || (primerosDelMes.has(f) && edad <= meses * 31);
    if (!conservar) { rmSync(join(carpeta, f)); borrados++; }
  }
  return borrados;
}

try {
  const clave = requerida('RESPALDO_CLAVE');
  if (clave.length < 16) throw new Error('RESPALDO_CLAVE debe tener al menos 16 caracteres');
  const destino = requerida('RESPALDO_DESTINO');
  const local = process.env.RESPALDO_LOCAL || 'C:\\SGTH\\respaldos';
  const archivosOrigen = process.env.ARCHIVOS_DIR || process.env.RESPALDO_ARCHIVOS || 'C:\\SGTH\\archivos';
  for (const c of [join(destino, 'base-datos'), join(local, 'base-datos')]) mkdirSync(c, { recursive: true });
  const sal = randomBytes(16);
  const { fecha, hora } = ahoraColombia();
  const nombre = `sgth_${fecha}_${hora}.sql.gz.sgth`;

  log(`Respaldo de la base ${process.env.DB_NAME || 'sgth'}…`);
  const bytesBase = await respaldarBase(clave, sal, [join(local, 'base-datos'), join(destino, 'base-datos')], nombre);
  log(`Base de datos: ${nombre} (${Math.round(bytesBase / 1024)} KB), verificado`);

  log(`Documentos de ${archivosOrigen}…`);
  const archivos = await respaldarArchivos(clave, sal, archivosOrigen, join(destino, 'archivos'));
  log(`Documentos: ${archivos.nuevos} nuevos de ${archivos.total}`);

  const borrados = depurar(join(destino, 'base-datos'), 30, 12) + depurar(join(local, 'base-datos'), 7, 0);
  if (borrados) log(`Respaldos antiguos borrados: ${borrados}`);

  // Archivo de prueba para comprobar la clave sin restaurar todo
  writeFileSync(join(destino, 'LEAME.txt'),
    'Respaldos cifrados del SGTH de DRIM DUIT S.A.S.\r\n' +
    'Se restauran con: node scripts\\restaurar.mjs (ver despliegue\\GUIA_PUESTA_EN_MARCHA.md)\r\n' +
    'Sin la clave de respaldo (RESPALDO_CLAVE) no se pueden abrir.\r\n');

  guardarEstado({ ok: true, fecha: new Date().toISOString(), base: { archivo: nombre, kb: Math.round(bytesBase / 1024) }, archivos });
  log('Respaldo terminado');
} catch (err) {
  log(`ERROR: ${err.message}`);
  guardarEstado({ ok: false, fecha: new Date().toISOString(), error: err.message });
  process.exitCode = 1;
}
