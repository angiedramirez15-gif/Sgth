import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import { CATEGORIAS, type Categoria, exigirPermiso, normalizarTalla } from './categorias.js';
import type { AjusteDto, ElementoDto, EntradaDto } from './dto/inventario.dto.js';

interface FilaElemento {
  id: number;
  categoria_inventario: Categoria;
  nombre: string;
  subcategoria: string | null;
  unidad: string;
  controla_por_unidad: number;
  maneja_tallas: number;
  norma_certificacion: string | null;
  vida_util_dias: number | null;
  stock_minimo: number | null;
  activo: number;
}

export interface Elemento {
  id: number;
  categoria: Categoria;
  nombre: string;
  subcategoria: string | null;
  unidad: string;
  porUnidad: boolean;
  manejaTallas: boolean;
  normaCertificacion: string | null;
  vidaUtilDias: number | null;
  stockMinimo: number | null;
  activo: boolean;
  /** Elementos por cantidad: stock por talla. */
  existencias: { talla: string; cantidad: number }[];
  total: number;
  /** Equipos y muebles: unidades por estado. */
  unidades?: { disponibles: number; asignados: number; enReparacion: number; deBaja: number };
}

export interface Movimiento {
  id: number;
  fecha: string;
  tipo: string;
  talla: string;
  cantidad: number;
  placa: string | null;
  proveedor: string | null;
  numeroFactura: string | null;
  acta: string | null;
  actaId: number | null;
  usuario: string;
  observacion: string | null;
  /** 1 suma al stock, -1 resta. */
  signo: number;
}

function aElemento(f: FilaElemento): Elemento {
  return {
    id: f.id,
    categoria: f.categoria_inventario,
    nombre: f.nombre,
    subcategoria: f.subcategoria,
    unidad: f.unidad,
    porUnidad: !!f.controla_por_unidad,
    manejaTallas: !!f.maneja_tallas,
    normaCertificacion: f.norma_certificacion,
    vidaUtilDias: f.vida_util_dias,
    stockMinimo: f.stock_minimo,
    activo: !!f.activo,
    existencias: [],
    total: 0,
  };
}

/** Catálogo único de elementos, existencias por talla, entradas, ajustes e historial (RF-30 a RF-34, RF-70, RF-77). */
@Injectable()
export class ElementosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(categoria: Categoria, u: UsuarioToken): Promise<Elemento[]> {
    exigirPermiso(u, categoria, 'ver');
    const filas = await this.db.consultar<FilaElemento>(
      'SELECT * FROM elementos WHERE categoria_inventario = ? ORDER BY activo DESC, nombre',
      [categoria],
    );
    const elementos = filas.map(aElemento);
    if (!elementos.length) return elementos;
    const porId = new Map(elementos.map((e) => [e.id, e]));
    const ids = elementos.map((e) => e.id);

