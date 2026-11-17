#!/usr/bin/env node
// =====================================================================
//  SGTH - Restaurar un respaldo cifrado
//
//  Descifrar la base de datos a un archivo .sql (para abrirlo en HeidiSQL):
//    node scripts/restaurar.mjs base --origen "C:\...\SGTH-Respaldos" --salida C:\SGTH\restaurado.sql
//    (por defecto toma el respaldo más reciente; --fecha 2026-11-20 elige otro día)
//
//  Descifrar e importar directamente en una base (pide la clave de root):
//    node scripts/restaurar.mjs base --origen "..." --importar sgth_pruebas
//    Para importar en la base en uso (sgth) hay que agregar --confirmar-produccion
//
//  Descifrar los documentos a una carpeta:
//    node scripts/restaurar.mjs archivos --origen "..." --destino C:\SGTH\archivos
//    (no sobrescribe los que ya existen)
//
//  Comprobar que la clave abre los respaldos (sin restaurar nada):
//    node scripts/restaurar.mjs probar --origen "..."
//
//  La clave se toma de RESPALDO_CLAVE del .env; si no está, se pide.
// =====================================================================
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { binMariadb, cargarEnv, prepararDescifrado } from './comun.mjs';

cargarEnv();
const [accion, ...resto] = process.argv.slice(2);
const args = {};
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) {
    const k = resto[i].slice(2);
    args[k] = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true;
  }
}
const salir = (m) => { console.error(`ERROR: ${m}`); process.exit(1); };

async function pedirClave() {
  if (process.env.RESPALDO_CLAVE) return process.env.RESPALDO_CLAVE;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const c = await rl.question('Clave de respaldo: ');
  rl.close();
  return c;
}

function elegirRespaldo(origen) {
  const carpeta = join(origen, 'base-datos');
  if (!existsSync(carpeta)) salir(`No existe ${carpeta}`);
  const lista = readdirSync(carpeta).filter((f) => /^sgth_.*\.sql\.gz\.sgth$/.test(f)).sort();
  if (!lista.length) salir('No hay respaldos de la base de datos en esa carpeta');
  const elegido = args.archivo ?? (args.fecha ? lista.filter((f) => f.includes(`_${args.fecha}_`)).at(-1) : lista.at(-1));
  if (!elegido) salir(`No hay respaldo del ${args.fecha}. Disponibles: ${lista.slice(-10).join(', ')}`);
  return join(carpeta, elegido);
}

async function descifrarBase(ruta, clave, salida) {
  const { descifrador, inicio, fin } = await prepararDescifrado(ruta, clave);
  const tmp = `${salida}.tmp`;
  try {
    await pipeline(createReadStream(ruta, { start: inicio, end: fin }), descifrador, createGunzip(), createWriteStream(tmp));
  } catch (e) {
    throw new Error(/auth|authenticate/i.test(e.message) ? 'La clave no es correcta o el archivo está dañado' : e.message);
  }
  renameSync(tmp, salida);
}

function* recorrer(carpeta) {
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const r = join(carpeta, e.name);
    if (e.isDirectory()) yield* recorrer(r);
    else if (e.isFile() && e.name.endsWith('.sgth')) yield r;
  }
}

try {
  if (!['base', 'archivos', 'probar'].includes(accion)) {
    console.log('Uso: node scripts/restaurar.mjs base|archivos|probar --origen <carpeta de respaldos> [opciones]');
    console.log('Vea las instrucciones al comienzo de este archivo.');
    process.exit(accion ? 1 : 0);
  }
  const origen = args.origen ?? process.env.RESPALDO_DESTINO;
  if (!origen) salir('Indique --origen con la carpeta de respaldos');
  const clave = await pedirClave();

  if (accion === 'probar') {
    const ruta = elegirRespaldo(origen);
    const salida = join(tmpdir(), 'sgth-prueba-restauracion.sql');
    await descifrarBase(ruta, clave, salida);
    console.log(`La clave es correcta. ${ruta.split(/[\\/]/).pop()} se descifró bien (${Math.round(statSync(salida).size / 1024)} KB de SQL).`);
  }

  if (accion === 'base') {
    const ruta = elegirRespaldo(origen);
    console.log(`Respaldo: ${ruta}`);
    const salida = args.salida ?? join(tmpdir(), `sgth-restaurado-${Date.now()}.sql`);
    await descifrarBase(ruta, clave, salida);
    console.log(`Descifrado en: ${salida}`);
    if (args.importar) {
      const base = String(args.importar);
      if (!/^[A-Za-z0-9_]+$/.test(base)) salir('Nombre de base no válido');
      if (base === 'sgth' && !args['confirmar-produccion']) {
        salir('Para reemplazar los datos de la base en uso (sgth) agregue --confirmar-produccion. Haga antes un respaldo.');
      }
      console.log(`Importando en la base ${base} (se pedirá la clave del usuario root de MariaDB)…`);
      const cliente = spawn(binMariadb('mariadb'), [
        '-u', args.usuario ?? 'root', '-p', '--default-character-set=utf8mb4',
        '-e', `CREATE DATABASE IF NOT EXISTS \`${base}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${base}\`; SOURCE ${salida.replace(/\\/g, '/')};`,
      ], { stdio: 'inherit' });
      const codigo = await new Promise((ok) => cliente.on('close', ok));
      if (codigo !== 0) salir(`La importación terminó con error ${codigo}`);
      console.log(`Base ${base} restaurada.`);
    }
  }

  if (accion === 'archivos') {
    const destino = args.destino;
    if (!destino) salir('Indique --destino con la carpeta donde quedarán los documentos');
    const carpeta = join(origen, 'archivos');
    if (!existsSync(carpeta)) salir(`No existe ${carpeta}`);
    let restaurados = 0, existentes = 0;
    for (const r of recorrer(carpeta)) {
      const dest = join(destino, relative(carpeta, r).replace(/\.sgth$/, ''));
      if (existsSync(dest)) { existentes++; continue; }
      mkdirSync(dirname(dest), { recursive: true });
      const { descifrador, inicio, fin } = await prepararDescifrado(r, clave);
      await pipeline(fin >= inicio ? createReadStream(r, { start: inicio, end: fin }) : [Buffer.alloc(0)], descifrador, createWriteStream(`${dest}.tmp`));
      renameSync(`${dest}.tmp`, dest);
      restaurados++;
    }
    console.log(`Documentos restaurados: ${restaurados}. Ya existían (no se tocaron): ${existentes}.`);
  }
} catch (e) {
  salir(/auth|authenticate/i.test(e.message) ? 'La clave no es correcta o el archivo está dañado' : e.message);
}
