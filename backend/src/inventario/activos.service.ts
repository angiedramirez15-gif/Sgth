import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import { CATEGORIAS, type Categoria, exigirPermiso } from './categorias.js';
import type { ActivoDto, EstadoActivoDto } from './dto/inventario.dto.js';

export interface Activo {
  id: number;
  placa: string;
  elementoId: number;
  elemento: string;
  categoria: 'EQUIPO' | 'MUEBLE';
  unidad: string;
  serial: string | null;
  marca: string | null;
  modelo: string | null;
  descripcionAdicional: string | null;
  estado: 'DISPONIBLE' | 'ASIGNADO' | 'EN_REPARACION' | 'DADO_DE_BAJA';
  condicion: 'NUEVO' | 'BUENO' | 'REGULAR' | 'MALO';
  colaboradorId: number | null;
  colaborador: string | null;
  colaboradorCargo: string | null;
  fechaCompra: string | null;
  proveedorId: number | null;
  proveedor: string | null;
  valorCompra: number | null;
  observaciones: string | null;
  creadoEn: string;
}

export interface HistorialActivo {
  fecha: string;
  tipo: string;
  descripcion: string;
  actaId: number | null;
  acta: string | null;
  usuario: string;
}

const SELECT_ACTIVO = `
  SELECT a.id, a.placa_inventario AS placa, a.elemento_id AS elementoId, e.nombre AS elemento,
         e.categoria_inventario AS categoria, e.unidad, a.serial, a.marca, a.modelo,
         a.descripcion_adicional AS descripcionAdicional, a.estado, a.condicion,
         a.colaborador_actual_id AS colaboradorId,
         CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, cg.nombre AS colaboradorCargo,
         a.fecha_compra AS fechaCompra, a.proveedor_id AS proveedorId, p.nombre AS proveedor,
         a.valor_compra AS valorCompra, a.observaciones, DATE_FORMAT(a.creado_en, '%Y-%m-%d') AS creadoEn
    FROM activos a
    JOIN elementos e ON e.id = a.elemento_id
    LEFT JOIN colaboradores c ON c.id = a.colaborador_actual_id
    LEFT JOIN cargos cg ON cg.id = c.cargo_id
    LEFT JOIN proveedores p ON p.id = a.proveedor_id`;

const ESTADOS: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  ASIGNADO: 'Asignado',
  EN_REPARACION: 'En reparación',
  DADO_DE_BAJA: 'Dado de baja',
};

const CAMBIO_ESTADO: Record<string, string> = {
  EN_REPARACION: 'Enviado a reparación',
  DISPONIBLE: 'Vuelve a estar disponible',
};

