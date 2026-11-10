import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import { ActasService, hoyColombia } from './actas.service.js';
import type { EntregaDto } from './dto/acta.dto.js';
import type { MatrizCargoDto, PlanillaDto } from './dto/epp.dto.js';
import { PdfActaService } from './pdf-acta.service.js';
import { fechaCorta, type Motivo, MOTIVOS, rellenar, siglaDocumento } from './textos.js';

export type EstadoEpp = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'SIN_ENTREGAR';

/**
 * EPP: matriz por cargo, estado de cada colaborador frente a su matriz, lista de reposiciones
 * y entregas grupales en planilla (RF-42 a RF-47, RN-08).
 */
@Injectable()
export class EppService {
  private readonly logger = new Logger(EppService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
    private readonly archivos: ArchivosService,
    private readonly actas: ActasService,
    private readonly pdf: PdfActaService,
  ) {}

  // ---------- Matriz por cargo ----------

  async matriz() {
    const cargos = await this.db.consultar<{ id: number; nombre: string; area: string | null; riesgo: number | null; colaboradores: number }>(
      `SELECT cg.id, cg.nombre, ar.nombre AS area, cg.nivel_riesgo_arl AS riesgo,
              (SELECT COUNT(*) FROM colaboradores c WHERE c.cargo_id = cg.id AND c.estado = 'ACTIVO') AS colaboradores
         FROM cargos cg LEFT JOIN areas ar ON ar.id = cg.area_id
        WHERE cg.activo = 1 ORDER BY cg.nombre`,
    );
    const items = await this.db.consultar<{ cargo_id: number; elemento_id: number; nombre: string; cantidad: number; observacion: string | null; vida: number | null; activo: number }>(
      `SELECT m.cargo_id, m.elemento_id, e.nombre, m.cantidad, m.observacion, e.vida_util_dias AS vida, e.activo
         FROM matriz_epp_cargo m JOIN elementos e ON e.id = m.elemento_id ORDER BY e.nombre`,
    );
    return cargos.map((c) => ({
      ...c,
      colaboradores: Number(c.colaboradores),
      items: items.filter((i) => i.cargo_id === c.id).map((i) => ({ elementoId: i.elemento_id, nombre: i.nombre, cantidad: i.cantidad, observacion: i.observacion, vidaUtilDias: i.vida, activo: !!i.activo })),
    }));
  }