    if (CATEGORIAS[categoria].porUnidad) {
      const conteos = await this.db.consultar<{ elemento_id: number; estado: string; n: number }>(
        'SELECT elemento_id, estado, COUNT(*) AS n FROM activos WHERE elemento_id IN (?) GROUP BY elemento_id, estado',
        [ids],
      );
      for (const e of elementos) e.unidades = { disponibles: 0, asignados: 0, enReparacion: 0, deBaja: 0 };
      for (const c of conteos) {
        const u = porId.get(c.elemento_id)!.unidades!;
        const n = Number(c.n);
        if (c.estado === 'DISPONIBLE') u.disponibles = n;
        else if (c.estado === 'ASIGNADO') u.asignados = n;
        else if (c.estado === 'EN_REPARACION') u.enReparacion = n;
        else u.deBaja = n;
      }
      for (const e of elementos) e.total = e.unidades!.disponibles + e.unidades!.asignados + e.unidades!.enReparacion;
    } else {
      const existencias = await this.db.consultar<{ elemento_id: number; talla: string; cantidad: number }>(
        'SELECT elemento_id, talla, cantidad FROM existencias WHERE elemento_id IN (?) AND cantidad > 0 ORDER BY talla',
        [ids],
      );
      for (const x of existencias) {
        const e = porId.get(x.elemento_id)!;
        e.existencias.push({ talla: x.talla, cantidad: x.cantidad });
        e.total += x.cantidad;
      }
      for (const e of elementos) e.existencias.sort((a, b) => ordenTalla(a.talla, b.talla));
    }
    return elementos;
  }

  async obtener(id: number, cx: Conexion = this.db): Promise<FilaElemento> {
    const f = await cx.uno<FilaElemento>('SELECT * FROM elementos WHERE id = ?', [id]);
    if (!f) throw new NotFoundException('El elemento no existe');
    return f;
  }

  async crear(dto: ElementoDto, u: UsuarioToken, ip?: string): Promise<Elemento> {
    const categoria = dto.categoria as Categoria;
    exigirPermiso(u, categoria, 'gestionar');
    const datos = this.reglas(categoria, dto);
    try {
      const r = await this.db.ejecutar(
        `INSERT INTO elementos (categoria_inventario, nombre, subcategoria, unidad, controla_por_unidad, maneja_tallas,
                                norma_certificacion, vida_util_dias, stock_minimo, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [categoria, datos.nombre, datos.subcategoria, datos.unidad, datos.porUnidad, datos.manejaTallas,
          datos.normaCertificacion, datos.vidaUtilDias, datos.stockMinimo, u.sub],
      );
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'CREAR', tabla: 'elementos', registroId: r.insertId, despues: { categoria, ...datos }, ip });
      return aElemento(await this.obtener(r.insertId));
    } catch (error) {
      this.duplicado(error, categoria, datos.nombre);
    }
  }

  async editar(id: number, dto: ElementoDto, u: UsuarioToken, ip?: string): Promise<Elemento> {
    const antes = await this.obtener(id);
    exigirPermiso(u, antes.categoria_inventario, 'gestionar');
    if (dto.categoria !== antes.categoria_inventario) {
      throw new BadRequestException('La categoría de un elemento no se puede cambiar. Créelo de nuevo en la categoría correcta');
    }
    const datos = this.reglas(antes.categoria_inventario, dto);
    if (datos.manejaTallas !== !!antes.maneja_tallas) {
      const usado = await this.db.uno<{ n: number }>('SELECT COUNT(*) AS n FROM movimientos_inventario WHERE elemento_id = ?', [id]);
      if (Number(usado?.n) > 0) {
        throw new BadRequestException('No se puede cambiar si maneja tallas porque el elemento ya tiene entradas o entregas registradas');
      }
    }
    try {
      await this.db.ejecutar(
        `UPDATE elementos SET nombre = ?, subcategoria = ?, unidad = ?, maneja_tallas = ?, norma_certificacion = ?,
                vida_util_dias = ?, stock_minimo = ?, actualizado_por = ? WHERE id = ?`,
        [datos.nombre, datos.subcategoria, datos.unidad, datos.manejaTallas, datos.normaCertificacion,
          datos.vidaUtilDias, datos.stockMinimo, u.sub, id],
      );
    } catch (error) {
      this.duplicado(error, antes.categoria_inventario, datos.nombre);
    }
    const despues = await this.obtener(id);
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'elementos', registroId: id, antes, despues, ip });
    return aElemento(despues);
  }

  async cambiarActivo(id: number, activo: boolean, u: UsuarioToken, ip?: string) {
    const antes = await this.obtener(id);
    exigirPermiso(u, antes.categoria_inventario, 'gestionar');
    await this.db.ejecutar('UPDATE elementos SET activo = ?, actualizado_por = ? WHERE id = ?', [activo, u.sub, id]);
    await this.auditoria.registrar({ usuarioId: u.sub, accion: activo ? 'EDITAR' : 'INACTIVAR', tabla: 'elementos', registroId: id, antes: { activo: !!antes.activo }, despues: { activo }, ip });
    return { ok: true };
  }

  /** Entrada de mercancía: suma al stock y deja un movimiento por línea. */
  async registrarEntrada(dto: EntradaDto, u: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      if (dto.proveedorId) {
        const p = await cx.uno('SELECT id FROM proveedores WHERE id = ?', [dto.proveedorId]);
        if (!p) throw new BadRequestException('El proveedor no existe');
      }
      const resumen: { elemento: string; talla: string; cantidad: number; saldo: number }[] = [];
      for (const [i, l] of dto.lineas.entries()) {
        const e = await this.paraStock(l.elementoId, u, cx, `Línea ${i + 1}`);
        const talla = this.talla(e, l.talla, `Línea ${i + 1}`);
        const saldo = await this.sumar(cx, e.id, talla, l.cantidad);
        await cx.ejecutar(
          `INSERT INTO movimientos_inventario (elemento_id, talla, tipo_movimiento, cantidad, proveedor_id, numero_factura, usuario_id, observacion)
           VALUES (?, ?, 'ENTRADA', ?, ?, ?, ?, ?)`,
          [e.id, talla, l.cantidad, dto.proveedorId ?? null, dto.numeroFactura ?? null, u.sub, dto.observacion ?? null],
        );
        resumen.push({ elemento: e.nombre, talla, cantidad: l.cantidad, saldo });
      }
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'CREAR', tabla: 'movimientos_inventario', despues: { tipo: 'ENTRADA', proveedorId: dto.proveedorId, numeroFactura: dto.numeroFactura, lineas: resumen }, ip }, cx);
      return { lineas: resumen };
    });
  }

  /** Ajuste por conteo físico, daño o pérdida en bodega. El motivo es obligatorio. */
  async ajustar(dto: AjusteDto, u: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const e = await this.paraStock(dto.elementoId, u, cx);
      const talla = this.talla(e, dto.talla);
      let saldo: number;
      if (dto.tipo === 'AJUSTE_POSITIVO') {
        saldo = await this.sumar(cx, e.id, talla, dto.cantidad);
      } else {
        saldo = await this.restar(cx, e, talla, dto.cantidad);
      }
      await cx.ejecutar(
        `INSERT INTO movimientos_inventario (elemento_id, talla, tipo_movimiento, cantidad, usuario_id, observacion)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [e.id, talla, dto.tipo, dto.cantidad, u.sub, dto.observacion],
      );
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'CREAR', tabla: 'movimientos_inventario', despues: { tipo: dto.tipo, elemento: e.nombre, talla, cantidad: dto.cantidad, saldo, motivo: dto.observacion }, ip }, cx);
      return { elemento: e.nombre, talla, saldo };
    });
  }

  async movimientos(elementoId: number, u: UsuarioToken): Promise<Movimiento[]> {
    const e = await this.obtener(elementoId);
    exigirPermiso(u, e.categoria_inventario, 'ver');
    return this.db.consultar<Movimiento>(
      `SELECT m.id, DATE_FORMAT(m.fecha, '%Y-%m-%d %H:%i') AS fecha, m.tipo_movimiento AS tipo, m.talla, m.cantidad,
              a.placa_inventario AS placa, p.nombre AS proveedor, m.numero_factura AS numeroFactura,
              ac.consecutivo AS acta, m.acta_id AS actaId, us.nombre_completo AS usuario, m.observacion,
              CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO') THEN 1
                   WHEN m.tipo_movimiento = 'ANULACION' AND ac.tipo_acta = 'ENTREGA' THEN 1
                   ELSE -1 END AS signo
         FROM movimientos_inventario m
         JOIN usuarios us ON us.id = m.usuario_id
         LEFT JOIN activos a ON a.id = m.activo_id
         LEFT JOIN proveedores p ON p.id = m.proveedor_id
         LEFT JOIN actas ac ON ac.id = m.acta_id
        WHERE m.elemento_id = ?
        ORDER BY m.fecha DESC, m.id DESC
        LIMIT 500`,
      [elementoId],
    );
  }

  // ---------- Operaciones de stock que también usan las actas (Fase 4b) ----------

  /** Suma al saldo y devuelve el saldo nuevo. */
  async sumar(cx: Conexion, elementoId: number, talla: string, cantidad: number): Promise<number> {
    await cx.ejecutar(
      `INSERT INTO existencias (elemento_id, talla, cantidad) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
      [elementoId, talla, cantidad],
    );
    const f = await cx.uno<{ cantidad: number }>('SELECT cantidad FROM existencias WHERE elemento_id = ? AND talla = ?', [elementoId, talla]);
    return f!.cantidad;
  }

  /** Resta del saldo; si no alcanza, explica cuánto hay. */
  async restar(cx: Conexion, e: { id: number; nombre: string }, talla: string, cantidad: number, prefijo = ''): Promise<number> {
    const f = await cx.uno<{ cantidad: number }>(
      'SELECT cantidad FROM existencias WHERE elemento_id = ? AND talla = ? FOR UPDATE',
      [e.id, talla],
    );
    const hay = f?.cantidad ?? 0;
    if (hay < cantidad) {
      const t = talla === 'UNICA' ? '' : ` talla ${talla}`;
      throw new BadRequestException(`${prefijo ? prefijo + ': ' : ''}no hay suficiente "${e.nombre}"${t}. Hay ${hay} y se necesitan ${cantidad}`);
    }
    await cx.ejecutar('UPDATE existencias SET cantidad = cantidad - ? WHERE elemento_id = ? AND talla = ?', [cantidad, e.id, talla]);
    return hay - cantidad;
  }

  /** Elemento por cantidad, activo, y con permiso de gestión. */
  async paraStock(id: number, u: UsuarioToken, cx: Conexion = this.db, prefijo = ''): Promise<FilaElemento> {
    const e = await cx.uno<FilaElemento>('SELECT * FROM elementos WHERE id = ?', [id]);
    const p = prefijo ? `${prefijo}: ` : '';
    if (!e) throw new BadRequestException(`${p}el elemento no existe`);
    exigirPermiso(u, e.categoria_inventario, 'gestionar');
    if (e.controla_por_unidad) throw new BadRequestException(`${p}"${e.nombre}" se maneja por unidad con placa. Regístrelo en Equipos y muebles`);
    if (!e.activo) throw new BadRequestException(`${p}"${e.nombre}" está inactivo`);
    return e;
  }

  talla(e: FilaElemento, talla: unknown, prefijo = ''): string {
    const t = normalizarTalla(talla, !!e.maneja_tallas);
    if (!t) throw new BadRequestException(`${prefijo ? prefijo + ': ' : ''}indique la talla de "${e.nombre}"`);
    return t;
  }

  // ---------- Auxiliares ----------

  /** Aplica las reglas de la categoría: solo dotación y EPP manejan tallas; solo EPP tiene norma y vida útil. */
  private reglas(categoria: Categoria, dto: ElementoDto) {
    const def = CATEGORIAS[categoria];
    const esEpp = categoria === 'EPP';
    if (esEpp && !dto.vidaUtilDias) throw new BadRequestException('Indique la vida útil del EPP en días: con ella se calcula la fecha de reposición');
    return {
      nombre: dto.nombre,
      subcategoria: dto.subcategoria ?? null,
      unidad: dto.unidad,
      porUnidad: def.porUnidad,
      manejaTallas: def.tallas && !!dto.manejaTallas,
      normaCertificacion: esEpp ? (dto.normaCertificacion ?? null) : null,
      vidaUtilDias: esEpp ? (dto.vidaUtilDias ?? null) : null,
      stockMinimo: def.porUnidad ? null : (dto.stockMinimo ?? null),
    };
  }

  private duplicado(error: unknown, categoria: Categoria, nombre: string): never {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw new ConflictException(`Ya existe "${nombre}" en el inventario de ${CATEGORIAS[categoria].titulo}`);
    }
    throw error;
  }
}

/** Orden natural de tallas: XS, S, M, L, XL, XXL… y luego números. */
const ORDEN_LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
export function ordenTalla(a: string, b: string): number {
  const ia = ORDEN_LETRAS.indexOf(a);
  const ib = ORDEN_LETRAS.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, 'es');
}
