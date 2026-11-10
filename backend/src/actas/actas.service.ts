import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import { type Categoria, CATEGORIAS, normalizarTalla } from '../inventario/categorias.js';
import { ActivosService } from '../inventario/activos.service.js';
import { ElementosService } from '../inventario/elementos.service.js';
import type { ActaAntiguaDto, DevolucionDto, EntregaDto } from './dto/acta.dto.js';
import { type DatosPdf, type LineaPdf, PdfActaService } from './pdf-acta.service.js';
import {
  CATEGORIA_DE_PLANTILLA, CONDICION_TEXTO, fechaCorta, fechaLarga, sumarDias, type Motivo, MOTIVOS, MOTIVOS_POR_PLANTILLA, NOMBRE_PLANTILLA,
  PERMISO_ACTA, type Plantilla, rellenar, siglaDocumento, textoPeriodo,
} from './textos.js';

interface FilaActa {
  id: number;
  consecutivo: string;
  tipo_acta: 'ENTREGA' | 'DEVOLUCION';
  es_historica: number;
  plantilla_id: number;
  plantilla: Plantilla;
  colaborador_id: number;
  usuario_id: number;
  colaborador_anterior_id: number | null;
  fecha: string;
  fecha_entrega_original: string | null;
  ciudad: string;
  ubicacion: string | null;
  motivo: Motivo;
  periodo_dotacion_id: number | null;
  firmante_entrega_nombre: string;
  firmante_entrega_cargo: string;
  firmante_recibe_nombre: string;
  firmante_recibe_cargo: string;
  observaciones: string | null;
  estado: 'PENDIENTE_ACTA' | 'COMPLETA' | 'ANULADA';
  ruta_pdf_generado: string | null;
  ruta_acta_firmada: string | null;
  ruta_soporte_original: string | null;
  planilla_id: number | null;
  fecha_carga_firmada: string | null;
  motivo_anulacion: string | null;
  anulada_en: string | null;
  creado_en: string;
}

interface Colaborador {
  id: number;
  nombre: string;
  sexo: string;
  estado: string;
  tipoDoc: string;
  numeroDoc: string;
  cargo: string;
  derechoDotacion: string;
}

interface ActivoBloqueado {
  id: number;
  placa_inventario: string;
  elemento_id: number;
  categoria_inventario: Categoria;
  estado: string;
  condicion: string;
  colaborador_actual_id: number | null;
  nombre: string;
}

export interface LineaActa {
  id: number;
  fechaReposicion: string | null;
  repuesto: number;
  elementoId: number;
  elemento: string;
  categoria: Categoria;
  unidad: string;
  activoId: number | null;
  placa: string | null;
  serial: string | null;
  marca: string | null;
  modelo: string | null;
  talla: string;
  cantidad: number;
  condicion: string | null;
  observaciones: string | null;
}

export interface Acta {
  id: number;
  consecutivo: string;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  plantilla: Plantilla;
  plantillaNombre: string;
  esHistorica: boolean;
  colaboradorId: number;
  colaborador: string;
  colaboradorAnteriorId: number | null;
  colaboradorAnterior: string | null;
  fecha: string;
  fechaEntregaOriginal: string | null;
  motivo: Motivo;
  motivoTexto: string;
  periodo: string | null;
  ubicacion: string | null;
  observaciones: string | null;
  estado: 'PENDIENTE_ACTA' | 'COMPLETA' | 'ANULADA';
  registradaPor: string;
  creadoEn: string;
  tieneFirmada: boolean;
  tieneSoporte: boolean;
  planillaId: number | null;
  planilla: string | null;
  fechaCargaFirmada: string | null;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  lineas: LineaActa[];
}

export interface FilaListaActa {
  id: number;
  consecutivo: string;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  plantilla: Plantilla;
  esHistorica: boolean;
  colaboradorId: number;
  colaborador: string;
  documento: string;
  fecha: string;
  motivo: Motivo;
  estado: 'PENDIENTE_ACTA' | 'COMPLETA' | 'ANULADA';
  elementos: number;
  resumen: string;
  registradaPor: string;
}