  async guardarMatriz(cargoId: number, dto: MatrizCargoDto, u: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const cargo = await cx.uno<{ nombre: string }>('SELECT nombre FROM cargos WHERE id = ?', [cargoId]);
      if (!cargo) throw new NotFoundException('El cargo no existe');
      const ids = [...new Set(dto.items.map((i) => i.elementoId))];
      if (ids.length !== dto.items.length) throw new BadRequestException('Hay EPP repetidos en la lista');
      if (ids.length) {
        const validos = await cx.consultar<{ id: number }>("SELECT id FROM elementos WHERE id IN (?) AND categoria_inventario = 'EPP'", [ids]);
        if (validos.length !== ids.length) throw new BadRequestException('Algún elemento de la lista no es un EPP');
      }
      const antes = await cx.consultar('SELECT elemento_id, cantidad FROM matriz_epp_cargo WHERE cargo_id = ?', [cargoId]);
      await cx.ejecutar('DELETE FROM matriz_epp_cargo WHERE cargo_id = ?', [cargoId]);
      for (const i of dto.items) {
        await cx.ejecutar('INSERT INTO matriz_epp_cargo (cargo_id, elemento_id, cantidad, observacion) VALUES (?, ?, ?, ?)', [cargoId, i.elementoId, i.cantidad, i.observacion ?? null]);
      }
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'matriz_epp_cargo', registroId: cargoId, antes, despues: dto.items, ip }, cx);
      return { ok: true, cargo: cargo.nombre, items: dto.items.length };
    });
  }

  // ---------- Estado de un colaborador ----------

  /** EPP que requiere su cargo, con lo último que recibió de cada uno, más lo entregado que no está en la matriz. */
  async estadoColaborador(colaboradorId: number) {
    const c = await this.db.uno<{ id: number; cargo_id: number; cargo: string; estado: string }>(
      'SELECT c.id, c.cargo_id, cg.nombre AS cargo, c.estado FROM colaboradores c JOIN cargos cg ON cg.id = c.cargo_id WHERE c.id = ?',
      [colaboradorId],
    );
    if (!c) throw new NotFoundException('El colaborador no existe');
    const diasAlerta = await this.config.numero('dias_alerta_epp', 15);
    const hoy = hoyColombia();
    const requeridos = await this.db.consultar<{ elemento_id: number; nombre: string; cantidad: number; maneja_tallas: number; vida: number | null }>(
      `SELECT m.elemento_id, e.nombre, m.cantidad, e.maneja_tallas, e.vida_util_dias AS vida
         FROM matriz_epp_cargo m JOIN elementos e ON e.id = m.elemento_id
        WHERE m.cargo_id = ? AND e.activo = 1 ORDER BY e.nombre`,
      [c.cargo_id],
    );
    const vigentes = await this.db.consultar<{ elemento_id: number; nombre: string; talla: string; cantidad: number; fecha: string; reposicion: string; acta: string; acta_id: number }>(
      `SELECT d.elemento_id, e.nombre, d.talla, d.cantidad, DATE_FORMAT(COALESCE(a.fecha_entrega_original, a.fecha), '%Y-%m-%d') AS fecha,
              DATE_FORMAT(d.fecha_reposicion, '%Y-%m-%d') AS reposicion, a.consecutivo AS acta, a.id AS acta_id
         FROM actas_detalle d JOIN actas a ON a.id = d.acta_id JOIN elementos e ON e.id = d.elemento_id
        WHERE a.colaborador_id = ? AND a.estado <> 'ANULADA' AND a.tipo_acta = 'ENTREGA'
          AND e.categoria_inventario = 'EPP' AND d.repuesto = 0 AND d.fecha_reposicion IS NOT NULL
        ORDER BY d.fecha_reposicion`,
      [colaboradorId],
    );
    const estado = (reposicion: string | undefined): EstadoEpp => {
      if (!reposicion) return 'SIN_ENTREGAR';
      if (reposicion < hoy) return 'VENCIDO';
      return diasEntre(hoy, reposicion) <= diasAlerta ? 'POR_VENCER' : 'VIGENTE';
    };
    const filas = requeridos.map((r) => {
      const v = vigentes.find((x) => x.elemento_id === r.elemento_id);
      return {
        elementoId: r.elemento_id, nombre: r.nombre, requerido: true, cantidadRequerida: r.cantidad, manejaTallas: !!r.maneja_tallas,
        talla: v?.talla ?? null, cantidad: v?.cantidad ?? 0, entregado: v?.fecha ?? null, reposicion: v?.reposicion ?? null,
        dias: v ? diasEntre(hoy, v.reposicion) : null, acta: v?.acta ?? null, actaId: v?.acta_id ?? null, estado: estado(v?.reposicion),
      };
    });
    for (const v of vigentes.filter((x) => !requeridos.some((r) => r.elemento_id === x.elemento_id))) {
      filas.push({
        elementoId: v.elemento_id, nombre: v.nombre, requerido: false, cantidadRequerida: 0, manejaTallas: v.talla !== 'UNICA',
        talla: v.talla, cantidad: v.cantidad, entregado: v.fecha, reposicion: v.reposicion, dias: diasEntre(hoy, v.reposicion),
        acta: v.acta, actaId: v.acta_id, estado: estado(v.reposicion),
      });
    }
    return { cargo: c.cargo, diasAlerta, retirado: c.estado !== 'ACTIVO', epp: filas };
  }

  // ---------- Reposiciones (lista de trabajo de SST) ----------

  /** EPP vencidos o por vencer, y EPP que el cargo exige y la persona nunca ha recibido. */
  async reposiciones() {
    const diasAlerta = await this.config.numero('dias_alerta_epp', 15);
    const porReponer = await this.db.consultar<{ detalleId: number; actaId: number; acta: string; colaboradorId: number; colaborador: string; cargo: string; elementoId: number; epp: string; talla: string; cantidad: number; reposicion: string; dias: number }>(
      `SELECT d.id AS detalleId, a.id AS actaId, a.consecutivo AS acta, c.id AS colaboradorId, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
              cg.nombre AS cargo, e.id AS elementoId, e.nombre AS epp, d.talla, d.cantidad,
              DATE_FORMAT(d.fecha_reposicion, '%Y-%m-%d') AS reposicion, DATEDIFF(d.fecha_reposicion, ?) AS dias
         FROM actas_detalle d
         JOIN actas a ON a.id = d.acta_id
         JOIN elementos e ON e.id = d.elemento_id
         JOIN colaboradores c ON c.id = a.colaborador_id
         JOIN cargos cg ON cg.id = c.cargo_id
        WHERE e.categoria_inventario = 'EPP' AND a.tipo_acta = 'ENTREGA' AND a.estado <> 'ANULADA'
          AND d.repuesto = 0 AND d.fecha_reposicion IS NOT NULL AND c.estado = 'ACTIVO'
          AND DATEDIFF(d.fecha_reposicion, ?) <= ?
        ORDER BY d.fecha_reposicion, colaborador`,
      [hoyColombia(), hoyColombia(), diasAlerta],
    );
    const sinEntregar = await this.db.consultar<{ colaboradorId: number; colaborador: string; cargo: string; elementoId: number; epp: string; cantidad: number }>(
      `SELECT c.id AS colaboradorId, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, cg.nombre AS cargo,
              e.id AS elementoId, e.nombre AS epp, m.cantidad
         FROM colaboradores c
         JOIN cargos cg ON cg.id = c.cargo_id
         JOIN matriz_epp_cargo m ON m.cargo_id = c.cargo_id
         JOIN elementos e ON e.id = m.elemento_id AND e.activo = 1
        WHERE c.estado = 'ACTIVO'
          AND NOT EXISTS (
            SELECT 1 FROM actas_detalle d JOIN actas a ON a.id = d.acta_id
             WHERE a.colaborador_id = c.id AND d.elemento_id = e.id AND a.estado <> 'ANULADA' AND a.tipo_acta = 'ENTREGA' AND d.repuesto = 0)
        ORDER BY colaborador, e.nombre`,
    );
    return { diasAlerta, porReponer: porReponer.map((p) => ({ ...p, dias: Number(p.dias) })), sinEntregar };
  }

  // ---------- Planillas (entrega grupal) ----------

  async crearPlanilla(dto: PlanillaDto, u: UsuarioToken, ip?: string) {
    if (!u.permisos.includes('actas_epp.gestionar')) throw new ForbiddenException('No tiene permiso para registrar entregas de EPP');
    if (dto.fecha > hoyColombia()) throw new BadRequestException('La fecha de entrega no puede ser posterior a hoy');
    const ids = dto.personas.map((p) => p.colaboradorId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay personas repetidas en la planilla');

    const { planillaId, actas } = await this.db.transaccion(async (cx) => {
      const usuario = await cx.uno<{ nombre_completo: string; cargo: string }>('SELECT nombre_completo, cargo FROM usuarios WHERE id = ?', [u.sub]);
      const consecutivo = await this.siguienteConsecutivo(cx);
      const r = await cx.ejecutar(
        `INSERT INTO planillas_epp (consecutivo, fecha, motivo, usuario_id, firmante_nombre, firmante_cargo, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [consecutivo, dto.fecha, dto.motivo, u.sub, usuario!.nombre_completo, usuario!.cargo, dto.observaciones ?? null],
      );
      const actas: number[] = [];
      for (const [i, p] of dto.personas.entries()) {
        try {
          actas.push(await this.actas.entregaEn(cx, {
            plantilla: 'EPP', colaboradorId: p.colaboradorId, fecha: dto.fecha, motivo: dto.motivo,
            observaciones: dto.observaciones ?? null, lineas: p.lineas,
          } as EntregaDto, u, ip, undefined, r.insertId));
        } catch (error) {
          // Se indica de quién es el error para que se pueda corregir en la lista
          if (error instanceof BadRequestException) {
            const persona = await cx.uno<{ nombre: string }>("SELECT CONCAT(nombres, ' ', apellidos) AS nombre FROM colaboradores WHERE id = ?", [p.colaboradorId]);
            throw new BadRequestException(`Persona ${i + 1} (${persona?.nombre ?? 'desconocida'}): ${(error.getResponse() as { message: string }).message}`);
          }
          throw error;
        }
      }
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'CREAR', tabla: 'planillas_epp', registroId: r.insertId, despues: { consecutivo, personas: ids.length, actas }, ip }, cx);
      return { planillaId: r.insertId, actas };
    });

    for (const id of actas) await this.actas.guardarPdf(id);
    await this.guardarPdfPlanilla(planillaId);
    return this.obtenerPlanilla(planillaId);
  }

  async listarPlanillas() {
    return (await this.db.consultar<{ id: number; consecutivo: string; fecha: string; motivo: Motivo; personas: number; anuladas: number; firmada: number; registradaPor: string }>(
      `SELECT p.id, p.consecutivo, DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha, p.motivo,
              (SELECT COUNT(*) FROM actas a WHERE a.planilla_id = p.id) AS personas,
              (SELECT COUNT(*) FROM actas a WHERE a.planilla_id = p.id AND a.estado = 'ANULADA') AS anuladas,
              p.ruta_planilla_firmada IS NOT NULL AS firmada, p.firmante_nombre AS registradaPor
         FROM planillas_epp p ORDER BY p.id DESC LIMIT 500`,
    )).map((p) => ({ ...p, personas: Number(p.personas), anuladas: Number(p.anuladas), firmada: !!p.firmada, motivoTexto: MOTIVOS[p.motivo]?.etiqueta ?? p.motivo }));
  }

  async obtenerPlanilla(id: number) {
    const p = await this.db.uno<{ id: number; consecutivo: string; fecha: string; motivo: Motivo; observaciones: string | null; firmante_nombre: string; ruta_planilla_firmada: string | null; fecha_carga_firmada: string | null; creado_en: string }>(
      `SELECT id, consecutivo, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, motivo, observaciones, firmante_nombre, ruta_planilla_firmada,
              DATE_FORMAT(fecha_carga_firmada, '%Y-%m-%d %H:%i') AS fecha_carga_firmada, DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i') AS creado_en
         FROM planillas_epp WHERE id = ?`,
      [id],
    );
    if (!p) throw new NotFoundException('La planilla no existe');
    const actas = await this.db.consultar<{ id: number; consecutivo: string; estado: string; colaboradorId: number; colaborador: string; documento: string; cargo: string }>(
      `SELECT a.id, a.consecutivo, a.estado, a.colaborador_id AS colaboradorId, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
              CONCAT(td.codigo, ' ', c.numero_documento) AS documento, a.firmante_recibe_cargo AS cargo
         FROM actas a JOIN colaboradores c ON c.id = a.colaborador_id JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
        WHERE a.planilla_id = ? ORDER BY a.id`,
      [id],
    );
    const lineas = actas.length ? await this.db.consultar<{ acta_id: number; epp: string; talla: string; cantidad: number; unidad: string; reposicion: string }>(
      `SELECT d.acta_id, e.nombre AS epp, d.talla, d.cantidad, e.unidad, DATE_FORMAT(d.fecha_reposicion, '%Y-%m-%d') AS reposicion
         FROM actas_detalle d JOIN elementos e ON e.id = d.elemento_id WHERE d.acta_id IN (?) ORDER BY d.id`,
      [actas.map((a) => a.id)],
    ) : [];
    return {
      id: p.id, consecutivo: p.consecutivo, fecha: p.fecha, motivo: p.motivo, motivoTexto: MOTIVOS[p.motivo]?.etiqueta ?? p.motivo,
      observaciones: p.observaciones, registradaPor: p.firmante_nombre, creadoEn: p.creado_en,
      firmada: !!p.ruta_planilla_firmada, fechaCargaFirmada: p.fecha_carga_firmada,
      personas: actas.map((a) => ({ ...a, lineas: lineas.filter((l) => l.acta_id === a.id).map(({ acta_id: _, ...l }) => l) })),
    };
  }

  async pdfPlanilla(id: number): Promise<{ contenido: Buffer | null; ruta: string | null; nombre: string }> {
    const p = await this.db.uno<{ consecutivo: string; ruta_pdf_generado: string | null }>('SELECT consecutivo, ruta_pdf_generado FROM planillas_epp WHERE id = ?', [id]);
    if (!p) throw new NotFoundException('La planilla no existe');
    const nombre = `${p.consecutivo}.pdf`;
    if (p.ruta_pdf_generado && (await this.archivos.existe(p.ruta_pdf_generado))) return { contenido: null, ruta: p.ruta_pdf_generado, nombre };
    return { contenido: await this.guardarPdfPlanilla(id), ruta: null, nombre };
  }

  /** La planilla firmada se guarda una vez y completa todas las actas vigentes del grupo. */
  async subirPlanillaFirmada(id: number, contenido: Buffer | undefined, u: UsuarioToken, ip?: string) {
    if (!u.permisos.includes('actas_epp.gestionar')) throw new ForbiddenException('No tiene permiso para registrar entregas de EPP');
    if (!contenido) throw new BadRequestException('Seleccione el archivo de la planilla firmada');
    const p = await this.db.uno<{ consecutivo: string }>('SELECT consecutivo FROM planillas_epp WHERE id = ?', [id]);
    if (!p) throw new NotFoundException('La planilla no existe');
    const maxMb = await this.config.numero('tamano_max_archivo_mb', 10);
    const g = await this.archivos.guardar(contenido, `actas/${p.consecutivo.slice(4, 8)}/firmadas`, ['pdf', 'jpg', 'png'], maxMb);
    await this.db.transaccion(async (cx) => {
      await cx.ejecutar('UPDATE planillas_epp SET ruta_planilla_firmada = ?, fecha_carga_firmada = NOW() WHERE id = ?', [g.ruta, id]);
      await cx.ejecutar(
        `UPDATE actas SET ruta_acta_firmada = ?, fecha_carga_firmada = NOW(), estado = 'COMPLETA' WHERE planilla_id = ? AND estado <> 'ANULADA'`,
        [g.ruta, id],
      );
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'planillas_epp', registroId: id, despues: { firmada: g.ruta }, ip }, cx);
    });
    return this.obtenerPlanilla(id);
  }

  async rutaPlanillaFirmada(id: number) {
    const p = await this.db.uno<{ consecutivo: string; ruta_planilla_firmada: string | null }>('SELECT consecutivo, ruta_planilla_firmada FROM planillas_epp WHERE id = ?', [id]);
    if (!p?.ruta_planilla_firmada) throw new NotFoundException('Aún no se ha cargado la planilla firmada');
    return { ruta: p.ruta_planilla_firmada, nombre: `${p.consecutivo}_firmada.${p.ruta_planilla_firmada.split('.').pop()}` };
  }

  private async guardarPdfPlanilla(id: number): Promise<Buffer | null> {
    try {
      const p = await this.obtenerPlanilla(id);
      const plantilla = await this.db.uno<{ clausulas: string }>("SELECT clausulas FROM plantillas_acta WHERE plantilla = 'EPP' AND vigente = 1 ORDER BY version DESC LIMIT 1");
      const empresa = await this.config.texto('empresa_nombre', 'DRIM DUIT S.A.S.');
      const ciudad = await this.config.texto('ciudad_actas', 'Palmira');
      const pie = (await this.config.texto('pie_actas', '')).split(/\s*\|\s*|\n/).map((r) => r.trim()).filter(Boolean);
      const usuario = await this.db.uno<{ firmante_nombre: string; firmante_cargo: string }>('SELECT firmante_nombre, firmante_cargo FROM planillas_epp WHERE id = ?', [id]);
      // Las cláusulas del acta individual, escritas para el grupo (en masculino genérico)
      const campos = { sexo: 'M', nombre: '', tipoDoc: '', numeroDoc: '', cargo: '', empresa, motivo: MOTIVOS[p.motivo]?.frase ?? '' };
      const clausulas = (JSON.parse(plantilla?.clausulas ?? '[]') as string[]).map((c) => rellenar(c, campos));
      const contenido = await this.pdf.generarPlanilla({
        consecutivo: p.consecutivo,
        ciudad,
        fecha: p.fecha,
        empresa,
        motivo: MOTIVOS[p.motivo]?.frase ?? '',
        clausulas,
        observaciones: p.observaciones,
        personas: p.personas.filter((a) => a.estado !== 'ANULADA').map((a) => ({
          nombre: a.colaborador,
          documento: siglaDocumento(a.documento.split(' ')[0]) + ' ' + a.documento.split(' ').slice(1).join(' '),
          cargo: a.cargo,
          epp: a.lineas.map((l) => `${l.cantidad} ${l.unidad.toLowerCase()} ${l.epp}${l.talla !== 'UNICA' ? ` (talla ${l.talla})` : ''}`),
          reposicion: [...new Set(a.lineas.map((l) => fechaCorta(l.reposicion)))].join('\n'),
        })),
        entrega: { nombre: usuario!.firmante_nombre, cargo: usuario!.firmante_cargo },
        pie,
      });
      const ruta = await this.archivos.guardarGenerado(contenido, `actas/${p.consecutivo.slice(4, 8)}/${p.consecutivo}.pdf`);
      await this.db.ejecutar('UPDATE planillas_epp SET ruta_pdf_generado = ? WHERE id = ?', [ruta, id]);
      return contenido;
    } catch (error) {
      this.logger.error(`No se pudo generar el PDF de la planilla ${id}: ${(error as Error).message}`);
      return null;
    }
  }

  private async siguienteConsecutivo(cx: Conexion): Promise<string> {
    const anio = Number(hoyColombia().slice(0, 4));
    await cx.ejecutar('INSERT IGNORE INTO consecutivos_planilla (anio, ultimo) VALUES (?, 0)', [anio]);
    const f = await cx.uno<{ ultimo: number }>('SELECT ultimo FROM consecutivos_planilla WHERE anio = ? FOR UPDATE', [anio]);
    const n = f!.ultimo + 1;
    await cx.ejecutar('UPDATE consecutivos_planilla SET ultimo = ? WHERE anio = ?', [n, anio]);
    return `PLA-${anio}-${String(n).padStart(4, '0')}`;
  }
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}
