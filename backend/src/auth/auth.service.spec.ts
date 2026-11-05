import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';

/** Pruebas del inicio de sesión con una base de datos simulada. */
describe('AuthService', () => {
  const HASH_ADMIN = '$2b$10$iJ.r1KW/yiarwgJZiUqe3u9YEvVxG0aFWUBND09.ccld3kUMuoI2W'; // Sgth2026*
  let fila: Record<string, unknown>;
  let ejecutados: { sql: string; params: unknown[] }[];
  let auditados: string[];
  let servicio: AuthService;
  const jwt = new JwtService({ secret: 'x'.repeat(40), signOptions: { expiresIn: '1h' } });

  beforeEach(() => {
    fila = {
      id: 1, usuario: 'admin', clave_hash: HASH_ADMIN, nombre_completo: 'Administrador SGTH',
      cargo: 'Administrador del sistema', rol: 'ADMIN', debe_cambiar_clave: 1,
      intentos_fallidos: 0, activo: 1, bloqueado: 0, bloqueado_hasta: null,
    };
    ejecutados = [];
    auditados = [];
    const db = {
      uno: vi.fn(async () => fila),
      consultar: vi.fn(async () => [{ codigo: 'colaboradores.ver' }, { codigo: 'usuarios.gestionar' }]),
      ejecutar: vi.fn(async (sql: string, params: unknown[]) => {
        ejecutados.push({ sql, params });
        return { affectedRows: 1 };
      }),
    };
    const auditoria = { registrar: vi.fn(async (r: { accion: string }) => void auditados.push(r.accion)) };
    const config = { numero: vi.fn(async (_c: string, d: number) => d) };
    servicio = new AuthService(db as never, jwt, auditoria as never, config as never);
  });

  it('inicia sesión con la clave inicial del script 02 y exige cambiarla', async () => {
    const r = await servicio.login('admin', 'Sgth2026*');
    expect(r.usuario.cambiarClave).toBe(true);
    expect(r.usuario.permisos).toContain('usuarios.gestionar');
    expect(r.minutosInactividad).toBe(30);
    const datos = await jwt.verifyAsync(r.token);
    expect(datos.sub).toBe(1);
    expect(auditados).toEqual(['LOGIN']);
    expect(ejecutados[0].sql).toContain('ultimo_acceso = NOW()');
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

  it('cambia la clave y el nuevo token ya no exige cambio', async () => {
    const r = await servicio.cambiarClave(1, 'Sgth2026*', 'NuevaClave2026');
    expect(r.usuario.cambiarClave).toBe(false);
    const hash = ejecutados[0].params[0] as string;
    expect(await bcrypt.compare('NuevaClave2026', hash)).toBe(true);
    expect(ejecutados[0].sql).toContain('debe_cambiar_clave = 0');
  });

  it('no permite repetir la misma clave', async () => {
    await expect(servicio.cambiarClave(1, 'Sgth2026*', 'Sgth2026*')).rejects.toThrow(BadRequestException);
  });

  it('exige la clave actual correcta para cambiarla', async () => {
    await expect(servicio.cambiarClave(1, 'mala', 'NuevaClave2026')).rejects.toThrow('La clave actual no es correcta');
  });
});
