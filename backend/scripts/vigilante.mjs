// SGTH - Vigilante: revisa cada 15 minutos que el sistema responda y avisa por correo si se cae.
// Lo ejecuta la tarea programada "SGTH - Vigilante" (C:\SGTH\scripts\vigilante.cmd).
//   node scripts/vigilante.mjs           revisa una vez
//   node scripts/vigilante.mjs --probar  envía un correo de prueba desde el vigilante
// Avisa después de 2 revisiones seguidas sin respuesta (15 a 30 minutos) y otra vez cuando vuelve a funcionar.
// Si el equipo servidor está apagado no puede avisar: para eso está el aviso de respaldo atrasado.
import { request as http } from 'node:http';
import { request as https } from 'node:https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARPETA_BACKEND, cargarEnv } from './comun.mjs';

cargarEnv();
const rutaEnviador = join(CARPETA_BACKEND, 'dist', 'correo', 'enviador.js');
if (!existsSync(rutaEnviador)) {
  console.error(`${ahora()}  Falta compilar el backend (no existe ${rutaEnviador})`);
  process.exit(1);
}
const { carpetaLogs, enviarCorreo, leerRegistro, modoCorreo, pieAviso } = await import(pathToFileURL(rutaEnviador).href);

const FALLOS_PARA_AVISAR = 2;
const archivoEstado = join(carpetaLogs(), 'vigilante.json');

function ahora() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
}
function leerEstado() {
  try { return JSON.parse(readFileSync(archivoEstado, 'utf8')); } catch { return { fallos: 0, caidoDesde: null, avisado: false }; }
}
function guardarEstado(e) {
  if (!existsSync(carpetaLogs())) mkdirSync(carpetaLogs(), { recursive: true });
  writeFileSync(archivoEstado, JSON.stringify(e, null, 2));
}

/** Dirección local de /api/salud. Con HTTPS se revisa por https sin validar el nombre (es el mismo equipo). */
function urlSalud() {
  if (process.env.VIGILANTE_URL) return process.env.VIGILANTE_URL;
  const conHttps = !!(process.env.HTTPS_CERT || process.env.HTTPS_PFX);
  return `${conHttps ? 'https' : 'http'}://127.0.0.1:${process.env.PORT ?? (conHttps ? 443 : 3000)}/api/salud`;
}

/** { ok, motivo } */
function revisar(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const pedir = u.protocol === 'https:' ? https : http;
    const req = pedir(u, { method: 'GET', timeout: 15_000, rejectUnauthorized: false }, (res) => {
      let cuerpo = '';
      res.on('data', (d) => (cuerpo += d));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false, motivo: `respondió con el código ${res.statusCode}` });
        try {
          const j = JSON.parse(cuerpo);
          if (j.baseDatos !== 'ok') return resolve({ ok: false, motivo: 'el sistema responde, pero no tiene conexión con la base de datos (MariaDB)' });
          resolve({ ok: true });
        } catch {
          resolve({ ok: false, motivo: 'respondió algo que no se entiende' });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('no respondió en 15 segundos')));
    req.on('error', (e) => resolve({ ok: false, motivo: e.code === 'ECONNREFUSED' ? 'el programa no está corriendo' : e.message }));
    req.end();
  });
}

/** Correo de destino: el de Configuración; si la base no responde, el último conocido. */
async function destino() {
  try {
    const mysql = (await import('mysql2/promise')).default;
    const cx = await mysql.createConnection({
      host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectTimeout: 10_000,
    });
    const [filas] = await cx.query("SELECT valor FROM configuracion WHERE clave = 'avisos_correo_destino'");
    await cx.end();
    if (filas[0]?.valor) return filas[0].valor;
  } catch { /* se usa el último conocido */ }
  return leerRegistro().destino ?? '';
}

async function avisar(asunto, texto) {
  if (!modoCorreo()) { console.log(`${ahora()}  (sin correo configurado) ${asunto}`); return false; }
  const para = await destino();
  if (!para) { console.log(`${ahora()}  (sin destino de avisos en Configuración) ${asunto}`); return false; }
  try {
    await enviarCorreo({ para, asunto: `SGTH: ${asunto}`, texto: texto + '\n' + pieAviso() });
    console.log(`${ahora()}  Aviso enviado a ${para}: ${asunto}`);
    return true;
  } catch (e) {
    console.log(`${ahora()}  No se pudo enviar el aviso "${asunto}": ${e.message}`);
    return false;
  }
}

const minutos = (desde) => Math.round((Date.now() - new Date(desde).getTime()) / 60_000);
const hora = (f) => new Date(f).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });

if (process.argv.includes('--probar')) {
  const ok = await avisar('correo de prueba del vigilante', `Este es un correo de prueba del vigilante del SGTH, enviado desde el equipo ${hostname()}.\nSi lo recibe, los avisos de "sistema caído" funcionan.`);
  process.exit(ok ? 0 : 1);
}

const estado = leerEstado();
const r = await revisar(urlSalud());
if (r.ok) {
  if (estado.avisado) {
    await avisar('el sistema volvió a funcionar',
      `El SGTH volvió a responder a las ${hora(new Date())}.\nEstuvo sin servicio unos ${minutos(estado.caidoDesde)} minutos (desde ${hora(estado.caidoDesde)}).`);
  } else if (estado.fallos) {
    console.log(`${ahora()}  El sistema volvió a responder`);
  }
  guardarEstado({ fallos: 0, caidoDesde: null, avisado: false, ultimaRevision: new Date().toISOString() });
} else {
  const nuevo = { fallos: estado.fallos + 1, caidoDesde: estado.caidoDesde ?? new Date().toISOString(), avisado: estado.avisado, motivo: r.motivo, ultimaRevision: new Date().toISOString() };
  console.log(`${ahora()}  El sistema no responde (${nuevo.fallos}): ${r.motivo}`);
  if (nuevo.fallos >= FALLOS_PARA_AVISAR && !nuevo.avisado) {
    nuevo.avisado = await avisar('el sistema no responde',
      `El SGTH no responde desde las ${hora(nuevo.caidoDesde)} (revisado ${nuevo.fallos} veces).\nMotivo: ${r.motivo}.\n\n` +
      'Qué revisar en el equipo servidor:\n' +
      '  1. Que esté prendido y conectado a la red.\n' +
      '  2. Programador de tareas > SGTH > "SGTH - Sistema": debe estar "En ejecución". Si no, clic derecho > Ejecutar.\n' +
      '  3. Que el servicio MariaDB esté iniciado (services.msc).\n' +
      '  4. El detalle del error está en C:\\SGTH\\logs\\sgth.log.\n\n' +
      'Cuando vuelva a funcionar le llegará otro correo.');
  }
  guardarEstado(nuevo);
}
