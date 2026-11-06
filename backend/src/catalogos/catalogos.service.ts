import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import { CATALOGOS, CATALOGOS_POR_CLAVE, type DefinicionCatalogo } from './definiciones.js';

type Fila = Record<string, unknown> & { id: number; activo: boolean };
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Administración genérica de catálogos (áreas, cargos, entidades, proveedores…). */
@Injectable()
export class CatalogosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
  ) {}

  definiciones() {
    return CATALOGOS.map(({ tabla, columnasAuditoria, ...publico }) => publico);
  }

  def(clave: string): DefinicionCatalogo {
    const d = CATALOGOS_POR_CLAVE.get(clave);
    if (!d) throw new NotFoundException('El catálogo no existe');
    return d;
  }

  /** Todos los registros, activos e inactivos. Las referencias traen también su nombre (columna__nombre). */
  async listar(clave: string, cx: Conexion = this.db, id?: number): Promise<Fila[]> {
    const d = this.def(clave);
    const columnas = d.campos.map((c) => `t.\`${c.columna}\``);
    const referencias = d.campos
      .filter((c) => c.tipo === 'referencia')
      .map((c) => {
        const ref = this.def(c.referencia!);
        return `(SELECT r.\`${ref.columnaNombre}\` FROM \`${ref.tabla}\` r WHERE r.id = t.\`${c.columna}\`) AS \`${c.columna}__nombre\``;
      });
    const filas = await cx.consultar<Record<string, unknown>>(
      `SELECT t.id, ${[...columnas, ...referencias].join(', ')}, t.activo
         FROM \`${d.tabla}\` t
        ${id ? 'WHERE t.id = ?' : ''}
        ORDER BY t.activo DESC, t.\`${d.columnaNombre}\``,
      id ? [id] : [],
    );
    return filas.map((f) => {
      const fila = { ...f, activo: !!f.activo } as Fila;
      for (const c of d.campos) {
        if (c.tipo === 'booleano') fila[c.columna] = !!fila[c.columna];
        // Las opciones se comparan como texto en la pantalla (ej. riesgo ARL guardado como número)
        if (c.tipo === 'opciones' && fila[c.columna] !== null) fila[c.columna] = String(fila[c.columna]);
      }
      return fila;
    });
  }

  async crear(clave: string, datos: Record<string, unknown>, actor: UsuarioToken, ip?: string) {
    const d = this.def(clave);
    const valores = await this.validar(d, datos);
    const columnas = Object.keys(valores);
    const params = Object.values(valores);
    if (d.columnasAuditoria) {
      columnas.push('creado_por');
      params.push(actor.sub);
    }
    const r = await this.conDuplicado(d, () =>
      this.db.ejecutar(
        `INSERT INTO \`${d.tabla}\` (${columnas.map((c) => `\`${c}\``).join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
        params,
      ),
    );
    const [nuevo] = await this.listar(clave, this.db, r.insertId);
    await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'CREAR', tabla: d.tabla, registroId: r.insertId, despues: nuevo, ip });
    return nuevo;
  }

  async editar(clave: string, id: number, datos: Record<string, unknown>, actor: UsuarioToken, ip?: string) {
    const d = this.def(clave);
    const [antes] = await this.listar(clave, this.db, id);
    if (!antes) throw new NotFoundException('El registro no existe');
    const valores = await this.validar(d, datos, antes);
    const asignaciones = Object.keys(valores).map((c) => `\`${c}\` = ?`);
    const params: unknown[] = Object.values(valores);
    if (d.columnasAuditoria) {
      asignaciones.push('actualizado_por = ?');
      params.push(actor.sub);
    }
    await this.conDuplicado(d, () =>
      this.db.ejecutar(`UPDATE \`${d.tabla}\` SET ${asignaciones.join(', ')} WHERE id = ?`, [...params, id]),
    );
    const [despues] = await this.listar(clave, this.db, id);
    await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: d.tabla, registroId: id, antes, despues, ip });
    return despues;
  }

  /** Inactivar o reactivar. Nunca se borra (RN-09). */
  async cambiarEstado(clave: string, id: number, activo: boolean, actor: UsuarioToken, ip?: string) {
    const d = this.def(clave);
    const [antes] = await this.listar(clave, this.db, id);
    if (!antes) throw new NotFoundException('El registro no existe');
    const extra = d.columnasAuditoria ? ', actualizado_por = ?' : '';
    await this.db.ejecutar(
      `UPDATE \`${d.tabla}\` SET activo = ?${extra} WHERE id = ?`,
      d.columnasAuditoria ? [activo ? 1 : 0, actor.sub, id] : [activo ? 1 : 0, id],
    );
    await this.auditoria.registrar({
      usuarioId: actor.sub, accion: activo ? 'EDITAR' : 'INACTIVAR', tabla: d.tabla, registroId: id,
      antes: { activo: antes.activo }, despues: { activo }, ip,
    });
    const [despues] = await this.listar(clave, this.db, id);
    return despues;
  }

  /** Convierte y valida los datos según la definición. Rechaza campos que no existen. */
  async validar(d: DefinicionCatalogo, datos: Record<string, unknown>, actual?: Fila): Promise<Record<string, unknown>> {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new BadRequestException('Datos no válidos');
    const conocidas = new Set(d.campos.map((c) => c.columna));
    const desconocida = Object.keys(datos).find((k) => !conocidas.has(k));
    if (desconocida) throw new BadRequestException(`El campo "${desconocida}" no pertenece a ${d.titulo.toLowerCase()}`);

    const valores: Record<string, unknown> = {};
    for (const c of d.campos) {
      let v = datos[c.columna];
      if (typeof v === 'string') v = v.trim();
      const vacio = v === undefined || v === null || v === '';

      if (c.tipo === 'booleano') {
        valores[c.columna] = v === true || v === 1 || v === '1' ? 1 : 0;
        continue;
      }
      if (vacio) {
        if (c.requerido) throw new BadRequestException(`El campo "${c.etiqueta}" es obligatorio`);
        valores[c.columna] = null;
        continue;
      }
      switch (c.tipo) {
        case 'texto': {
          let texto = String(v);
          if (c.formato === 'mayusculas') texto = texto.toUpperCase();
          if (c.maximo && texto.length > c.maximo) {
            throw new BadRequestException(`"${c.etiqueta}" no puede superar ${c.maximo} caracteres`);
          }
          if (c.formato === 'correo' && !CORREO.test(texto)) throw new BadRequestException('El correo no es válido');
          valores[c.columna] = texto;
          break;
        }
        case 'numero': {
          const n = Number(v);
          if (!Number.isInteger(n)) throw new BadRequestException(`"${c.etiqueta}" debe ser un número entero`);
          if ((c.minimo !== undefined && n < c.minimo) || (c.maximo !== undefined && n > c.maximo)) {
            throw new BadRequestException(`"${c.etiqueta}" debe estar entre ${c.minimo} y ${c.maximo}`);
          }
          valores[c.columna] = n;
          break;
        }
        case 'opciones': {
          const texto = String(v);
          if (!c.opciones?.some((o) => o.valor === texto)) throw new BadRequestException(`Seleccione un valor válido para "${c.etiqueta}"`);
          valores[c.columna] = texto;
          break;
        }
        case 'referencia': {
          const id = Number(v);
          const ref = this.def(c.referencia!);
          const existe = await this.db.uno<{ activo: number }>(`SELECT activo FROM \`${ref.tabla}\` WHERE id = ?`, [id]);
          if (!existe) throw new BadRequestException(`El valor seleccionado en "${c.etiqueta}" no existe`);
          // Se permite conservar una referencia ya inactiva, pero no asignar una nueva inactiva
          if (!existe.activo && actual?.[c.columna] !== id) {
            throw new BadRequestException(`El valor seleccionado en "${c.etiqueta}" está inactivo`);
          }
          valores[c.columna] = id;
          break;
        }
      }
    }
    return valores;
  }

  private async conDuplicado<T>(d: DefinicionCatalogo, operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException(d.mensajeDuplicado);
      throw error;
    }
  }
}
