import { BadRequestException, ConflictException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { generarClaveTemporal } from '../common/claves.js';
import type { UsuarioToken } from '../common/tipos.js';
import { UsuariosService } from './usuarios.service.js';

const actor: UsuarioToken = { sub: 1, usuario: 'admin', nombre: 'Admin', cargo: 'Admin', rol: 'ADMIN', permisos: [], cambiarClave: false };

/** Base de datos simulada: responde según el texto de la consulta. */
function crearDb(opciones: { usuario?: Record<string, unknown>; otrosAdmins?: number; duplicado?: boolean }) {
  const ejecutados: { sql: string; params: unknown[] }[] = [];
  const usuario = { id: 2, usuario: 'maria', nombreCompleto: 'María', cargo: 'Analista', correo: null, rol: 'ADMIN', rolNombre: 'Administrador', activo: 1, debeCambiarClave: 0, bloqueado: 0, ...opciones.usuario };
  const cx = {
    uno: vi.fn(async (sql: string) => {
      if (sql.includes('FROM roles WHERE codigo')) return { id: 3 };
      if (sql.includes('COUNT(*)')) return { total: opciones.otrosAdmins ?? 0 };
      return usuario;
    }),
    consultar: vi.fn(async () => [usuario]),
    ejecutar: vi.fn(async (sql: string, params: unknown[]) => {
      if (opciones.duplicado && sql.startsWith('INSERT')) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      ejecutados.push({ sql, params });
      return { insertId: 2, affectedRows: 1 };
    }),
  };
  const db = { ...cx, transaccion: vi.fn(async (fn: (c: typeof cx) => unknown) => fn(cx)) };
  return { db, ejecutados };
}

const auditoria = { registrar: vi.fn(async () => undefined) };

describe('generarClaveTemporal', () => {
  it('genera 10 caracteres con letras y números, sin caracteres confusos', () => {
    for (let i = 0; i < 200; i++) {
      const c = generarClaveTemporal();
      expect(c).toHaveLength(10);
      expect(c).toMatch(/[A-Za-z]/);
      expect(c).toMatch(/\d/);
      expect(c).not.toMatch(/[0O1lI]/);
    }
  });

  it('no repite claves', () => {
    const claves = new Set(Array.from({ length: 500 }, () => generarClaveTemporal()));
    expect(claves.size).toBe(500);
  });
});

describe('UsuariosService', () => {
  it('crea el usuario con una clave temporal que funciona y exige cambiarla', async () => {
    const { db, ejecutados } = crearDb({});
    const s = new UsuariosService(db as never, auditoria as never);
    const r = await s.crear({ usuario: 'maria', nombreCompleto: 'María', cargo: 'Analista', rol: 'TH' }, actor);
    const [insert] = ejecutados;
    expect(insert.sql).toContain('debe_cambiar_clave');
    expect(await bcrypt.compare(r.claveTemporal, insert.params[1] as string)).toBe(true);
    expect(insert.params[6]).toBe(actor.sub); // creado_por
  });

  it('avisa si el nombre de usuario ya existe', async () => {
    const { db } = crearDb({ duplicado: true });
    const s = new UsuariosService(db as never, auditoria as never);
    await expect(s.crear({ usuario: 'maria', nombreCompleto: 'María', cargo: 'X', rol: 'TH' }, actor)).rejects.toThrow(ConflictException);
  });

  it('no permite inactivar el propio usuario', async () => {
    const { db } = crearDb({ usuario: { id: 1 } });
    const s = new UsuariosService(db as never, auditoria as never);
    await expect(s.cambiarEstado(1, false, actor)).rejects.toThrow('No puede inactivar su propio usuario');
  });

  it('no permite inactivar al último administrador activo', async () => {
    const { db } = crearDb({ otrosAdmins: 0 });
    const s = new UsuariosService(db as never, auditoria as never);
    await expect(s.cambiarEstado(2, false, actor)).rejects.toThrow('al menos un administrador');
  });

  it('sí permite inactivar un administrador si queda otro', async () => {
    const { db, ejecutados } = crearDb({ otrosAdmins: 1 });
    const s = new UsuariosService(db as never, auditoria as never);
    await s.cambiarEstado(2, false, actor);
    expect(ejecutados[0].params).toEqual([0, actor.sub, 2]);
  });

  it('no permite quitarse a sí mismo el rol de administrador', async () => {
    const { db } = crearDb({ usuario: { id: 1 } });
    const s = new UsuariosService(db as never, auditoria as never);
    await expect(s.editar(1, { nombreCompleto: 'A', cargo: 'B', rol: 'TH' }, actor)).rejects.toThrow(BadRequestException);
  });

  it('restablecer clave genera una nueva, desbloquea y exige cambiarla', async () => {
    const { db, ejecutados } = crearDb({});
    const s = new UsuariosService(db as never, auditoria as never);
    const r = await s.restablecerClave(2, actor);
    expect(ejecutados[0].sql).toMatch(/debe_cambiar_clave = 1.*bloqueado_hasta = NULL/s);
    expect(await bcrypt.compare(r.claveTemporal, ejecutados[0].params[0] as string)).toBe(true);
  });

  it('no restablece la clave propia (para eso está Cambiar clave)', async () => {
    const { db } = crearDb({});
    const s = new UsuariosService(db as never, auditoria as never);
    await expect(s.restablecerClave(1, actor)).rejects.toThrow('Cambiar clave');
  });
});
