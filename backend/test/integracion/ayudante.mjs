// Ayudante de las pruebas de integración: lee el .env, prepara usuarios de prueba y habla con la API.
// Solo funciona contra una base de PRUEBAS (nunca contra la base "sgth" de producción).
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const aqui = dirname(fileURLToPath(import.meta.url));
const archivoEnv = process.env.SGTH_ENV ?? resolve(aqui, '../../.env');
if (!existsSync(archivoEnv)) salir(`No encuentro el archivo .env (${archivoEnv}).`);
const env = Object.fromEntries(
  readFileSync(archivoEnv, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\s*[A-Z_][A-Z0-9_]*\s*=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

function salir(mensaje) {
  console.error(`\n✘ ${mensaje}\n`);
  process.exit(2);
}

// --- Protección: nunca contra producción ---
if (!env.DB_NAME) salir('El .env no tiene DB_NAME.');
if (env.DB_NAME === 'sgth' || env.NODE_ENV === 'production') {
  salir(`Las pruebas crean y modifican datos: solo se ejecutan contra la base de pruebas (sgth_pruebas).
  Este .env apunta a "${env.DB_NAME}"${env.NODE_ENV === 'production' ? ' en producción' : ''}. No se hizo ningún cambio.`);
}

export const BASE_URL = (process.env.SGTH_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, '');
export const B = BASE_URL + '/api';
export const ETIQUETA = 'PRB' + Date.now().toString(36).toUpperCase();
export const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Conexión directa a la base de pruebas (solo para preparar los usuarios de prueba) ---
export const db = await mysql.createConnection({
  host: env.DB_HOST ?? '127.0.0.1', port: Number(env.DB_PORT ?? 3306),
  user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: 'utf8mb4',
}).catch((e) => salir(`No se pudo conectar a MariaDB (${env.DB_NAME}): ${e.message}`));
export const valor = async (sql, p = []) => { const [f] = await db.query(sql, p); return f[0] ? Object.values(f[0])[0] : null; };

try {
  const r = await fetch(B + '/salud');
  const j = await r.json();
  if (j.baseDatos !== 'ok') salir('El backend responde pero no tiene conexión con la base de datos.');
} catch {
  salir(`El backend no responde en ${BASE_URL}. Inícielo con "npm run start:dev" en otra ventana.`);
}

// --- TOTP (doble verificación) ---
const A32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(t) { let bits = 0, v = 0; const o = []; for (const c of t.replace(/\s/g, '')) { v = (v << 5) | A32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); }
export function totp(secreto, desfase = 0) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + desfase));
  const h = createHmac('sha1', b32(secreto)).update(c).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
/** Espera a que empiece un intervalo de 30 s nuevo (un código TOTP no se puede usar dos veces). */
export const esperarCodigoNuevo = () => esperar(30500 - (Date.now() % 30000));

// --- HTTP ---
async function pedir(url, op) {
  let r = await fetch(url, op);
  if (r.status === 429) { // límite de ingresos por minuto
    console.log('   (límite de ingresos por minuto: esperando 61 s)');
    await esperar(61000);
    r = await fetch(url, op);
  }
  return r;
}
export const galleta = (r, nombre) => (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(nombre + '='));
const valorGalleta = (r, nombre) => galleta(r, nombre)?.split(';')[0].slice(nombre.length + 1);