/** Equipos y muebles: cada unidad con placa, serial, estado y a quién está asignada (RF-71, RF-76). */
@Injectable()
export class ActivosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
  ) {}

  async listar(u: UsuarioToken): Promise<Activo[]> {
    exigirPermiso(u, 'EQUIPO', 'ver');
    return this.db.consultar<Activo>(`${SELECT_ACTIVO} ORDER BY a.estado = 'DADO_DE_BAJA', a.placa_inventario`);
  }

  async obtener(id: number, u: UsuarioToken | null, cx: Conexion = this.db): Promise<Activo> {
    if (u) exigirPermiso(u, 'EQUIPO', 'ver');
    const a = await cx.uno<Activo>(`${SELECT_ACTIVO} WHERE a.id = ?`, [id]);
    if (!a) throw new NotFoundException('El activo no existe');
    return a;
  }

  /** Movimientos de inventario y actas en las que aparece el activo, del más reciente al más antiguo. */
  async historial(id: number, u: UsuarioToken): Promise<HistorialActivo[]> {
    await this.obtener(id, u);
    const movimientos = await this.db.consultar<{ fecha: string; orden: number; tipo: string; observacion: string | null; actaId: number | null; acta: string | null; usuario: string }>(
      `SELECT DATE_FORMAT(m.fecha, '%Y-%m-%d %H:%i:%s') AS fecha, m.id AS orden, m.tipo_movimiento AS tipo, m.observacion,
              m.acta_id AS actaId, ac.consecutivo AS acta, us.nombre_completo AS usuario
         FROM movimientos_inventario m
         JOIN usuarios us ON us.id = m.usuario_id
         LEFT JOIN actas ac ON ac.id = m.acta_id
        WHERE m.activo_id = ?
        ORDER BY m.fecha DESC, m.id DESC`,
      [id],
    );
    const auditoria = await this.db.consultar<{ fecha: string; orden: number; datos_antes: string | null; datos_despues: string | null; usuario: string | null }>(
      `SELECT DATE_FORMAT(au.fecha, '%Y-%m-%d %H:%i:%s') AS fecha, au.id AS orden, au.datos_antes, au.datos_despues, us.nombre_completo AS usuario
         FROM auditoria au LEFT JOIN usuarios us ON us.id = au.usuario_id
        WHERE au.tabla = 'activos' AND au.registro_id = ? AND au.accion = 'EDITAR'
        ORDER BY au.fecha DESC, au.id DESC`,
      [id],
    );
    const texto: Record<string, string> = {
      ENTRADA: 'Registro en el inventario',
      SALIDA: 'Entrega',
      DEVOLUCION: 'Devolución',
      BAJA: 'Dado de baja',
      AJUSTE_POSITIVO: 'Reactivado',
      ANULACION: 'Acta anulada',
    };
    // orden: dentro del mismo segundo, el registro (movimiento) va antes que los cambios de estado
    const items: (HistorialActivo & { prioridad: number })[] = movimientos.map((m) => ({
      prioridad: m.orden,
      fecha: m.fecha,
      tipo: m.tipo,
      descripcion: [texto[m.tipo] ?? m.tipo, m.observacion].filter(Boolean).join(': '),
      actaId: m.actaId,
      acta: m.acta,
      usuario: m.usuario,
    }));
    // Cambios de estado (reparación) que no mueven inventario
    for (const a of auditoria) {
      const antes = parsear(a.datos_antes);
      const despues = parsear(a.datos_despues);
      if (antes?.estado && despues?.estado && antes.estado !== despues.estado && despues.estado !== 'DADO_DE_BAJA' && antes.estado !== 'DADO_DE_BAJA') {
        items.push({
          prioridad: Number.MAX_SAFE_INTEGER / 2 + a.orden,
          fecha: a.fecha,
          tipo: 'ESTADO',
          descripcion: [CAMBIO_ESTADO[despues.estado as string] ?? ESTADOS[despues.estado as string], despues.observacion].filter(Boolean).join(': '),
          actaId: null,
          acta: null,
          usuario: a.usuario ?? '',
        });
      }
    }
    return items
      .sort((x, y) => y.fecha.localeCompare(x.fecha) || y.prioridad - x.prioridad)
      .map(({ prioridad: _, ...h }) => ({ ...h, fecha: h.fecha.slice(0, 16) }));
  }

  /** Registra una o varias unidades; el sistema asigna la placa (DD-EQ-0001, DD-MU-0001). */
  async crear(dto: ActivoDto, u: UsuarioToken, ip?: string): Promise<Activo[]> {
    exigirPermiso(u, 'EQUIPO', 'gestionar');
    if ((dto.cantidad ?? 1) > 1 && dto.serial) {
      throw new BadRequestException('Con serial se registra una unidad a la vez. Para varias unidades iguales deje el serial vacío');
    }
    return this.db.transaccion((cx) => this.crearEn(cx, dto, u, ip));
  }

  /** Igual que crear, dentro de una transacción ya abierta (la usan las actas antiguas). */
  async crearEn(cx: Conexion, dto: ActivoDto, u: UsuarioToken, ip?: string, nota = ''): Promise<Activo[]> {
    exigirPermiso(u, 'EQUIPO', 'gestionar');
    const cantidad = dto.cantidad ?? 1;
    const elemento = await this.elementoActivo(dto.elementoId, cx);
    await this.validarProveedor(dto.proveedorId, cx);
    const placas = await this.siguientesPlacas(elemento.categoria_inventario, cantidad, cx);
    const creados: Activo[] = [];
    for (const placa of placas) {
      let id = 0;
      try {
        const r = await cx.ejecutar(
          `INSERT INTO activos (elemento_id, serial, placa_inventario, marca, modelo, descripcion_adicional, estado, condicion,
                                fecha_compra, proveedor_id, valor_compra, observaciones, creado_por)
           VALUES (?, ?, ?, ?, ?, ?, 'DISPONIBLE', ?, ?, ?, ?, ?, ?)`,
          [elemento.id, dto.serial ?? null, placa, dto.marca ?? null, dto.modelo ?? null, dto.descripcionAdicional ?? null,
            dto.condicion, dto.fechaCompra ?? null, dto.proveedorId ?? null, dto.valorCompra ?? null, dto.observaciones ?? null, u.sub],
        );
        id = r.insertId;
      } catch (error) {
        return this.serialDuplicado(error, dto.serial, cx);
      }
      await cx.ejecutar(
        `INSERT INTO movimientos_inventario (elemento_id, activo_id, tipo_movimiento, cantidad, proveedor_id, usuario_id, observacion)
         VALUES (?, ?, 'ENTRADA', 1, ?, ?, ?)`,
        [elemento.id, id, dto.proveedorId ?? null, u.sub, `Placa ${placa}${nota}`],
      );
      const activo = await this.obtener(id, null, cx);
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'CREAR', tabla: 'activos', registroId: id, despues: activo, ip }, cx);
      creados.push(activo);
    }
    return creados;
  }

  async editar(id: number, dto: ActivoDto, u: UsuarioToken, ip?: string): Promise<Activo> {
    exigirPermiso(u, 'EQUIPO', 'gestionar');
    return this.db.transaccion(async (cx) => {
      const antes = await this.obtener(id, null, cx);
      if (dto.elementoId !== antes.elementoId) {
        const nuevo = await this.elementoActivo(dto.elementoId, cx);
        if (nuevo.categoria_inventario !== antes.categoria) {
          const tipo = antes.categoria === 'EQUIPO' ? 'equipo' : 'mueble';
          throw new BadRequestException(`${antes.placa} es una placa de ${tipo}: solo puede cambiarse por otro tipo de ${tipo}`);
        }
      }
      await this.validarProveedor(dto.proveedorId, cx);
      try {
        await cx.ejecutar(
          `UPDATE activos SET elemento_id = ?, serial = ?, marca = ?, modelo = ?, descripcion_adicional = ?, condicion = ?,
                  fecha_compra = ?, proveedor_id = ?, valor_compra = ?, observaciones = ?, actualizado_por = ?
            WHERE id = ?`,
          [dto.elementoId, dto.serial ?? null, dto.marca ?? null, dto.modelo ?? null, dto.descripcionAdicional ?? null, dto.condicion,
            dto.fechaCompra ?? null, dto.proveedorId ?? null, dto.valorCompra ?? null, dto.observaciones ?? null, u.sub, id],
        );
      } catch (error) {
        await this.serialDuplicado(error, dto.serial, cx, id);
      }
      const despues = await this.obtener(id, null, cx);
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'activos', registroId: id, antes, despues, ip }, cx);
      return despues;
    });
  }

  /** Disponible, en reparación o dado de baja. Asignar y devolver se hace con actas. */
  async cambiarEstado(id: number, dto: EstadoActivoDto, u: UsuarioToken, ip?: string): Promise<Activo> {
    exigirPermiso(u, 'EQUIPO', 'gestionar');
    return this.db.transaccion(async (cx) => {
      const antes = await this.obtener(id, null, cx);
      if (antes.estado === dto.estado) return antes;
      if (antes.estado === 'ASIGNADO') {
        throw new BadRequestException(`${antes.placa} está asignado a ${antes.colaborador}. Registre primero la devolución`);
      }
      if ((dto.estado === 'DADO_DE_BAJA' || antes.estado === 'DADO_DE_BAJA') && !dto.observacion) {
        throw new BadRequestException(dto.estado === 'DADO_DE_BAJA' ? 'Explique el motivo de la baja' : 'Explique por qué se reactiva el activo');
      }
      await cx.ejecutar('UPDATE activos SET estado = ?, actualizado_por = ? WHERE id = ?', [dto.estado, u.sub, id]);
      if (dto.estado === 'DADO_DE_BAJA' || antes.estado === 'DADO_DE_BAJA') {
        await cx.ejecutar(
          `INSERT INTO movimientos_inventario (elemento_id, activo_id, tipo_movimiento, cantidad, usuario_id, observacion)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [antes.elementoId, id, dto.estado === 'DADO_DE_BAJA' ? 'BAJA' : 'AJUSTE_POSITIVO', u.sub, dto.observacion],
        );
      }
      const despues = await this.obtener(id, null, cx);
      await this.auditoria.registrar({
        usuarioId: u.sub, accion: dto.estado === 'DADO_DE_BAJA' ? 'INACTIVAR' : 'EDITAR', tabla: 'activos', registroId: id,
        antes: { estado: antes.estado }, despues: { estado: dto.estado, observacion: dto.observacion ?? null }, ip,
      }, cx);
      return despues;
    });
  }

  /** Activos por id, en el orden pedido, para los stickers. */
  async varios(ids: number[], u: UsuarioToken): Promise<Activo[]> {
    exigirPermiso(u, 'EQUIPO', 'ver');
    const unicos = [...new Set(ids)];
    const filas = await this.db.consultar<Activo>(`${SELECT_ACTIVO} WHERE a.id IN (?)`, [unicos]);
    if (filas.length !== unicos.length) throw new NotFoundException('Alguno de los activos seleccionados ya no existe');
    const porId = new Map(filas.map((f) => [f.id, f]));
    return unicos.map((i) => porId.get(i)!);
  }

  // ---------- Auxiliares ----------

  /**
   * Reserva las siguientes placas del tipo dentro de la transacción.
   * El bloqueo FOR UPDATE evita que dos usuarios obtengan el mismo número.
   */
  async siguientesPlacas(categoria: Categoria, cantidad: number, cx: Conexion): Promise<string[]> {
    const codigo = CATEGORIAS[categoria].codigoPlaca;
    if (!codigo) throw new BadRequestException('Solo los equipos y muebles llevan placa');
    const prefijo = `${await this.config.texto('prefijo_placa', 'DD')}-${codigo}`;
    await cx.ejecutar('INSERT IGNORE INTO consecutivos_placa (prefijo, ultimo) VALUES (?, 0)', [prefijo]);
    const fila = await cx.uno<{ ultimo: number }>('SELECT ultimo FROM consecutivos_placa WHERE prefijo = ? FOR UPDATE', [prefijo]);
    const inicio = fila!.ultimo;
    await cx.ejecutar('UPDATE consecutivos_placa SET ultimo = ? WHERE prefijo = ?', [inicio + cantidad, prefijo]);
    return Array.from({ length: cantidad }, (_, i) => `${prefijo}-${String(inicio + i + 1).padStart(4, '0')}`);
  }

  private async elementoActivo(elementoId: number, cx: Conexion) {
    const e = await cx.uno<{ id: number; nombre: string; categoria_inventario: Categoria; activo: number }>(
      'SELECT id, nombre, categoria_inventario, activo FROM elementos WHERE id = ?',
      [elementoId],
    );
    if (!e || !CATEGORIAS[e.categoria_inventario].porUnidad) throw new BadRequestException('Seleccione un tipo de equipo o mueble del catálogo');
    if (!e.activo) throw new BadRequestException(`"${e.nombre}" está inactivo en el catálogo`);
    return e;
  }

  private async validarProveedor(proveedorId: number | null | undefined, cx: Conexion) {
    if (!proveedorId) return;
    const p = await cx.uno('SELECT id FROM proveedores WHERE id = ?', [proveedorId]);
    if (!p) throw new BadRequestException('El proveedor no existe');
  }

  private async serialDuplicado(error: unknown, serial: string | null | undefined, cx: Conexion, excepto?: number): Promise<never> {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY' && serial) {
      const otro = await cx.uno<{ placa_inventario: string }>('SELECT placa_inventario FROM activos WHERE serial = ? AND id <> ?', [serial, excepto ?? 0]);
      throw new ConflictException(`El serial ${serial} ya está registrado${otro ? ` en la placa ${otro.placa_inventario}` : ''}`);
    }
    throw error;
  }
}

function parsear(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return typeof json === 'string' ? JSON.parse(json) : (json as Record<string, unknown>);
  } catch {
    return null;
  }
}