/** Hoy en Colombia, como 'YYYY-MM-DD'. */
export function hoyColombia(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * Entregas, traspasos y devoluciones con su acta (RF-35 a RF-38, RF-72 a RF-75, RF-80 a RF-85).
 * Todo lo de un acta se guarda en una sola transacción: encabezado, líneas, inventario y movimientos.
 */
@Injectable()
export class ActasService {
  private readonly logger = new Logger(ActasService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
    private readonly archivos: ArchivosService,
    private readonly elementos: ElementosService,
    private readonly activosSrv: ActivosService,
    private readonly pdf: PdfActaService,
  ) {}

  // =====================================================================
  //  Entregas y traspasos
  // =====================================================================

  async crearEntrega(dto: EntregaDto, u: UsuarioToken, ip?: string): Promise<Acta> {
    const id = await this.db.transaccion((cx) => this.entregaEn(cx, dto, u, ip));
    await this.guardarPdf(id);
    return this.obtener(id, u);
  }

  /** Registra la entrega dentro de una transacción abierta y devuelve el id del acta. */
  async entregaEn(cx: Conexion, dto: EntregaDto, u: UsuarioToken, ip?: string, historica?: { fechaOriginal: string }, planillaId?: number): Promise<number> {
    const plantilla = dto.plantilla;
    this.exigir(u, plantilla);
    const categoria = CATEGORIA_DE_PLANTILLA[plantilla];
    const def = CATEGORIAS[categoria];
    const traspaso = !!dto.colaboradorAnteriorId;
    const motivo = (traspaso ? 'TRASPASO' : dto.motivo) as Motivo;

    if (!historica && dto.fecha > hoyColombia()) throw new BadRequestException('La fecha de entrega no puede ser posterior a hoy');
    if (!MOTIVOS_POR_PLANTILLA[plantilla].includes(motivo)) throw new BadRequestException('El motivo no corresponde a este tipo de acta');
    if (motivo === 'TRASPASO' && !traspaso) throw new BadRequestException('Para un traspaso seleccione el colaborador que tenía los elementos');
    if (traspaso && !def.porUnidad) throw new BadRequestException('Solo los equipos y muebles se pueden traspasar');
    if (traspaso && historica) throw new BadRequestException('Un acta antigua no puede ser un traspaso');
    if (traspaso && dto.colaboradorAnteriorId === dto.colaboradorId) throw new BadRequestException('El colaborador que recibe debe ser distinto del que entrega');

    {
      const colaborador = await this.colaborador(dto.colaboradorId, cx);
      if (colaborador.estado !== 'ACTIVO' && !historica) throw new BadRequestException(`${colaborador.nombre} está retirado: no puede recibir entregas`);
      const anterior = traspaso ? await this.colaborador(dto.colaboradorAnteriorId!, cx) : null;

      let periodoId: number | null = null;
      if (plantilla === 'DOTACION') {
        if (motivo === 'DOTACION_PERIODICA' && !dto.periodoDotacionId) throw new BadRequestException('Seleccione el período de dotación');
        if (dto.periodoDotacionId) {
          const p = await cx.uno('SELECT id FROM periodos_dotacion WHERE id = ?', [dto.periodoDotacionId]);
          if (!p) throw new BadRequestException('El período de dotación no existe');
          periodoId = dto.periodoDotacionId;
        }
      }

      // --- Líneas ---
      const lineas: { elementoId: number; activoId: number | null; talla: string; cantidad: number; condicion: string | null; nombre: string; reposicion: string | null }[] = [];
      // La reposición del EPP se cuenta desde la entrega real (en actas antiguas, la fecha original)
      const baseReposicion = historica?.fechaOriginal ?? dto.fecha;
      const vistos = new Set<string>();
      for (const [i, l] of dto.lineas.entries()) {
        const n = `Línea ${i + 1}`;
        if (def.porUnidad) {
          if (!l.activoId) throw new BadRequestException(`${n}: seleccione el equipo o mueble`);
          if (vistos.has(`a${l.activoId}`)) throw new BadRequestException(`${n}: ese activo ya está en el acta`);
          vistos.add(`a${l.activoId}`);
          const a = await this.activoBloqueado(l.activoId, cx);
          if (a.categoria_inventario !== categoria) throw new BadRequestException(`${n}: ${a.placa_inventario} no es de ${def.titulo}`);
          if (traspaso) {
            if (a.estado !== 'ASIGNADO' || a.colaborador_actual_id !== anterior!.id) {
              throw new BadRequestException(`${n}: ${a.placa_inventario} no está asignado a ${anterior!.nombre}`);
            }
          } else if (a.estado !== 'DISPONIBLE') {
            throw new BadRequestException(`${n}: ${a.placa_inventario} ${await this.porQueNoDisponible(a, cx)}`);
          }
          lineas.push({ elementoId: a.elemento_id, activoId: a.id, talla: 'UNICA', cantidad: 1, condicion: a.condicion, nombre: a.nombre, reposicion: null });
        } else {
          if (!l.elementoId) throw new BadRequestException(`${n}: seleccione el elemento`);
          if (!l.cantidad) throw new BadRequestException(`${n}: escriba la cantidad`);
          const e = await this.elementos.obtener(l.elementoId, cx);
          if (e.categoria_inventario !== categoria) throw new BadRequestException(`${n}: "${e.nombre}" no es de ${def.titulo}`);
          if (!e.activo) throw new BadRequestException(`${n}: "${e.nombre}" está inactivo`);
          const talla = normalizarTalla(l.talla, !!e.maneja_tallas);
          if (!talla) throw new BadRequestException(`${n}: indique la talla de "${e.nombre}"`);
          const clave = `e${e.id}-${talla}`;
          if (vistos.has(clave)) throw new BadRequestException(`${n}: "${e.nombre}"${talla === 'UNICA' ? '' : ' talla ' + talla} está repetido; sume las cantidades en una sola línea`);
          vistos.add(clave);
          // Las actas antiguas no descuentan: el stock que se cargó es el que hay hoy en bodega
          if (!historica) await this.elementos.restar(cx, e, talla, l.cantidad, n);
          let reposicion: string | null = null;
          if (categoria === 'EPP') {
            reposicion = l.fechaReposicion ?? (e.vida_util_dias ? sumarDias(baseReposicion, e.vida_util_dias) : null);
            if (!reposicion) throw new BadRequestException(`${n}: "${e.nombre}" no tiene vida útil; indique la fecha de reposición`);
            if (reposicion <= baseReposicion) throw new BadRequestException(`${n}: la fecha de reposición debe ser posterior a la entrega`);
          }
          lineas.push({ elementoId: e.id, activoId: null, talla, cantidad: l.cantidad, condicion: 'NUEVO', nombre: e.nombre, reposicion });
        }
      }

      const usuario = await this.usuario(u.sub, cx);
      const actaId = await this.insertarActa(cx, {
        tipo: 'ENTREGA', plantilla, historica, colaborador, usuarioId: u.sub, anteriorId: anterior?.id ?? null, fecha: dto.fecha,
        ubicacion: plantilla === 'MUEBLES' ? (dto.ubicacion ?? null) : null, motivo, periodoId, observaciones: dto.observaciones ?? null, planillaId: planillaId ?? null,
        entrega: { nombre: usuario.nombre_completo, cargo: usuario.cargo },
        recibe: { nombre: colaborador.nombre, cargo: colaborador.cargo },
      });

      for (const l of lineas) {
        await cx.ejecutar(
          `INSERT INTO actas_detalle (acta_id, elemento_id, activo_id, talla, cantidad, condicion, fecha_reposicion) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [actaId, l.elementoId, l.activoId, l.talla, l.cantidad, l.condicion, l.reposicion],
        );
        if (l.reposicion) {
          // El EPP anterior del mismo tipo queda repuesto: se desecha y deja de alertar
          await cx.ejecutar(
            `UPDATE actas_detalle d JOIN actas a ON a.id = d.acta_id
                SET d.repuesto = 1, d.repuesto_en_acta_id = ?
              WHERE a.colaborador_id = ? AND d.elemento_id = ? AND d.repuesto = 0 AND d.fecha_reposicion IS NOT NULL
                AND a.estado <> 'ANULADA' AND d.acta_id <> ?`,
            [actaId, colaborador.id, l.elementoId, actaId],
          );
        }
        if (l.activoId) {
          await cx.ejecutar('UPDATE activos SET estado = ?, colaborador_actual_id = ?, actualizado_por = ? WHERE id = ?', ['ASIGNADO', colaborador.id, u.sub, l.activoId]);
        }
        if (l.activoId || !historica) {
          const obs = traspaso ? `Traspaso de ${anterior!.nombre} a ${colaborador.nombre}` : historica ? `Acta antigua: entregado a ${colaborador.nombre}` : `Entregado a ${colaborador.nombre}`;
          await cx.ejecutar(
            `INSERT INTO movimientos_inventario (elemento_id, talla, activo_id, tipo_movimiento, cantidad, acta_id, usuario_id, observacion)
             VALUES (?, ?, ?, 'SALIDA', ?, ?, ?, ?)`,
            [l.elementoId, l.talla, l.activoId, l.cantidad, actaId, u.sub, obs],
          );
        }
      }
      await this.auditoria.registrar({
        usuarioId: u.sub, accion: 'CREAR', tabla: 'actas', registroId: actaId,
        despues: { tipo: 'ENTREGA', plantilla, colaborador: colaborador.nombre, motivo, traspasoDe: anterior?.nombre ?? null, historica: !!historica, lineas: lineas.map((l) => ({ elemento: l.nombre, talla: l.talla, cantidad: l.cantidad, activoId: l.activoId })) },
        ip,
      }, cx);
      return actaId;
    }
  }

  // =====================================================================
  //  Actas antiguas (entregas hechas antes del sistema)
  // =====================================================================

  /**
   * Registra una entrega que se hizo antes del sistema, con su acta escaneada.
   * Crea con placa los equipos y muebles que aún no estaban registrados, no descuenta stock,
   * y toma un consecutivo nuevo. Con la fecha original, el escaneo cuenta como acta firmada;
   * con la fecha de hoy, el acta nueva queda pendiente de firma y el escaneo queda como soporte.
   */
  async crearAntigua(dto: ActaAntiguaDto, archivo: Buffer | undefined, u: UsuarioToken, ip?: string): Promise<Acta> {
    this.exigir(u, dto.plantilla);
    if (!archivo) throw new BadRequestException('Adjunte el acta escaneada');
    const hoy = hoyColombia();
    if (dto.fechaOriginal > hoy) throw new BadRequestException('La fecha de la entrega no puede ser posterior a hoy');
    const maxMb = await this.config.numero('tamano_max_archivo_mb', 10);
    // El archivo se valida y guarda primero; si algo falla después, solo queda un archivo sin usar
    const soporte = await this.archivos.guardar(archivo, `actas/${hoy.slice(0, 4)}/originales`, ['pdf', 'jpg', 'png'], maxMb);
    const porUnidad = dto.plantilla === 'EQUIPOS' || dto.plantilla === 'MUEBLES';

    const id = await this.db.transaccion(async (cx) => {
      const lineas: EntregaDto['lineas'] = [];
      for (const [i, l] of dto.lineas.entries()) {
        if (porUnidad && l.nuevo) {
          const [creado] = await this.activosSrv.crearEn(cx, { ...l.nuevo, cantidad: 1 }, u, ip, ' (registrado desde un acta antigua)');
          lineas.push({ activoId: creado.id });
        } else if (porUnidad && !l.activoId) {
          throw new BadRequestException(`Línea ${i + 1}: registre los datos del equipo o mueble`);
        } else {
          lineas.push({ activoId: l.activoId ?? null, elementoId: l.elementoId ?? null, talla: l.talla ?? null, cantidad: l.cantidad ?? null });
        }
      }
      const actaId = await this.entregaEn(cx, {
        plantilla: dto.plantilla,
        colaboradorId: dto.colaboradorId,
        fecha: dto.usarFechaHoy ? hoy : dto.fechaOriginal,
        motivo: dto.motivo,
        periodoDotacionId: dto.periodoDotacionId ?? null,
        ubicacion: dto.ubicacion ?? null,
        observaciones: dto.observaciones ?? null,
        lineas,
      } as EntregaDto, u, ip, { fechaOriginal: dto.fechaOriginal });
      await cx.ejecutar(
        dto.usarFechaHoy
          ? 'UPDATE actas SET ruta_soporte_original = ? WHERE id = ?'
          : `UPDATE actas SET ruta_soporte_original = ?, ruta_acta_firmada = ?, fecha_carga_firmada = NOW(), estado = 'COMPLETA' WHERE id = ?`,
        dto.usarFechaHoy ? [soporte.ruta, actaId] : [soporte.ruta, soporte.ruta, actaId],
      );
      return actaId;
    });

    await this.guardarPdf(id);
    return this.obtener(id, u);
  }

  async rutaSoporte(id: number): Promise<{ ruta: string; nombre: string }> {
    const a = await this.filaActa(id);
    if (!a.ruta_soporte_original) throw new NotFoundException('Esta acta no tiene documento original');
    return { ruta: a.ruta_soporte_original, nombre: `${a.consecutivo}_original.${a.ruta_soporte_original.split('.').pop()}` };
  }

  // =====================================================================
  //  Devoluciones
  // =====================================================================

  async crearDevolucion(dto: DevolucionDto, u: UsuarioToken, ip?: string): Promise<Acta> {
    this.exigir(u, 'DEVOLUCION');
    const motivo = dto.motivo as Motivo;
    if (dto.fecha > hoyColombia()) throw new BadRequestException('La fecha de devolución no puede ser posterior a hoy');
    if (!MOTIVOS_POR_PLANTILLA.DEVOLUCION.includes(motivo)) throw new BadRequestException('El motivo no corresponde a una devolución');

    const id = await this.db.transaccion(async (cx) => {
      const colaborador = await this.colaborador(dto.colaboradorId, cx);
      const tenencia = await this.cantidadesEnPoder(colaborador.id, cx);
      const lineas: { elementoId: number; activoId: number | null; talla: string; cantidad: number; condicion: string; observaciones: string | null; quedaEn?: string; reingresa: boolean; nombre: string }[] = [];
      const vistos = new Set<string>();

      for (const [i, l] of dto.lineas.entries()) {
        const n = `Línea ${i + 1}`;
        if (l.activoId) {
          if (vistos.has(`a${l.activoId}`)) throw new BadRequestException(`${n}: ese activo ya está en el acta`);
          vistos.add(`a${l.activoId}`);
          const a = await this.activoBloqueado(l.activoId, cx);
          if (a.estado !== 'ASIGNADO' || a.colaborador_actual_id !== colaborador.id) {
            throw new BadRequestException(`${n}: ${a.placa_inventario} no está asignado a ${colaborador.nombre}`);
          }
          lineas.push({ elementoId: a.elemento_id, activoId: a.id, talla: 'UNICA', cantidad: 1, condicion: l.condicion, observaciones: l.observaciones ?? null, quedaEn: l.quedaEn ?? 'DISPONIBLE', reingresa: false, nombre: `${a.placa_inventario} ${a.nombre}` });
        } else {
          if (!l.elementoId || !l.cantidad) throw new BadRequestException(`${n}: indique el elemento y la cantidad`);
          const e = await this.elementos.obtener(l.elementoId, cx);
          if (CATEGORIAS[e.categoria_inventario].porUnidad) throw new BadRequestException(`${n}: los equipos y muebles se devuelven por placa`);
          if (e.categoria_inventario === 'DOTACION' && !u.permisos.includes(PERMISO_ACTA.DOTACION)) {
            throw new ForbiddenException('No tiene permiso para registrar devoluciones de dotación');
          }
          const talla = normalizarTalla(l.talla, !!e.maneja_tallas) ?? 'UNICA';
          const clave = `e${e.id}-${talla}`;
          if (vistos.has(clave)) throw new BadRequestException(`${n}: "${e.nombre}" está repetido`);
          vistos.add(clave);
          const tiene = tenencia.find((t) => t.elementoId === e.id && t.talla === talla)?.cantidad ?? 0;
          if (l.cantidad > tiene) {
            throw new BadRequestException(`${n}: ${colaborador.nombre} tiene ${tiene} de "${e.nombre}"${talla === 'UNICA' ? '' : ' talla ' + talla} según las actas, no ${l.cantidad}`);
          }
          const reingresa = l.reingresa ?? l.condicion !== 'MALO';
          if (reingresa) await this.elementos.sumar(cx, e.id, talla, l.cantidad);
          lineas.push({ elementoId: e.id, activoId: null, talla, cantidad: l.cantidad, condicion: l.condicion, observaciones: l.observaciones ?? null, reingresa, nombre: e.nombre });
        }
      }

      const usuario = await this.usuario(u.sub, cx);
      const actaId = await this.insertarActa(cx, {
        tipo: 'DEVOLUCION', plantilla: 'DEVOLUCION', colaborador, usuarioId: u.sub, anteriorId: null, fecha: dto.fecha, ubicacion: null,
        motivo, periodoId: null, observaciones: dto.observaciones ?? null,
        // En la devolución firma ENTREGA el colaborador y RECIBE el usuario
        entrega: { nombre: colaborador.nombre, cargo: colaborador.cargo },
        recibe: { nombre: usuario.nombre_completo, cargo: usuario.cargo },
      });

      for (const l of lineas) {
        await cx.ejecutar(
          `INSERT INTO actas_detalle (acta_id, elemento_id, activo_id, talla, cantidad, condicion, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [actaId, l.elementoId, l.activoId, l.talla, l.cantidad, l.condicion, l.observaciones],
        );
        if (l.activoId) {
          await cx.ejecutar(
            'UPDATE activos SET estado = ?, colaborador_actual_id = NULL, condicion = ?, actualizado_por = ? WHERE id = ?',
            [l.quedaEn, l.condicion, u.sub, l.activoId],
          );
          await cx.ejecutar(
            `INSERT INTO movimientos_inventario (elemento_id, activo_id, tipo_movimiento, cantidad, acta_id, usuario_id, observacion)
             VALUES (?, ?, 'DEVOLUCION', 1, ?, ?, ?)`,
            [l.elementoId, l.activoId, actaId, u.sub, `Devuelto por ${colaborador.nombre}${l.quedaEn === 'EN_REPARACION' ? '; pasa a reparación' : ''}`],
          );
          if (l.quedaEn === 'DADO_DE_BAJA') {
            await cx.ejecutar(
              `INSERT INTO movimientos_inventario (elemento_id, activo_id, tipo_movimiento, cantidad, acta_id, usuario_id, observacion)
               VALUES (?, ?, 'BAJA', 1, ?, ?, ?)`,
              [l.elementoId, l.activoId, actaId, u.sub, l.observaciones ?? 'Dado de baja al recibirlo en la devolución'],
            );
          }
        } else if (l.reingresa) {
          await cx.ejecutar(
            `INSERT INTO movimientos_inventario (elemento_id, talla, tipo_movimiento, cantidad, acta_id, usuario_id, observacion)
             VALUES (?, ?, 'DEVOLUCION', ?, ?, ?, ?)`,
            [l.elementoId, l.talla, l.cantidad, actaId, u.sub, `Devuelto por ${colaborador.nombre}`],
          );
        }
      }
      await this.auditoria.registrar({
        usuarioId: u.sub, accion: 'CREAR', tabla: 'actas', registroId: actaId,
        despues: { tipo: 'DEVOLUCION', colaborador: colaborador.nombre, motivo, lineas: lineas.map((l) => ({ elemento: l.nombre, talla: l.talla, cantidad: l.cantidad, condicion: l.condicion, quedaEn: l.quedaEn, reingresa: l.reingresa })) },
        ip,
      }, cx);
      return actaId;
    });

    await this.guardarPdf(id);
    return this.obtener(id, u);
  }

  // =====================================================================
  //  Anulación
  // =====================================================================

  /**
   * Anula el acta y deshace su efecto en el inventario, solo si nada posterior tocó los mismos activos.
   * El acta no se borra: queda marcada como ANULADA con su motivo.
   */
  async anular(id: number, motivo: string, u: UsuarioToken, ip?: string): Promise<Acta> {
    await this.db.transaccion(async (cx) => {
      const acta = await this.filaActa(id, cx, true);
      this.exigir(u, acta.plantilla);
      if (acta.estado === 'ANULADA') throw new BadRequestException('El acta ya está anulada');
      const detalle = await cx.consultar<{ elemento_id: number; activo_id: number | null; talla: string; cantidad: number; nombre: string }>(
        `SELECT d.elemento_id, d.activo_id, d.talla, d.cantidad, e.nombre
           FROM actas_detalle d JOIN elementos e ON e.id = d.elemento_id WHERE d.acta_id = ?`,
        [id],
      );
      const historica = !!acta.es_historica;

      for (const d of detalle) {
        if (d.activo_id) {
          const a = await this.activoBloqueado(d.activo_id, cx);
          // Último movimiento vigente del activo (se ignoran los de actas ya anuladas)
          const ultimo = await cx.uno<{ acta_id: number | null }>(
            `SELECT m.acta_id FROM movimientos_inventario m LEFT JOIN actas x ON x.id = m.acta_id
              WHERE m.activo_id = ? AND (x.id IS NULL OR x.estado <> 'ANULADA')
              ORDER BY m.id DESC LIMIT 1`,
            [d.activo_id],
          );
          const sigueIgual = acta.tipo_acta === 'ENTREGA'
            ? a.estado === 'ASIGNADO' && a.colaborador_actual_id === acta.colaborador_id
            : a.estado !== 'ASIGNADO';
          if (ultimo?.acta_id !== id || !sigueIgual) {
            throw new BadRequestException(`No se puede anular: ${a.placa_inventario} tuvo movimientos después de esta acta. Anule primero las actas posteriores`);
          }
          let destino: string;
          if (acta.tipo_acta === 'ENTREGA') {
            const vuelveA = acta.colaborador_anterior_id;
            await cx.ejecutar('UPDATE activos SET estado = ?, colaborador_actual_id = ?, actualizado_por = ? WHERE id = ?',
              [vuelveA ? 'ASIGNADO' : 'DISPONIBLE', vuelveA, u.sub, d.activo_id]);
            destino = vuelveA ? `vuelve a ${(await this.colaborador(vuelveA, cx)).nombre}` : 'vuelve a bodega';
          } else {
            await cx.ejecutar('UPDATE activos SET estado = ?, colaborador_actual_id = ?, actualizado_por = ? WHERE id = ?',
              ['ASIGNADO', acta.colaborador_id, u.sub, d.activo_id]);
            destino = `vuelve a ${(await this.colaborador(acta.colaborador_id, cx)).nombre}`;
          }
          await cx.ejecutar(
            `INSERT INTO movimientos_inventario (elemento_id, activo_id, tipo_movimiento, cantidad, acta_id, usuario_id, observacion)
             VALUES (?, ?, 'ANULACION', 1, ?, ?, ?)`,
            [d.elemento_id, d.activo_id, id, u.sub, destino],
          );
        } else if (acta.tipo_acta === 'ENTREGA' && !historica) {
          await this.elementos.sumar(cx, d.elemento_id, d.talla, d.cantidad);
          await this.movimientoAnulacion(cx, d, id, u.sub, 'vuelve a bodega');
        } else if (acta.tipo_acta === 'DEVOLUCION') {
          const reingreso = await cx.uno<{ n: number }>(
            `SELECT COUNT(*) AS n FROM movimientos_inventario WHERE acta_id = ? AND elemento_id = ? AND talla = ? AND tipo_movimiento = 'DEVOLUCION' AND activo_id IS NULL`,
            [id, d.elemento_id, d.talla],
          );
          if (Number(reingreso?.n) > 0) {
            await this.elementos.restar(cx, { id: d.elemento_id, nombre: d.nombre }, d.talla, d.cantidad, 'No se puede anular');
            await this.movimientoAnulacion(cx, d, id, u.sub, 'sale de bodega');
          }
        }
      }

      // Los EPP que esta acta había dejado como repuestos vuelven a estar vigentes
      await cx.ejecutar('UPDATE actas_detalle SET repuesto = 0, repuesto_en_acta_id = NULL WHERE repuesto_en_acta_id = ?', [id]);
      await cx.ejecutar(
        `UPDATE actas SET estado = 'ANULADA', motivo_anulacion = ?, anulada_por = ?, anulada_en = NOW() WHERE id = ?`,
        [motivo, u.sub, id],
      );
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'ANULAR', tabla: 'actas', registroId: id, antes: { estado: acta.estado }, despues: { estado: 'ANULADA', motivo }, ip }, cx);
    });
    await this.guardarPdf(id); // el PDF queda con la marca de anulada
    return this.obtener(id, u);
  }

  // =====================================================================
  //  Consultas
  // =====================================================================

  async listar(u: UsuarioToken, filtros: { colaboradorId?: number } = {}): Promise<FilaListaActa[]> {
    const params: unknown[] = [];
    let donde = '';
    if (filtros.colaboradorId) {
      donde = 'WHERE a.colaborador_id = ?';
      params.push(filtros.colaboradorId);
    }
    return (await this.db.consultar<Omit<FilaListaActa, 'esHistorica'> & { esHistorica: number }>(
      `SELECT a.id, a.consecutivo, a.tipo_acta AS tipo, p.plantilla, a.es_historica AS esHistorica,
              a.colaborador_id AS colaboradorId, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
              CONCAT(td.codigo, ' ', c.numero_documento) AS documento, a.fecha, a.motivo, a.estado,
              (SELECT COALESCE(SUM(d.cantidad), 0) FROM actas_detalle d WHERE d.acta_id = a.id) AS elementos,
              (SELECT GROUP_CONCAT(COALESCE(ac.placa_inventario, e.nombre) ORDER BY d.id SEPARATOR ', ')
                 FROM actas_detalle d JOIN elementos e ON e.id = d.elemento_id LEFT JOIN activos ac ON ac.id = d.activo_id
                WHERE d.acta_id = a.id) AS resumen,
              us.nombre_completo AS registradaPor
         FROM actas a
         JOIN plantillas_acta p ON p.id = a.plantilla_id
         JOIN colaboradores c ON c.id = a.colaborador_id
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN usuarios us ON us.id = a.usuario_id
         ${donde}
        ORDER BY a.id DESC
        LIMIT 2000`,
      params,
    )).map((f) => ({ ...f, esHistorica: !!f.esHistorica, elementos: Number(f.elementos), resumen: f.resumen ?? '' }));
  }

  async obtener(id: number, _u: UsuarioToken | null): Promise<Acta> {
    const a = await this.filaActa(id);
    const extra = await this.db.uno<{ colaborador: string; anterior: string | null; periodo_numero: number | null; periodo_anio: number | null; registrada_por: string; planilla: string | null }>(
      `SELECT CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, CONCAT(an.nombres, ' ', an.apellidos) AS anterior,
              pd.numero AS periodo_numero, pd.anio AS periodo_anio, us.nombre_completo AS registrada_por, pl.consecutivo AS planilla
         FROM actas a
         LEFT JOIN planillas_epp pl ON pl.id = a.planilla_id
         JOIN colaboradores c ON c.id = a.colaborador_id
         LEFT JOIN colaboradores an ON an.id = a.colaborador_anterior_id
         LEFT JOIN periodos_dotacion pd ON pd.id = a.periodo_dotacion_id
         JOIN usuarios us ON us.id = a.usuario_id
        WHERE a.id = ?`,
      [id],
    );
    return {
      id: a.id,
      consecutivo: a.consecutivo,
      tipo: a.tipo_acta,
      plantilla: a.plantilla,
      plantillaNombre: NOMBRE_PLANTILLA[a.plantilla],
      esHistorica: !!a.es_historica,
      colaboradorId: a.colaborador_id,
      colaborador: extra!.colaborador,
      colaboradorAnteriorId: a.colaborador_anterior_id,
      colaboradorAnterior: extra!.anterior,
      fecha: a.fecha,
      fechaEntregaOriginal: a.fecha_entrega_original,
      motivo: a.motivo,
      motivoTexto: MOTIVOS[a.motivo].etiqueta,
      periodo: extra!.periodo_numero ? textoPeriodo(extra!.periodo_numero, extra!.periodo_anio!) : null,
      ubicacion: a.ubicacion,
      observaciones: a.observaciones,
      estado: a.estado,
      registradaPor: extra!.registrada_por,
      creadoEn: a.creado_en,
      tieneFirmada: !!a.ruta_acta_firmada,
      tieneSoporte: !!a.ruta_soporte_original,
      planillaId: a.planilla_id,
      planilla: extra!.planilla,
      fechaCargaFirmada: a.fecha_carga_firmada,
      motivoAnulacion: a.motivo_anulacion,
      anuladaEn: a.anulada_en,
      lineas: await this.lineas(id),
    };
  }

  /** Lo que el colaborador tiene en su poder: activos asignados y elementos por cantidad según las actas. */
  async tenencia(colaboradorId: number) {
    await this.colaborador(colaboradorId, this.db);
    const activos = await this.db.consultar<{ id: number; placa: string; elemento: string; categoria: Categoria; serial: string | null; marca: string | null; modelo: string | null; condicion: string; desde: string | null; acta: string | null; actaId: number | null }>(
      `SELECT a.id, a.placa_inventario AS placa, e.nombre AS elemento, e.categoria_inventario AS categoria, a.serial, a.marca, a.modelo, a.condicion,
              (SELECT DATE_FORMAT(ac.fecha, '%Y-%m-%d') FROM movimientos_inventario m JOIN actas ac ON ac.id = m.acta_id
                WHERE m.activo_id = a.id AND m.tipo_movimiento = 'SALIDA' ORDER BY m.id DESC LIMIT 1) AS desde,
              (SELECT ac.consecutivo FROM movimientos_inventario m JOIN actas ac ON ac.id = m.acta_id
                WHERE m.activo_id = a.id AND m.tipo_movimiento = 'SALIDA' ORDER BY m.id DESC LIMIT 1) AS acta,
              (SELECT m.acta_id FROM movimientos_inventario m
                WHERE m.activo_id = a.id AND m.tipo_movimiento = 'SALIDA' ORDER BY m.id DESC LIMIT 1) AS actaId
         FROM activos a JOIN elementos e ON e.id = a.elemento_id
        WHERE a.colaborador_actual_id = ? AND a.estado = 'ASIGNADO'
        ORDER BY a.placa_inventario`,
      [colaboradorId],
    );
    const cantidades = await this.cantidadesEnPoder(colaboradorId, this.db);
    const dotacion = await this.db.consultar<{ periodoId: number; numero: number; anio: number; consecutivo: string; actaId: number; fecha: string }>(
      `SELECT pd.id AS periodoId, pd.numero, pd.anio, a.consecutivo, a.id AS actaId, a.fecha
         FROM actas a JOIN periodos_dotacion pd ON pd.id = a.periodo_dotacion_id
        WHERE a.colaborador_id = ? AND a.estado <> 'ANULADA'
        ORDER BY pd.anio DESC, pd.numero DESC`,
      [colaboradorId],
    );
    const tallas = await this.db.consultar<{ tipo: string; talla: string }>(
      'SELECT tipo_talla AS tipo, talla FROM colaborador_tallas WHERE colaborador_id = ? ORDER BY FIELD(tipo_talla, "CAMISA", "PANTALON", "CALZADO", "GUANTES", "OVEROL", "OTRA")',
      [colaboradorId],
    );
    return { activos, cantidades, dotacion, tallas };
  }

  /** Períodos de dotación del año anterior, el actual y el siguiente; crea los que falten (Art. 232 CST). */
  async periodos() {
    const anio = Number(hoyColombia().slice(0, 4));
    for (const a of [anio, anio + 1]) {
      await this.db.ejecutar(
        `INSERT IGNORE INTO periodos_dotacion (anio, numero, fecha_limite) VALUES (?, 1, ?), (?, 2, ?), (?, 3, ?)`,
        [a, `${a}-04-30`, a, `${a}-08-31`, a, `${a}-12-20`],
      );
    }
    const filas = await this.db.consultar<{ id: number; anio: number; numero: number; fechaLimite: string }>(
      `SELECT id, anio, numero, fecha_limite AS fechaLimite FROM periodos_dotacion WHERE anio BETWEEN ? AND ? ORDER BY anio, numero`,
      [anio - 1, anio + 1],
    );
    const hoy = hoyColombia();
    const actual = filas.find((p) => p.fechaLimite >= hoy)?.id ?? null;
    return { periodos: filas.map((p) => ({ ...p, texto: textoPeriodo(p.numero, p.anio) })), actual };
  }

  // =====================================================================
  //  Archivos: PDF generado y acta firmada
  // =====================================================================

  /** PDF del acta; si no existe en disco (o cambió el estado), lo genera de nuevo. */
  async pdfGenerado(id: number): Promise<{ contenido: Buffer | null; ruta: string | null; nombre: string }> {
    const a = await this.filaActa(id);
    const nombre = `${a.consecutivo}.pdf`;
    if (a.ruta_pdf_generado && (await this.archivos.existe(a.ruta_pdf_generado))) return { contenido: null, ruta: a.ruta_pdf_generado, nombre };
    const contenido = await this.guardarPdf(id);
    return { contenido, ruta: null, nombre };
  }

  async subirFirmada(id: number, contenido: Buffer | undefined, u: UsuarioToken, ip?: string): Promise<Acta> {
    const a = await this.filaActa(id);
    this.exigir(u, a.plantilla);
    if (a.estado === 'ANULADA') throw new BadRequestException('El acta está anulada');
    if (!contenido) throw new BadRequestException('Seleccione el archivo del acta firmada');
    const maxMb = await this.config.numero('tamano_max_archivo_mb', 10);
    const g = await this.archivos.guardar(contenido, `actas/${a.consecutivo.slice(4, 8)}/firmadas`, ['pdf', 'jpg', 'png'], maxMb);
    await this.db.ejecutar(
      `UPDATE actas SET ruta_acta_firmada = ?, fecha_carga_firmada = NOW(), estado = 'COMPLETA' WHERE id = ?`,
      [g.ruta, id],
    );
    await this.auditoria.registrar({
      usuarioId: u.sub, accion: 'EDITAR', tabla: 'actas', registroId: id,
      antes: { estado: a.estado, firmada: a.ruta_acta_firmada }, despues: { estado: 'COMPLETA', firmada: g.ruta }, ip,
    });
    return this.obtener(id, u);
  }

  async rutaFirmada(id: number): Promise<{ ruta: string; nombre: string }> {
    const a = await this.filaActa(id);
    if (!a.ruta_acta_firmada) throw new NotFoundException('Aún no se ha cargado el acta firmada');
    const ext = a.ruta_acta_firmada.split('.').pop();
    return { ruta: a.ruta_acta_firmada, nombre: `${a.consecutivo}_firmada.${ext}` };
  }

  /** Genera el PDF con los datos guardados del acta y lo guarda en la carpeta de archivos. */
  async guardarPdf(id: number): Promise<Buffer | null> {
    try {
      const datos = await this.datosPdf(id);
      const contenido = await this.pdf.generar(datos);
      const ruta = await this.archivos.guardarGenerado(contenido, `actas/${datos.consecutivo.slice(4, 8)}/${datos.consecutivo}.pdf`);
      await this.db.ejecutar('UPDATE actas SET ruta_pdf_generado = ? WHERE id = ?', [ruta, id]);
      return contenido;
    } catch (error) {
      // El acta ya quedó guardada; el PDF se vuelve a intentar al descargarlo
      this.logger.error(`No se pudo generar el PDF del acta ${id}: ${(error as Error).message}`);
      return null;
    }
  }

  async datosPdf(id: number, cx: Conexion = this.db): Promise<DatosPdf> {
    const a = await this.filaActa(id, cx);
    const plantilla = await cx.uno<{ titulo: string; texto_introduccion: string; texto_manifiesta: string; clausulas: string }>(
      'SELECT titulo, texto_introduccion, texto_manifiesta, clausulas FROM plantillas_acta WHERE id = ?',
      [a.plantilla_id],
    );
    const colaborador = await this.colaborador(a.colaborador_id, cx);
    const anterior = a.colaborador_anterior_id ? await this.colaborador(a.colaborador_anterior_id, cx) : null;
    const periodo = a.periodo_dotacion_id
      ? await cx.uno<{ numero: number; anio: number }>('SELECT numero, anio FROM periodos_dotacion WHERE id = ?', [a.periodo_dotacion_id])
      : null;
    const empresa = await this.config.texto('empresa_nombre', 'DRIM DUIT S.A.S.');
    const pie = (await this.config.texto('pie_actas', '')).split(/\s*\|\s*|\n/).map((r) => r.trim()).filter(Boolean);

    const devolucion = a.tipo_acta === 'DEVOLUCION';
    // El cargo se toma de la copia guardada al registrar, para que el acta no cambie si el colaborador cambia de cargo
    const cargo = devolucion ? a.firmante_entrega_cargo : a.firmante_recibe_cargo;
    const campos = {
      sexo: colaborador.sexo,
      nombre: colaborador.nombre,
      tipoDoc: colaborador.tipoDoc,
      numeroDoc: colaborador.numeroDoc,
      cargo,
      empresa,
      periodo: periodo ? textoPeriodo(periodo.numero, periodo.anio) : '',
      motivo: MOTIVOS[a.motivo].frase,
      ubicacion: a.ubicacion,
      anterior: anterior ? { sexo: anterior.sexo, nombre: anterior.nombre, cargo: anterior.cargo } : null,
    };
    let introduccion = rellenar(plantilla!.texto_introduccion, campos);
    // Plantillas sin {{TRASPASO}} (muebles): la frase va al final de la introducción
    if (anterior && !plantilla!.texto_introduccion.includes('{{TRASPASO}}')) {
      introduccion = `${introduccion.replace(/:$/, '.')} ${rellenar('{{TRASPASO}}', campos).replace(/^\.\s*/, '')}`;
    }
    const clausulas = (JSON.parse(plantilla!.clausulas) as string[]).map((c) => rellenar(c, campos));
    const documento = `${siglaDocumento(colaborador.tipoDoc)} ${colaborador.numeroDoc}`;

    const lineas: LineaPdf[] = (await this.lineas(id, cx)).map((l) => ({
      cantidad: l.cantidad,
      unidad: l.unidad,
      descripcion: l.activoId ? [l.elemento, l.observacionesActivo].filter(Boolean).join(', ') : l.elemento,
      talla: l.talla,
      marcaModelo: [l.marca, l.modelo].filter(Boolean).join(' ') || null,
      serialPlaca: l.activoId ? [l.serial, l.placa].filter(Boolean).join('\n') : null,
      placa: l.placa,
      estado: l.condicion ? CONDICION_TEXTO[l.condicion] : null,
      observaciones: l.observaciones,
      reposicion: l.fechaReposicion ? fechaCorta(l.fechaReposicion) : null,
    }));

    const nota = a.es_historica
      ? `Acta registrada en el sistema el ${fechaLarga(a.creado_en)} a partir del documento original${a.fecha_entrega_original ? ` de la entrega del ${fechaLarga(a.fecha_entrega_original)}` : ''}.`
      : null;

    return {
      plantilla: a.plantilla,
      consecutivo: a.consecutivo,
      ciudad: a.ciudad,
      fecha: a.fecha,
      titulo: plantilla!.titulo,
      destinatario: { tratamiento: colaborador.sexo === 'F' ? 'Señora' : 'Señor', nombre: colaborador.nombre, cargo },
      introduccion,
      manifiesta: rellenar(plantilla!.texto_manifiesta, campos),
      clausulas,
      lineas,
      observaciones: a.observaciones,
      firmas: devolucion
        ? [
          { titulo: 'ENTREGA:', nombre: a.firmante_entrega_nombre, cargo: a.firmante_entrega_cargo, documento },
          { titulo: 'RECIBE:', nombre: a.firmante_recibe_nombre, cargo: a.firmante_recibe_cargo },
        ]
        : [
          { titulo: 'ENTREGA:', nombre: a.firmante_entrega_nombre, cargo: a.firmante_entrega_cargo },
          { titulo: 'RECIBE A CONFORMIDAD:', nombre: a.firmante_recibe_nombre, cargo: a.firmante_recibe_cargo, documento },
        ],
      pie,
      nota,
      anulada: a.estado === 'ANULADA' ? a.motivo_anulacion : null,
    };
  }

  // =====================================================================
  //  Auxiliares
  // =====================================================================

  private exigir(u: UsuarioToken, plantilla: Plantilla) {
    if (!u.permisos.includes(PERMISO_ACTA[plantilla])) {
      throw new ForbiddenException(`No tiene permiso para registrar actas de ${NOMBRE_PLANTILLA[plantilla].toLowerCase()}`);
    }
  }

  private async insertarActa(cx: Conexion, d: {
    tipo: 'ENTREGA' | 'DEVOLUCION'; plantilla: Plantilla; historica?: { fechaOriginal: string }; colaborador: Colaborador; usuarioId: number;
    anteriorId: number | null; fecha: string; ubicacion: string | null; motivo: Motivo; periodoId: number | null; observaciones: string | null;
    planillaId?: number | null; entrega: { nombre: string; cargo: string }; recibe: { nombre: string; cargo: string };
  }): Promise<number> {
    const plantilla = await cx.uno<{ id: number }>(
      'SELECT id FROM plantillas_acta WHERE plantilla = ? AND vigente = 1 ORDER BY version DESC LIMIT 1',
      [d.plantilla],
    );
    if (!plantilla) throw new BadRequestException(`No hay una plantilla vigente para actas de ${NOMBRE_PLANTILLA[d.plantilla].toLowerCase()}`);
    const consecutivo = await this.siguienteConsecutivo(cx);
    const ciudad = await this.config.texto('ciudad_actas', 'Palmira');
    const r = await cx.ejecutar(
      `INSERT INTO actas (consecutivo, tipo_acta, es_historica, plantilla_id, colaborador_id, usuario_id, colaborador_anterior_id, fecha,
                          fecha_entrega_original, ciudad, ubicacion, motivo, periodo_dotacion_id, planilla_id, firmante_entrega_nombre, firmante_entrega_cargo,
                          firmante_recibe_nombre, firmante_recibe_cargo, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_ACTA')`,
      [consecutivo, d.tipo, d.historica ? 1 : 0, plantilla.id, d.colaborador.id, d.usuarioId, d.anteriorId, d.fecha,
        d.historica?.fechaOriginal ?? null, ciudad, d.ubicacion, d.motivo, d.periodoId, d.planillaId ?? null, d.entrega.nombre, d.entrega.cargo,
        d.recibe.nombre, d.recibe.cargo, d.observaciones],
    );
    return r.insertId;
  }

  /** ACT-2026-0001: consecutivo por año de registro, reservado con bloqueo para que no se repita. */
  async siguienteConsecutivo(cx: Conexion): Promise<string> {
    const anio = Number(hoyColombia().slice(0, 4));
    const prefijo = await this.config.texto('prefijo_acta', 'ACT');
    await cx.ejecutar('INSERT IGNORE INTO consecutivos_acta (anio, ultimo) VALUES (?, 0)', [anio]);
    const fila = await cx.uno<{ ultimo: number }>('SELECT ultimo FROM consecutivos_acta WHERE anio = ? FOR UPDATE', [anio]);
    const n = fila!.ultimo + 1;
    await cx.ejecutar('UPDATE consecutivos_acta SET ultimo = ? WHERE anio = ?', [n, anio]);
    return `${prefijo}-${anio}-${String(n).padStart(4, '0')}`;
  }

  private async filaActa(id: number, cx: Conexion = this.db, bloquear = false): Promise<FilaActa> {
    const a = await cx.uno<FilaActa>(
      `SELECT a.*, p.plantilla, DATE_FORMAT(a.creado_en, '%Y-%m-%d %H:%i') AS creado_en,
              DATE_FORMAT(a.fecha_carga_firmada, '%Y-%m-%d %H:%i') AS fecha_carga_firmada,
              DATE_FORMAT(a.anulada_en, '%Y-%m-%d %H:%i') AS anulada_en
         FROM actas a JOIN plantillas_acta p ON p.id = a.plantilla_id WHERE a.id = ?${bloquear ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!a) throw new NotFoundException('El acta no existe');
    return a;
  }

  private async lineas(actaId: number, cx: Conexion = this.db): Promise<(LineaActa & { observacionesActivo: string | null })[]> {
    return cx.consultar(
      `SELECT d.id, d.elemento_id AS elementoId, e.nombre AS elemento, e.categoria_inventario AS categoria, e.unidad,
              d.activo_id AS activoId, ac.placa_inventario AS placa, ac.serial, ac.marca, ac.modelo,
              ac.descripcion_adicional AS observacionesActivo, d.talla, d.cantidad, d.condicion, d.observaciones,
              DATE_FORMAT(d.fecha_reposicion, '%Y-%m-%d') AS fechaReposicion, d.repuesto
         FROM actas_detalle d
         JOIN elementos e ON e.id = d.elemento_id
         LEFT JOIN activos ac ON ac.id = d.activo_id
        WHERE d.acta_id = ?
        ORDER BY d.id`,
      [actaId],
    );
  }

  private async colaborador(id: number, cx: Conexion): Promise<Colaborador> {
    const c = await cx.uno<Colaborador>(
      `SELECT c.id, CONCAT(c.nombres, ' ', c.apellidos) AS nombre, c.sexo, c.estado, td.codigo AS tipoDoc,
              c.numero_documento AS numeroDoc, cg.nombre AS cargo, c.derecho_dotacion AS derechoDotacion
         FROM colaboradores c
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN cargos cg ON cg.id = c.cargo_id
        WHERE c.id = ?`,
      [id],
    );
    if (!c) throw new BadRequestException('El colaborador no existe');
    return c;
  }

  private async usuario(id: number, cx: Conexion) {
    const u = await cx.uno<{ nombre_completo: string; cargo: string }>('SELECT nombre_completo, cargo FROM usuarios WHERE id = ?', [id]);
    if (!u) throw new BadRequestException('El usuario no existe');
    return u;
  }

  private async activoBloqueado(id: number, cx: Conexion): Promise<ActivoBloqueado> {
    const a = await cx.uno<ActivoBloqueado>(
      `SELECT a.id, a.placa_inventario, a.elemento_id, e.categoria_inventario, a.estado, a.condicion, a.colaborador_actual_id, e.nombre
         FROM activos a JOIN elementos e ON e.id = a.elemento_id WHERE a.id = ? FOR UPDATE`,
      [id],
    );
    if (!a) throw new BadRequestException('El equipo o mueble no existe');
    return a;
  }

  private async porQueNoDisponible(a: ActivoBloqueado, cx: Conexion): Promise<string> {
    if (a.estado === 'EN_REPARACION') return 'está en reparación';
    if (a.estado === 'DADO_DE_BAJA') return 'está dado de baja';
    const c = await cx.uno<{ nombre: string }>("SELECT CONCAT(nombres, ' ', apellidos) AS nombre FROM colaboradores WHERE id = ?", [a.colaborador_actual_id]);
    return `ya está asignado a ${c?.nombre ?? 'otro colaborador'}. Use un traspaso`;
  }

  /** Elementos por cantidad (dotación y otros) que tiene el colaborador: entregados menos devueltos. */
  private async cantidadesEnPoder(colaboradorId: number, cx: Conexion) {
    const filas = await cx.consultar<{ elementoId: number; elemento: string; categoria: Categoria; unidad: string; manejaTallas: number; talla: string; cantidad: number }>(
      `SELECT d.elemento_id AS elementoId, e.nombre AS elemento, e.categoria_inventario AS categoria, e.unidad, e.maneja_tallas AS manejaTallas, d.talla,
              SUM(CASE WHEN a.tipo_acta = 'ENTREGA' THEN d.cantidad ELSE -d.cantidad END) AS cantidad
         FROM actas_detalle d
         JOIN actas a ON a.id = d.acta_id
         JOIN elementos e ON e.id = d.elemento_id
        WHERE a.colaborador_id = ? AND a.estado <> 'ANULADA' AND d.activo_id IS NULL AND e.categoria_inventario IN ('DOTACION', 'OTRO')
        GROUP BY d.elemento_id, d.talla
        HAVING cantidad > 0
        ORDER BY e.categoria_inventario, e.nombre, d.talla`,
      [colaboradorId],
    );
    return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad), manejaTallas: !!f.manejaTallas }));
  }

  private async movimientoAnulacion(cx: Conexion, d: { elemento_id: number; talla: string; cantidad: number }, actaId: number, usuarioId: number, obs: string) {
    await cx.ejecutar(
      `INSERT INTO movimientos_inventario (elemento_id, talla, tipo_movimiento, cantidad, acta_id, usuario_id, observacion)
       VALUES (?, ?, 'ANULACION', ?, ?, ?, ?)`,
      [d.elemento_id, d.talla, d.cantidad, actaId, usuarioId, obs],
    );
  }
}