/** Llama a la API. token: Bearer; extra: cabeceras adicionales. Devuelve { s, j, r }. */
export async function api(metodo, ruta, cuerpo, token, extra = {}) {
  const esForm = cuerpo instanceof FormData;
  const r = await pedir(B + ruta, {
    method: metodo,
    headers: { ...(esForm || !cuerpo ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra },
    body: esForm ? cuerpo : cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, j, r };
}
/** Descarga un archivo. Devuelve { s, b (Buffer), tipo }. */
export async function descargar(ruta, token, metodo = 'GET', cuerpo) {
  const r = await pedir(B + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { s: r.status, b: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') ?? '' };
}
export const esPdf = (b) => b.subarray(0, 4).toString() === '%PDF';
export const esExcel = (b) => b.subarray(0, 2).toString() === 'PK';
export const pdfPrueba = () => new Blob([Buffer.from('%PDF-1.4\n%prueba automática\n')], { type: 'application/pdf' });

// --- Usuarios de prueba ---
export const CLAVE = 'Guadual del Cauca 74';
export const USUARIOS = { admin: 'auto.admin', th: 'auto.th', sst: 'auto.sst' };
const ROLES = { admin: 'ADMIN', th: 'TH', sst: 'SST' };
const secretos = {};

/** Deja el usuario de prueba activo, con clave conocida y sin doble verificación configurada. */
async function prepararUsuario(clave) {
  const usuario = USUARIOS[clave];
  const rolId = await valor('SELECT id FROM roles WHERE codigo = ?', [ROLES[clave]]);
  if (!rolId) salir(`No existe el rol ${ROLES[clave]} en la base de pruebas.`);
  const hash = await bcrypt.hash(CLAVE, 10);
  await db.query(
    `INSERT INTO usuarios (usuario, clave_hash, nombre_completo, cargo, rol_id, debe_cambiar_clave, clave_cambiada_en)
     VALUES (?, ?, ?, 'Prueba automática', ?, 0, NOW())
     ON DUPLICATE KEY UPDATE clave_hash = VALUES(clave_hash), rol_id = VALUES(rol_id), debe_cambiar_clave = 0,
       clave_cambiada_en = NOW(), intentos_fallidos = 0, bloqueado_hasta = NULL, activo = 1,
       totp_activo = 0, totp_secreto = NULL, totp_respaldo = NULL, totp_ultimo_paso = NULL,
       version_sesion = version_sesion + 1`,
    [usuario, hash, `Usuario de prueba automática (${ROLES[clave]})`, rolId],
  );
}

/** Ingresa (clave → doble verificación si aplica → compromiso) y devuelve el token. */
export async function ingresar(clave) {
  const usuario = USUARIOS[clave];
  let r = await pedir(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, clave: CLAVE }) });
  let j = await r.json();
  if (r.status !== 200) throw new Error(`Ingreso de ${usuario}: ${j.message}`);
  if (j.paso !== 'LISTO') {
    const h = { 'Content-Type': 'application/json', Cookie: 'sgth_previa=' + valorGalleta(r, 'sgth_previa') };
    if (j.paso === 'CONFIGURAR') {
      const conf = await (await pedir(B + '/auth/verificacion/configurar', { method: 'POST', headers: h })).json();
      secretos[clave] = conf.secreto;
      r = await pedir(B + '/auth/verificacion/activar', { method: 'POST', headers: h, body: JSON.stringify({ codigo: totp(conf.secreto) }) });
    } else {
      await esperarCodigoNuevo();
      r = await pedir(B + '/auth/verificacion/codigo', { method: 'POST', headers: h, body: JSON.stringify({ codigo: totp(secretos[clave]) }) });
    }
    j = await r.json();
    if (r.status !== 200) throw new Error(`Doble verificación de ${usuario}: ${j.message}`);
  }
  let token = valorGalleta(r, 'sgth_sesion');
  if (j.usuario.aceptarCompromiso) {
    const c = await api('GET', '/auth/compromiso', null, token);
    r = (await api('POST', '/auth/compromiso', { textoId: c.j.id }, token)).r;
    token = valorGalleta(r, 'sgth_sesion');
  }
  return token;
}
export const secretoDe = (clave) => secretos[clave];
export const tokenDe = (r) => valorGalleta(r, 'sgth_sesion');

for (const c of Object.keys(USUARIOS)) await prepararUsuario(c);
/** Tokens de los tres usuarios de prueba (se ingresa una sola vez por ejecución). */
export const T = { admin: await ingresar('admin'), th: await ingresar('th'), sst: await ingresar('sst') };

/** Al terminar: inactiva los usuarios de prueba y cierra la conexión. */
export async function terminar() {
  await db.query('UPDATE usuarios SET activo = 0, version_sesion = version_sesion + 1 WHERE usuario IN (?)', [Object.values(USUARIOS)]);
  await db.end();
}
