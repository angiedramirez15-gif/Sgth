import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';

export const TIPOS_ALERTA = [
  'DOCUMENTO_VENCIDO', 'DOCUMENTO_POR_VENCER', 'CONTRATO_POR_VENCER', 'EPP_REPOSICION',
  'DOTACION_PENDIENTE', 'ACTA_SIN_FIRMAR', 'ELEMENTOS_SIN_DEVOLVER',
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];
type Rol = 'TH' | 'SST' | 'TODOS';

interface AlertaCalculada {
  tipo: TipoAlerta;
  rol: Rol;
  colaboradorId: number | null;
  tabla: string;
  refId: number;
  fecha: string; // YYYY-MM-DD
  mensaje: string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
};
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/**
 * Alertas (RF-50 a RF-56). Se calculan con los datos reales y se guardan en la tabla alertas:
 * - Las nuevas entran ACTIVAS.
 * - Si la causa se soluciona (se sube el documento, se entrega el EPP…), pasan solas a ATENDIDA.
 * - Las DESCARTADAS a mano no vuelven a salir mientras la fecha del evento sea la misma.
 */
@Injectable()
export class AlertasService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AlertasService.name);
  private ultimaSincronizacion = 0;
  private sincronizando: Promise<void> | null = null;
  private reloj?: NodeJS.Timeout;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  onApplicationBootstrap() {
    // Al arrancar y luego cada hora; además se refresca al consultar si pasó más de un minuto
    setTimeout(() => this.sincronizar().catch((e) => this.logger.warn(`No se pudieron calcular las alertas: ${e.message}`)), 3000);
    this.reloj = setInterval(() => this.sincronizar().catch(() => undefined), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  /** Recalcula si la última vez fue hace más de un minuto (o si se pide forzar). */
  async asegurarAlDia(forzar = false) {
    if (!forzar && Date.now() - this.ultimaSincronizacion < 60_000) return;
    await this.sincronizar();
  }

  async sincronizar(): Promise<void> {
    if (this.sincronizando) return this.sincronizando;
    this.sincronizando = (async () => {
      const actuales = await this.calcular();
      await this.db.transaccion(async (cx) => {
        // Inserta las nuevas; las que estaban resueltas y volvieron a aplicar se reactivan; las descartadas se respetan
        for (let i = 0; i < actuales.length; i += 200) {
          const lote = actuales.slice(i, i + 200);
          await cx.ejecutar(
            `INSERT INTO alertas (tipo, rol_destino, colaborador_id, referencia_tabla, referencia_id, fecha_evento, mensaje)
             VALUES ${lote.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}
             ON DUPLICATE KEY UPDATE mensaje = VALUES(mensaje), rol_destino = VALUES(rol_destino),
               estado = IF(estado = 'ATENDIDA', 'ACTIVA', estado), atendida_en = IF(estado = 'ACTIVA', NULL, atendida_en)`,
            lote.flatMap((a) => [a.tipo, a.rol, a.colaboradorId, a.tabla, a.refId, a.fecha, a.mensaje.slice(0, 255)]),
          );
        }
        const vigentes = new Set(actuales.map((a) => clave(a.tipo, a.tabla, a.refId, a.fecha)));
        const activas = await cx.consultar<{ id: number; tipo: string; referencia_tabla: string; referencia_id: number; fecha_evento: string }>(
          "SELECT id, tipo, referencia_tabla, referencia_id, DATE_FORMAT(fecha_evento, '%Y-%m-%d') AS fecha_evento FROM alertas WHERE estado = 'ACTIVA'",
        );
        const resueltas = activas.filter((a) => !vigentes.has(clave(a.tipo, a.referencia_tabla, a.referencia_id, a.fecha_evento))).map((a) => a.id);
        if (resueltas.length) {
          await cx.ejecutar("UPDATE alertas SET estado = 'ATENDIDA', atendida_en = NOW() WHERE id IN (?)", [resueltas]);
        }
      });
      this.ultimaSincronizacion = Date.now();
    })().finally(() => {
      this.sincronizando = null;
    });
    return this.sincronizando;
  }

  // =====================================================================
  //  Reglas
  // =====================================================================

  async calcular(): Promise<AlertaCalculada[]> {
    const h = hoy();
    const [diasDoc, diasContrato, diasEpp, diasDotacion] = await Promise.all([
      this.config.numero('dias_alerta_documentos', 30),
      this.config.numero('dias_alerta_contrato', 30),
      this.config.numero('dias_alerta_epp', 15),
      this.config.numero('dias_alerta_dotacion', 15),
    ]);
    const alertas: AlertaCalculada[] = [];

    // Documentos: el aviso de cada tipo puede tener sus propios días; si no, el general
    const docs = await this.db.consultar<{ id: number; colaborador_id: number; tipo: string; vence: string; visible_sst: number }>(
      `SELECT d.id, d.colaborador_id, t.nombre AS tipo, DATE_FORMAT(d.fecha_vencimiento, '%Y-%m-%d') AS vence, t.visible_sst
         FROM documentos d
         JOIN tipos_documento_expediente t ON t.id = d.tipo_documento_id
         JOIN colaboradores c ON c.id = d.colaborador_id
        WHERE d.activo = 1 AND d.vigente = 1 AND d.fecha_vencimiento IS NOT NULL AND c.estado = 'ACTIVO'
          AND d.fecha_vencimiento <= DATE_ADD(?, INTERVAL COALESCE(t.dias_alerta, ?) DAY)`,
      [h, diasDoc],
    );
    for (const d of docs) {
      const vencido = d.vence < h;
      alertas.push({
        tipo: vencido ? 'DOCUMENTO_VENCIDO' : 'DOCUMENTO_POR_VENCER', rol: d.visible_sst ? 'TODOS' : 'TH', colaboradorId: d.colaborador_id,
        tabla: 'documentos', refId: d.id, fecha: d.vence, mensaje: `${d.tipo} ${vencido ? 'venció' : 'vence'} el ${corta(d.vence)}`,
      });
    }

    // Contratos a término fijo u obra que terminan pronto
    const contratos = await this.db.consultar<{ id: number; fin: string }>(
      `SELECT id, DATE_FORMAT(fecha_fin_contrato, '%Y-%m-%d') AS fin FROM colaboradores
        WHERE estado = 'ACTIVO' AND fecha_fin_contrato IS NOT NULL AND fecha_fin_contrato <= DATE_ADD(?, INTERVAL ? DAY)`,
      [h, diasContrato],
    );
    for (const c of contratos) {
      alertas.push({
        tipo: 'CONTRATO_POR_VENCER', rol: 'TH', colaboradorId: c.id, tabla: 'colaboradores', refId: c.id, fecha: c.fin,
        mensaje: c.fin < h ? `El contrato terminó el ${corta(c.fin)} y sigue activo` : `El contrato termina el ${corta(c.fin)}`,
      });
    }

    // EPP por reponer
    const epp = await this.db.consultar<{ id: number; colaborador_id: number; epp: string; talla: string; repone: string }>(
      `SELECT d.id, a.colaborador_id, e.nombre AS epp, d.talla, DATE_FORMAT(d.fecha_reposicion, '%Y-%m-%d') AS repone
         FROM actas_detalle d
         JOIN actas a ON a.id = d.acta_id
         JOIN elementos e ON e.id = d.elemento_id
         JOIN colaboradores c ON c.id = a.colaborador_id
        WHERE e.categoria_inventario = 'EPP' AND a.tipo_acta = 'ENTREGA' AND a.estado <> 'ANULADA' AND d.repuesto = 0
          AND d.fecha_reposicion IS NOT NULL AND c.estado = 'ACTIVO' AND d.fecha_reposicion <= DATE_ADD(?, INTERVAL ? DAY)`,
      [h, diasEpp],
    );
    for (const e of epp) {
      const nombre = `${e.epp}${e.talla !== 'UNICA' ? ` talla ${e.talla}` : ''}`;
      alertas.push({
        tipo: 'EPP_REPOSICION', rol: 'SST', colaboradorId: e.colaborador_id, tabla: 'actas_detalle', refId: e.id, fecha: e.repone,
        mensaje: e.repone < h ? `${nombre}: la reposición venció el ${corta(e.repone)}` : `${nombre}: reponer el ${corta(e.repone)}`,
      });
    }

    // Dotación del período actual, desde N días antes de la fecha límite
    alertas.push(...(await this.dotacionPendiente(h, diasDotacion)));

    // Actas sin la firmada cargada
    const actas = await this.db.consultar<{ id: number; colaborador_id: number; consecutivo: string; plantilla: string; fecha: string; planilla: string | null }>(
      `SELECT a.id, a.colaborador_id, a.consecutivo, p.plantilla, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, pl.consecutivo AS planilla
         FROM actas a JOIN plantillas_acta p ON p.id = a.plantilla_id LEFT JOIN planillas_epp pl ON pl.id = a.planilla_id
        WHERE a.estado = 'PENDIENTE_ACTA'`,
    );
    const nombres: Record<string, string> = { DOTACION: 'dotación', EPP: 'EPP', EQUIPOS: 'equipos', MUEBLES: 'muebles', OTROS: 'otros elementos', DEVOLUCION: 'devolución' };
    for (const a of actas) {
      alertas.push({
        tipo: 'ACTA_SIN_FIRMAR', rol: a.plantilla === 'EPP' ? 'SST' : 'TH', colaboradorId: a.colaborador_id, tabla: 'actas', refId: a.id, fecha: a.fecha,
        mensaje: `Acta ${a.consecutivo} de ${nombres[a.plantilla] ?? a.plantilla}${a.planilla ? ` (planilla ${a.planilla})` : ''}: falta subir la firmada`,
      });
    }

    // Retirados que todavía tienen equipos, muebles u otros elementos
    const retirados = await this.db.consultar<{ id: number; retiro: string; activos: number; otros: number }>(
      `SELECT c.id, DATE_FORMAT(c.fecha_retiro, '%Y-%m-%d') AS retiro,
              (SELECT COUNT(*) FROM activos ac WHERE ac.colaborador_actual_id = c.id AND ac.estado = 'ASIGNADO') AS activos,
              COALESCE((SELECT SUM(CASE WHEN a.tipo_acta = 'ENTREGA' THEN d.cantidad ELSE -d.cantidad END)
                          FROM actas_detalle d JOIN actas a ON a.id = d.acta_id JOIN elementos e ON e.id = d.elemento_id
                         WHERE a.colaborador_id = c.id AND a.estado <> 'ANULADA' AND d.activo_id IS NULL AND e.categoria_inventario = 'OTRO'), 0) AS otros
         FROM colaboradores c
        WHERE c.estado = 'RETIRADO' AND c.fecha_retiro IS NOT NULL`,
    );
    for (const r of retirados) {
      const total = Number(r.activos) + Math.max(Number(r.otros), 0);
      if (!total) continue;
      alertas.push({
        tipo: 'ELEMENTOS_SIN_DEVOLVER', rol: 'TH', colaboradorId: r.id, tabla: 'colaboradores', refId: r.id, fecha: r.retiro,
        mensaje: `Se retiró el ${corta(r.retiro)} y tiene ${total} elemento${total === 1 ? '' : 's'} sin devolver`,
      });
    }
    return alertas;
  }

  /** Colaboradores con derecho a dotación (RN-06) que no la han recibido en el período actual. */
  private async dotacionPendiente(h: string, dias: number): Promise<AlertaCalculada[]> {
    const anio = Number(h.slice(0, 4));
    await this.db.ejecutar(
      'INSERT IGNORE INTO periodos_dotacion (anio, numero, fecha_limite) VALUES (?, 1, ?), (?, 2, ?), (?, 3, ?)',
      [anio, `${anio}-04-30`, anio, `${anio}-08-31`, anio, `${anio}-12-20`],
    );
    const periodo = await this.db.uno<{ id: number; numero: number; anio: number; limite: string }>(
      `SELECT id, numero, anio, DATE_FORMAT(fecha_limite, '%Y-%m-%d') AS limite FROM periodos_dotacion
        WHERE fecha_limite >= ? ORDER BY fecha_limite LIMIT 1`,
      [h],
    );
    if (!periodo || periodo.limite > sumarDias(h, dias)) return [];
    const smmlv = await this.config.numero('smmlv_valor', 0);
    const tope = await this.config.numero('dotacion_tope_smmlv', 2);
    const meses = await this.config.numero('dotacion_meses_minimos', 3);
    // Con derecho "AUTO" se aplica la regla del Art. 230 CST; sin salario mínimo configurado, solo cuentan los marcados "SI"
    const filas = await this.db.consultar<{ id: number }>(
      `SELECT c.id FROM colaboradores c
        WHERE c.estado = 'ACTIVO'
          AND (c.derecho_dotacion = 'SI'
               OR (c.derecho_dotacion = 'AUTO' AND ? > 0 AND c.salario <= ? * ? AND c.fecha_ingreso <= DATE_SUB(?, INTERVAL ? MONTH)))
          AND NOT EXISTS (SELECT 1 FROM actas a WHERE a.colaborador_id = c.id AND a.periodo_dotacion_id = ? AND a.estado <> 'ANULADA')`,
      [smmlv, tope, smmlv, h, meses, periodo.id],
    );
    return filas.map((f) => ({
      tipo: 'DOTACION_PENDIENTE' as const, rol: 'TH' as const, colaboradorId: f.id, tabla: 'colaboradores', refId: f.id, fecha: periodo.limite,
      mensaje: `Falta la dotación del período ${periodo.numero} de ${periodo.anio} (límite ${corta(periodo.limite)})`,
    }));
  }

  // =====================================================================
  //  Consultas y acciones
  // =====================================================================

  /** Roles de alerta que puede ver el usuario. */
  private roles(u: UsuarioToken): Rol[] {
    const r: Rol[] = [];
    if (u.permisos.includes('alertas_th.ver')) r.push('TH');
    if (u.permisos.includes('alertas_sst.ver')) r.push('SST');
    if (r.length) r.push('TODOS');
    return r;
  }

  async listar(u: UsuarioToken, estado: 'ACTIVA' | 'DESCARTADA' | 'ATENDIDA' = 'ACTIVA') {
    await this.asegurarAlDia();
    const roles = this.roles(u);
    if (!roles.length) return [];
    const filas = await this.db.consultar<{
      id: number; tipo: TipoAlerta; colaboradorId: number | null; colaborador: string | null; cargo: string | null; referenciaTabla: string;
      referenciaId: number; fechaEvento: string; mensaje: string; estado: string; atendidaEn: string | null; atendidaPor: string | null; motivo: string | null; dias: number;
    }>(
      `SELECT al.id, al.tipo, al.colaborador_id AS colaboradorId, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, cg.nombre AS cargo,
              al.referencia_tabla AS referenciaTabla, al.referencia_id AS referenciaId, DATE_FORMAT(al.fecha_evento, '%Y-%m-%d') AS fechaEvento,
              al.mensaje, al.estado, DATE_FORMAT(al.atendida_en, '%Y-%m-%d %H:%i') AS atendidaEn, us.nombre_completo AS atendidaPor,
              al.motivo_descarte AS motivo, DATEDIFF(al.fecha_evento, ?) AS dias
         FROM alertas al
         LEFT JOIN colaboradores c ON c.id = al.colaborador_id
         LEFT JOIN cargos cg ON cg.id = c.cargo_id
         LEFT JOIN usuarios us ON us.id = al.atendida_por
        WHERE al.estado = ? AND al.rol_destino IN (?)
          ${estado === 'ACTIVA' ? '' : 'AND al.atendida_en >= DATE_SUB(NOW(), INTERVAL 90 DAY)'}
        ORDER BY ${estado === 'ACTIVA' ? 'al.fecha_evento, colaborador' : 'al.atendida_en DESC'}
        LIMIT 2000`,
      [hoy(), estado, roles],
    );
    return filas.map((f) => ({ ...f, dias: Number(f.dias) }));
  }

  /** Conteo por tipo para el panel de inicio, y avisos de configuración que impiden calcular alguna regla. */
  async resumen(u: UsuarioToken) {
    await this.asegurarAlDia();
    const roles = this.roles(u);
    const conteos = roles.length
      ? await this.db.consultar<{ tipo: TipoAlerta; total: number; vencidas: number }>(
        `SELECT tipo, COUNT(*) AS total, SUM(fecha_evento < ?) AS vencidas FROM alertas
          WHERE estado = 'ACTIVA' AND rol_destino IN (?) GROUP BY tipo`,
        [hoy(), roles],
      )
      : [];
    const avisos: string[] = [];
    if (roles.includes('TH') && !(await this.config.numero('smmlv_valor', 0))) {
      avisos.push('Falta el salario mínimo en Configuración: las alertas de dotación solo incluyen a quienes tienen el derecho marcado como "Sí".');
    }
    return {
      tipos: TIPOS_ALERTA.filter((t) => conteos.some((c) => c.tipo === t)).map((t) => {
        const c = conteos.find((x) => x.tipo === t)!;
        return { tipo: t, total: Number(c.total), vencidas: Number(c.vencidas) };
      }),
      total: conteos.reduce((s, c) => s + Number(c.total), 0),
      avisos,
    };
  }

  async descartar(id: number, motivo: string, u: UsuarioToken, ip?: string) {
    const a = await this.db.uno<{ estado: string; rol_destino: Rol; mensaje: string }>('SELECT estado, rol_destino, mensaje FROM alertas WHERE id = ?', [id]);
    if (!a || !this.roles(u).includes(a.rol_destino)) throw new NotFoundException('La alerta no existe');
    if (a.estado !== 'ACTIVA') throw new BadRequestException('La alerta ya no está activa');
    await this.db.ejecutar(
      "UPDATE alertas SET estado = 'DESCARTADA', atendida_por = ?, atendida_en = NOW(), motivo_descarte = ? WHERE id = ?",
      [u.sub, motivo, id],
    );
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'alertas', registroId: id, antes: { estado: 'ACTIVA' }, despues: { estado: 'DESCARTADA', motivo, alerta: a.mensaje }, ip });
    return { ok: true };
  }

  /** Vuelve a activar una alerta descartada (si la condición sigue, se mantiene; si no, se resuelve en la siguiente revisión). */
  async reactivar(id: number, u: UsuarioToken, ip?: string) {
    const a = await this.db.uno<{ estado: string; rol_destino: Rol }>('SELECT estado, rol_destino FROM alertas WHERE id = ?', [id]);
    if (!a || !this.roles(u).includes(a.rol_destino)) throw new NotFoundException('La alerta no existe');
    if (a.estado !== 'DESCARTADA') throw new BadRequestException('Solo se pueden reactivar las alertas descartadas');
    await this.db.ejecutar("UPDATE alertas SET estado = 'ACTIVA', atendida_por = NULL, atendida_en = NULL, motivo_descarte = NULL WHERE id = ?", [id]);
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'alertas', registroId: id, antes: { estado: 'DESCARTADA' }, despues: { estado: 'ACTIVA' }, ip });
    await this.sincronizar();
    return { ok: true };
  }
}

function clave(tipo: string, tabla: string, id: number, fecha: string) {
  return `${tipo}|${tabla}|${id}|${fecha}`;
}

function sumarDias(iso: string, dias: number) {
  const f = new Date(`${iso}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}
