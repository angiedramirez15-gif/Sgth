import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { UsuarioToken } from '../common/tipos.js';
import { CatalogosService } from './catalogos.service.js';

const actor: UsuarioToken = { sub: 7, usuario: 'admin', nombre: 'Admin', cargo: 'Admin', rol: 'ADMIN', permisos: [], cambiarClave: false, motivoClave: null, aceptarCompromiso: false, dobleVerificacion: false, v: 0, ini: 0 };

function crear(opciones: { refActiva?: boolean; refExiste?: boolean; duplicado?: boolean } = {}) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const db = {
    uno: vi.fn(async () => (opciones.refExiste === false ? null : { activo: opciones.refActiva === false ? 0 : 1 })),
    consultar: vi.fn(async (sql: string, params: unknown[]) => {
      sqls.push({ sql, params });
      return [{ id: 5, nombre: 'Auxiliar de obra', area_id: 2, nivel_riesgo_arl: 3, activo: 1 }];
    }),
    ejecutar: vi.fn(async (sql: string, params: unknown[]) => {
      if (opciones.duplicado) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      sqls.push({ sql, params });
      return { insertId: 5, affectedRows: 1 };
    }),
  };
  return { s: new CatalogosService(db as never, { registrar: vi.fn() } as never), sqls };
}

describe('CatalogosService', () => {
  it('rechaza catálogos que no existen (no se puede inyectar el nombre de una tabla)', async () => {
    const { s } = crear();
    await expect(s.listar('usuarios; DROP TABLE x')).rejects.toThrow(NotFoundException);
  });

  it('rechaza campos que no pertenecen al catálogo', async () => {
    const { s } = crear();
    await expect(s.crear('areas', { nombre: 'Obra', activo: 0 }, actor)).rejects.toThrow('no pertenece');
  });

  it('exige los campos obligatorios', async () => {
    const { s } = crear();
    await expect(s.crear('areas', { nombre: '   ' }, actor)).rejects.toThrow('obligatorio');
  });

  it('crea un cargo con área y riesgo, y registra quién lo creó', async () => {
    const { s, sqls } = crear();
    const r = await s.crear('cargos', { nombre: ' Auxiliar de obra ', area_id: 2, nivel_riesgo_arl: '3' }, actor);
    const insert = sqls.find((x) => x.sql.startsWith('INSERT'))!;
    expect(insert.sql).toContain('`creado_por`');
    expect(insert.params).toEqual(['Auxiliar de obra', 2, '3', 7]);
    expect(r.nivel_riesgo_arl).toBe('3'); // las opciones vuelven como texto
  });

  it('no asigna un área inactiva', async () => {
    const { s } = crear({ refActiva: false });
    await expect(s.crear('cargos', { nombre: 'X', area_id: 9 }, actor)).rejects.toThrow('inactivo');
  });

  it('no asigna un área que no existe', async () => {
    const { s } = crear({ refExiste: false });
    await expect(s.crear('cargos', { nombre: 'X', area_id: 99 }, actor)).rejects.toThrow('no existe');
  });

  it('valida opciones, números y correos', async () => {
    const { s } = crear();
    await expect(s.crear('entidades_seguridad_social', { tipo: 'BANCO', nombre: 'X' }, actor)).rejects.toThrow(BadRequestException);
    await expect(s.crear('tipos_documento_expediente', { nombre: 'X', dias_alerta: 500 }, actor)).rejects.toThrow('entre 1 y 365');
    await expect(s.crear('proveedores', { nombre: 'X', correo: 'no-es-correo' }, actor)).rejects.toThrow('correo');
  });

  it('pasa el código del documento de identidad a mayúsculas', async () => {
    const { s, sqls } = crear();
    await s.crear('tipos_documento_identidad', { codigo: 'nit', nombre: 'NIT' }, actor);
    expect(sqls.find((x) => x.sql.startsWith('INSERT'))!.params[0]).toBe('NIT');
  });

  it('traduce el duplicado a un mensaje claro', async () => {
    const { s } = crear({ duplicado: true });
    await expect(s.crear('areas', { nombre: 'Obra' }, actor)).rejects.toThrow(new ConflictException('Ya existe un área con ese nombre'));
  });

  it('las definiciones públicas no exponen el nombre real de la tabla', () => {
    const { s } = crear();
    for (const d of s.definiciones()) expect(d).not.toHaveProperty('tabla');
  });
});
