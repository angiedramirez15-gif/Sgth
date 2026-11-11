import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService, type Sesion } from './auth.service.js';
import { cifrar, hashRespaldo } from '../seguridad/cifrado.js';
import { codigoParaPaso, pasoActual } from '../seguridad/totp.js';
import { problemaDeClave } from '../seguridad/politica-clave.js';

const SECRETO = 'x'.repeat(40);

/** Pruebas del inicio de sesión con una base de datos simulada. */
describe('AuthService', () => {
  const HASH_ADMIN = '$2b$10$iJ.r1KW/yiarwgJZiUqe3u9YEvVxG0aFWUBND09.ccld3kUMuoI2W'; // Sgth2026*
  let fila: Record<string, unknown>;
  let compromiso: Record<string, unknown> | null;
  let historial: { clave_hash: string }[];
  let permisos: { codigo: string }[];
  let ejecutados: { sql: string; params: unknown[] }[];
  let auditados: string[];
  let servicio: AuthService;
  const jwt = new JwtService({ secret: SECRETO, signOptions: { expiresIn: '1h' } });

  beforeEach(() => {
    fila = {
      id: 1, usuario: 'admin', clave_hash: HASH_ADMIN, nombre_completo: 'Administrador SGTH',
      cargo: 'Administrador del sistema', rol: 'ADMIN', debe_cambiar_clave: 1,
      intentos_fallidos: 0, activo: 1, bloqueado: 0, bloqueado_hasta: null, version_sesion: 3,
      clave_vencida: 0, totp_secreto: null, totp_activo: 0, totp_respaldo: null, totp_ultimo_paso: null,
    };
    compromiso = { id: 1, version: 1, texto: 'Me comprometo…', aceptado_en: '2026-11-11 10:00' };
    historial = [];
    permisos = [{ codigo: 'colaboradores.ver' }, { codigo: 'usuarios.gestionar' }];
    ejecutados = [];
    auditados = [];
    const db = {
      uno: vi.fn(async (sql: string) => (sql.includes('textos_legales') ? compromiso : fila)),
      consultar: vi.fn(async (sql: string) => (sql.includes('historial_claves') ? historial : permisos)),
      ejecutar: vi.fn(async (sql: string, params: unknown[]) => {
        ejecutados.push({ sql, params });
        return { affectedRows: 1 };
      }),
      transaccion: vi.fn(async (fn: (cx: unknown) => unknown) => fn(db)),
    };
    const auditoria = { registrar: vi.fn(async (r: { accion: string }) => void auditados.push(r.accion)) };
    const config = { numero: vi.fn(async (_c: string, d: number) => d) };
    const env = { getOrThrow: () => SECRETO };
    servicio = new AuthService(db as never, jwt, auditoria as never, config as never, env as never);
  });

  const token = async () => ({ ...(await jwt.verifyAsync(await (await servicio.login('admin', 'Sgth2026*')).token!)) });

  it('inicia sesión con la clave inicial del script 02 y exige cambiarla', async () => {
    const r = await servicio.login('admin', 'Sgth2026*');
    const s = r.respuesta as Sesion;
    expect(s.paso).toBe('LISTO');
    expect(s.usuario.cambiarClave).toBe(true);
    expect(s.usuario.motivoClave).toBe('TEMPORAL');
    expect(s.usuario.permisos).toContain('usuarios.gestionar');
    expect(s.minutosInactividad).toBe(30);
    expect(s.usuario).not.toHaveProperty('v');
    const datos = await jwt.verifyAsync(r.token!);
    expect(datos.sub).toBe(1);
    expect(datos.v).toBe(3);
    expect(datos.exp - datos.iat).toBe(30 * 60); // la sesión vence con la inactividad
    expect(auditados).toEqual(['LOGIN']);
    expect(ejecutados[0].sql).toContain('ultimo_acceso = NOW()');
  });

  it('pide cambiar la clave cuando venció, aunque no sea temporal', async () => {
    fila.debe_cambiar_clave = 0;
    fila.clave_vencida = 1;
    const s = (await servicio.login('admin', 'Sgth2026*')).respuesta as Sesion;
    expect(s.usuario.cambiarClave).toBe(true);
    expect(s.usuario.motivoClave).toBe('VENCIDA');
  });

  it('pide aceptar el compromiso si no ha aceptado la versión vigente', async () => {
    compromiso = { id: 2, version: 2, texto: 'Nuevo', aceptado_en: null };
    const s = (await servicio.login('admin', 'Sgth2026*')).respuesta as Sesion;
    expect(s.usuario.aceptarCompromiso).toBe(true);
  });

  it('rechaza una clave incorrecta y cuenta el intento', async () => {
    await expect(servicio.login('admin', 'otra')).rejects.toThrow(UnauthorizedException);
    expect(ejecutados[0].params).toEqual([1, 1]);
    expect(auditados).toEqual(['LOGIN_FALLIDO']);
  });

  it('bloquea al llegar al máximo de intentos', async () => {
    fila.intentos_fallidos = 4;
    await expect(servicio.login('admin', 'otra')).rejects.toThrow(/bloqueado 15 minutos/);
    expect(ejecutados[0].sql).toContain('INTERVAL 15 MINUTE');
  });

  it('no deja entrar a un usuario bloqueado aunque la clave sea correcta', async () => {
    fila.bloqueado = 1;
    fila.bloqueado_hasta = '2026-11-05 16:30:00';
    await expect(servicio.login('admin', 'Sgth2026*')).rejects.toThrow(/16:30/);
  });

  it('no deja entrar a un usuario inactivo', async () => {
    fila.activo = 0;
    await expect(servicio.login('admin', 'Sgth2026*')).rejects.toThrow('Usuario o clave incorrectos');
  });

  describe('doble verificación', () => {
    beforeEach(() => permisos.push({ codigo: 'colaboradores.ver_sensibles' }));

    it('quien ve datos sensibles debe configurarla: no recibe sesión con solo la clave', async () => {
      const r = await servicio.login('admin', 'Sgth2026*');
      expect(r.respuesta).toEqual({ paso: 'CONFIGURAR' });
      expect(r.token).toBeUndefined();
      expect(r.tokenPrevio).toBeDefined();
      expect(auditados).toEqual([]); // el ingreso no se completa hasta el código
    });

    it('configura, activa con el código de la app y entrega 8 códigos de respaldo', async () => {
      const { tokenPrevio } = await servicio.login('admin', 'Sgth2026*');
      const conf = await servicio.configurarVerificacion(tokenPrevio);
      expect(conf.qr).toMatch(/^data:image\/png;base64,/);
      const secreto = conf.secreto.replace(/\s/g, '');
      fila.totp_secreto = ejecutados.at(-1)!.params[0];
      const r = await servicio.activarVerificacion(tokenPrevio, codigoParaPaso(secreto, pasoActual()));
      const s = r.respuesta as Sesion;
      expect(s.paso).toBe('LISTO');
      expect(s.codigosRespaldo).toHaveLength(8);
      expect(r.token).toBeDefined();
    });

    it('con la verificación activa pide el código y acepta uno correcto una sola vez', async () => {
      fila.totp_activo = 1;
      fila.totp_secreto = cifrar('JBSWY3DPEHPK3PXP', SECRETO);
      const { tokenPrevio, respuesta } = await servicio.login('admin', 'Sgth2026*');
      expect(respuesta).toEqual({ paso: 'CODIGO' });
      const codigo = codigoParaPaso('JBSWY3DPEHPK3PXP', pasoActual());
      const ok = await servicio.verificarCodigo(tokenPrevio, codigo);
      expect((ok.respuesta as Sesion).paso).toBe('LISTO');
      fila.totp_ultimo_paso = pasoActual() + 1;
      await expect(servicio.verificarCodigo(tokenPrevio, codigo)).rejects.toThrow(/ya se usó/);
    });

    it('un código de respaldo sirve una sola vez', async () => {
      fila.totp_activo = 1;
      fila.totp_secreto = cifrar('JBSWY3DPEHPK3PXP', SECRETO);
      fila.totp_respaldo = JSON.stringify([hashRespaldo('ABCDE-FGHJK', SECRETO)]);
      const { tokenPrevio } = await servicio.login('admin', 'Sgth2026*');
      await servicio.verificarCodigo(tokenPrevio, 'abcde fghjk');
      expect(ejecutados.find((e) => e.sql.includes('totp_respaldo'))!.params[0]).toBe('[]');
    });

    it('rechaza el token previo si la sesión del usuario cambió', async () => {
      const { tokenPrevio } = await servicio.login('admin', 'Sgth2026*');
      fila.version_sesion = 4;
      await expect(servicio.configurarVerificacion(tokenPrevio)).rejects.toThrow(/usuario y clave/);
    });
  });

  describe('cambio de clave', () => {
    it('cambia la clave, guarda la anterior y cierra las otras sesiones', async () => {
      const t = await token();
      const r = await servicio.cambiarClave(t, 'Sgth2026*', 'Montaña-verde-47');
      expect(r.token).toBeDefined();
      expect(ejecutados.some((e) => e.sql.includes('INSERT INTO historial_claves'))).toBe(true);
      const upd = ejecutados.find((e) => e.sql.includes('clave_cambiada_en = NOW()'))!;
      expect(upd.sql).toContain('version_sesion = version_sesion + 1');
      expect(await bcrypt.compare('Montaña-verde-47', upd.params[0] as string)).toBe(true);
    });

    it('no permite repetir la clave actual ni las anteriores', async () => {
      const t = await token();
      await expect(servicio.cambiarClave(t, 'Sgth2026*', 'Sgth2026*')).rejects.toThrow(/al menos 12/);
      historial = [{ clave_hash: await bcrypt.hash('Montaña-verde-47', 4) }];
      await expect(servicio.cambiarClave(t, 'Sgth2026*', 'Montaña-verde-47')).rejects.toThrow(/últimas 5/);
    });

    it('exige la clave actual correcta', async () => {
      const t = await token();
      await expect(servicio.cambiarClave(t, 'mala', 'Montaña-verde-47')).rejects.toThrow('La clave actual no es correcta');
    });

    it('rechaza claves débiles', async () => {
      const t = await token();
      await expect(servicio.cambiarClave(t, 'Sgth2026*', 'Palmira20262026')).rejects.toThrow(BadRequestException);
    });
  });
});

describe('problemaDeClave', () => {
  const d = { usuario: 'jgomez', nombre: 'Juliana Gómez Ríos', minimo: 12 };
  it.each([
    ['corta1', /al menos 12/],
    ['soloLetrasLargas', /letras y números/],
    ['aaaa1234bbbbx', /repetir|secuencias/],
    ['Colombia2026!!', /muy común/],
    ['Juliana-2026xx', /usuario ni su nombre/],
    ['jgomez-2026-xyz', /usuario ni su nombre/],
    ['Gomez Rios 2026', /usuario ni su nombre/],
  ])('%s se rechaza', (clave, error) => expect(problemaDeClave(clave, d)).toMatch(error));

  it.each(['Montaña-verde-47', 'cafe con leche 83', 'Rio Cauca 9 sol'])('%s se acepta', (clave) => {
    expect(problemaDeClave(clave, d)).toBeNull();
  });
});
