import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import nodemailer from 'nodemailer';

/**
 * Envío de correos de aviso. Lo usan el backend y el vigilante (scripts/vigilante.mjs), por eso no depende de NestJS.
 *
 * Dos formas, según CORREO_MODO en .env:
 *  - graph: Microsoft 365 por Microsoft Graph (registro de aplicación con permiso Mail.Send). Es la forma que
 *           Microsoft recomienda: el envío SMTP con clave queda desactivado en Microsoft 365 desde finales de 2026.
 *  - smtp:  cualquier otro proveedor (Gmail con clave de aplicación, correo de GoDaddy, etc.).
 */
export type ModoCorreo = 'graph' | 'smtp';
export interface Mensaje { para: string; asunto: string; texto: string }
type Entorno = Record<string, string | undefined>;

export function modoCorreo(env: Entorno = process.env): ModoCorreo | null {
  const modo = (env.CORREO_MODO ?? '').trim().toLowerCase();
  if (!env.CORREO_REMITENTE) return null;
  if (modo === 'graph' && env.GRAPH_TENANT_ID && env.GRAPH_CLIENT_ID && env.GRAPH_CLIENT_SECRET) return 'graph';
  if (modo === 'smtp' && env.SMTP_HOST) return 'smtp';
  return null;
}

export const remitente = (env: Entorno = process.env) => env.CORREO_REMITENTE ?? '';

let tokenGraph: { valor: string; vence: number } | null = null;

async function tokenMicrosoft(env: Entorno): Promise<string> {
  if (tokenGraph && tokenGraph.vence > Date.now() + 60_000) return tokenGraph.valor;
  const r = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.GRAPH_CLIENT_ID!,
      client_secret: env.GRAPH_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(`Microsoft no aceptó los datos de la aplicación (GRAPH_*): ${(j.error_description ?? r.statusText).split('\r\n')[0]}`);
  }
  tokenGraph = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenGraph.valor;
}

async function enviarGraph(m: Mensaje, env: Entorno) {
  const token = await tokenMicrosoft(env);
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remitente(env))}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: m.asunto,
        body: { contentType: 'Text', content: m.texto },
        toRecipients: m.para.split(/[,;]/).map((d) => ({ emailAddress: { address: d.trim() } })).filter((d) => d.emailAddress.address),
      },
      saveToSentItems: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status !== 202) {
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Microsoft 365 no envió el correo: ${j.error?.message ?? r.statusText}`);
  }
}

async function enviarSmtp(m: Mensaje, env: Entorno) {
  const puerto = Number(env.SMTP_PUERTO ?? 587);
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: env.SMTP_USUARIO ? { user: env.SMTP_USUARIO, pass: env.SMTP_CLAVE ?? '' } : undefined,
    connectionTimeout: 20_000,
  });
  try {
    await t.sendMail({ from: `SGTH <${remitente(env)}>`, to: m.para, subject: m.asunto, text: m.texto });
  } catch (e) {
    throw new Error(`El servidor de correo no envió el mensaje: ${(e as Error).message}`);
  }
}

/** Envía un correo. Lanza un error con un mensaje claro si no se pudo. */
export async function enviarCorreo(m: Mensaje, env: Entorno = process.env): Promise<void> {
  const modo = modoCorreo(env);
  if (!modo) throw new Error('El envío de correos no está configurado en el servidor (CORREO_MODO y datos en el archivo .env)');
  if (!m.para.trim()) throw new Error('No hay un correo de destino para los avisos');
  await (modo === 'graph' ? enviarGraph(m, env) : enviarSmtp(m, env));
}

// ---------------------------------------------------------------------
//  Registro de avisos enviados: evita mandar el mismo aviso muchas veces.
//  Se guarda en la carpeta de logs (avisos_correo.json), compartido con el vigilante.
// ---------------------------------------------------------------------

export function carpetaLogs(env: Entorno = process.env): string {
  if (env.LOGS_DIR) return env.LOGS_DIR;
  if (env.RESPALDO_ESTADO) return dirname(env.RESPALDO_ESTADO);
  return process.platform === 'win32' ? 'C:\\SGTH\\logs' : join(process.cwd(), 'logs');
}

interface Registro { destino?: string; enviados: Record<string, string> }

export function leerRegistro(env: Entorno = process.env): Registro {
  try {
    const r = JSON.parse(readFileSync(join(carpetaLogs(env), 'avisos_correo.json'), 'utf8')) as Registro;
    return { destino: r.destino, enviados: r.enviados ?? {} };
  } catch {
    return { enviados: {} };
  }
}

export function guardarRegistro(r: Registro, env: Entorno = process.env) {
  const carpeta = carpetaLogs(env);
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
  // Se borran los avisos de hace más de 30 días
  const limite = Date.now() - 30 * 86_400_000;
  r.enviados = Object.fromEntries(Object.entries(r.enviados).filter(([, f]) => new Date(f).getTime() > limite));
  writeFileSync(join(carpeta, 'avisos_correo.json'), JSON.stringify(r, null, 2));
}

/** true si el aviso con esta clave no se ha enviado en las últimas `horas`. */
export function tocaAvisar(clave: string, horas: number, ahora = new Date(), env: Entorno = process.env): boolean {
  const ultimo = leerRegistro(env).enviados[clave];
  return !ultimo || ahora.getTime() - new Date(ultimo).getTime() >= horas * 3_600_000;
}

export function marcarAviso(clave: string, ahora = new Date(), env: Entorno = process.env) {
  const r = leerRegistro(env);
  r.enviados[clave] = ahora.toISOString();
  guardarRegistro(r, env);
}

/** Texto común al final de cada aviso. */
export function pieAviso(urlSistema?: string) {
  return [
    '',
    '—',
    'Este es un aviso automático del SGTH (Sistema de Gestión de Talento Humano).',
    urlSistema ? `Sistema: ${urlSistema}` : '',
    'El destino de estos avisos se cambia en Administración › Configuración › Avisos por correo.',
  ].filter((l, i) => l || i < 2).join('\n');
}
