import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { UsuarioToken } from '../common/tipos.js';
import type { Conexion } from '../database/database.service.js';
import { ActivosService } from './activos.service.js';
import { exigirPermiso, normalizarTalla } from './categorias.js';
import { ordenTalla } from './elementos.service.js';

const usuario = (permisos: string[]): UsuarioToken => ({ sub: 1, usuario: 'x', nombre: 'X', cargo: 'X', rol: 'TH', permisos, cambiarClave: false, motivoClave: null, aceptarCompromiso: false, dobleVerificacion: false, v: 0, ini: 0 });

describe('Reglas de inventario', () => {
  it('normaliza tallas y usa UNICA cuando el elemento no maneja tallas', () => {
    expect(normalizarTalla(' m ', true)).toBe('M');
    expect(normalizarTalla(38, true)).toBe('38');
    expect(normalizarTalla('', true)).toBeNull();
    expect(normalizarTalla('XL', false)).toBe('UNICA');
  });

  it('ordena tallas de letras y números de forma natural', () => {
    expect(['XL', 'S', 'M', 'L'].sort(ordenTalla)).toEqual(['S', 'M', 'L', 'XL']);
    expect(['40', '8', '36'].sort(ordenTalla)).toEqual(['8', '36', '40']);
  });

  it('exige el permiso de la categoría: SST no modifica dotación ni equipos', () => {
    const sst = usuario(['inventario_epp.ver', 'inventario_epp.gestionar', 'inventario_dotacion.ver', 'inventario_activos.ver']);
    expect(() => exigirPermiso(sst, 'EPP', 'gestionar')).not.toThrow();
    expect(() => exigirPermiso(sst, 'DOTACION', 'ver')).not.toThrow();
    expect(() => exigirPermiso(sst, 'DOTACION', 'gestionar')).toThrow(ForbiddenException);
    expect(() => exigirPermiso(sst, 'MUEBLE', 'gestionar')).toThrow('No tiene permiso para modificar el inventario de muebles');
  });
});

describe('Placas de inventario', () => {
  function servicio(ultimo: number) {
    const sqls: { sql: string; params?: unknown[] }[] = [];
    const cx = {
      ejecutar: async (sql: string, params?: unknown[]) => { sqls.push({ sql, params }); return { insertId: 0, affectedRows: 1 } as never; },
      uno: async () => ({ ultimo }) as never,
      consultar: async () => [] as never,
    } as Conexion;
    const config = { texto: async () => 'DD' };
    return { s: new ActivosService({} as never, {} as never, config as never), cx, sqls };
  }

  it('continúa la numeración por tipo y reserva todas las placas de una vez', async () => {
    const { s, cx, sqls } = servicio(41);
    expect(await s.siguientesPlacas('MUEBLE', 3, cx)).toEqual(['DD-MU-0042', 'DD-MU-0043', 'DD-MU-0044']);
    expect(sqls.at(-1)).toEqual({ sql: 'UPDATE consecutivos_placa SET ultimo = ? WHERE prefijo = ?', params: [44, 'DD-MU'] });
  });

  it('solo equipos y muebles llevan placa', async () => {
    const { s, cx } = servicio(0);
    await expect(s.siguientesPlacas('DOTACION', 1, cx)).rejects.toThrow(BadRequestException);
  });
});
