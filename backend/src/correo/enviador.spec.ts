import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarCorreo, leerRegistro, marcarAviso, modoCorreo, tocaAvisar } from './enviador.js';

const graph = { CORREO_MODO: 'graph', CORREO_REMITENTE: 'sgth@empresa.com', GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's' };

describe('modoCorreo', () => {
  it('exige el remitente y los datos completos del modo', () => {
    expect(modoCorreo({})).toBeNull();
    expect(modoCorreo({ ...graph, CORREO_REMITENTE: '' })).toBeNull();
    expect(modoCorreo({ ...graph, GRAPH_CLIENT_SECRET: '' })).toBeNull();
    expect(modoCorreo(graph)).toBe('graph');
    expect(modoCorreo({ CORREO_MODO: 'SMTP', CORREO_REMITENTE: 'a@b.co', SMTP_HOST: 'smtp.x' })).toBe('smtp');
  });
});

describe('registro de avisos', () => {
  const env = { LOGS_DIR: mkdtempSync(join(tmpdir(), 'sgth-avisos-')) };

  it('no repite un aviso antes de su intervalo', () => {
    const t0 = new Date('2026-11-17T10:00:00Z');
    expect(tocaAvisar('servidor:respaldo', 24, t0, env)).toBe(true);
    marcarAviso('servidor:respaldo', t0, env);
    expect(tocaAvisar('servidor:respaldo', 24, new Date('2026-11-18T09:00:00Z'), env)).toBe(false);
    expect(tocaAvisar('servidor:respaldo', 24, new Date('2026-11-18T10:00:00Z'), env)).toBe(true);
    expect(tocaAvisar('otro', 24, t0, env)).toBe(true);
  });

  it('borra los registros de hace más de 30 días', () => {
    marcarAviso('viejo', new Date(Date.now() - 40 * 86_400_000), env);
    marcarAviso('nuevo', new Date(), env);
    expect(Object.keys(leerRegistro(env).enviados)).toContain('nuevo');
    expect(Object.keys(leerRegistro(env).enviados)).not.toContain('viejo');
  });
});

describe('envío por Microsoft Graph', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pide el token de la aplicación y envía a cada destinatario', async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      if (url.includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'TOKEN', expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: 202 });
    }));
    await enviarCorreo({ para: 'a@empresa.com; b@empresa.com', asunto: 'Prueba', texto: 'Hola' }, graph);
    expect(llamadas[0].url).toBe('https://login.microsoftonline.com/t/oauth2/v2.0/token');
    expect(String(llamadas[0].init.body)).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default');
    expect(llamadas[1].url).toBe('https://graph.microsoft.com/v1.0/users/sgth%40empresa.com/sendMail');
    expect((llamadas[1].init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    const cuerpo = JSON.parse(String(llamadas[1].init.body));
    expect(cuerpo.message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address)).toEqual(['a@empresa.com', 'b@empresa.com']);
    expect(cuerpo.saveToSentItems).toBe(false);
  });

  it('explica el error si Microsoft rechaza el envío', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/oauth2/')
        ? new Response(JSON.stringify({ access_token: 'TOKEN2', expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'Access is denied.' } }), { status: 403 }),
    ));
    await expect(enviarCorreo({ para: 'a@empresa.com', asunto: 'x', texto: 'y' }, graph)).rejects.toThrow(/Microsoft 365 no envió el correo: Access is denied/);
  });

  it('sin configuración no intenta enviar', async () => {
    await expect(enviarCorreo({ para: 'a@b.co', asunto: 'x', texto: 'y' }, {})).rejects.toThrow(/no está configurado/);
  });
});
