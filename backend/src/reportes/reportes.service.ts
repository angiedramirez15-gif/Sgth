import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MOTIVOS, type Motivo } from '../actas/textos.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { LISTAS } from '../colaboradores/listas.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';
import { type HojaLibre, libroExcel } from './excel.js';

export const REPORTES = ['colaboradores', 'dotacion', 'epp', 'existencias', 'documentos', 'activos', 'actas'] as const;
export type Reporte = (typeof REPORTES)[number];

export interface Filtros {
  estado?: string;
  desde?: string;
  hasta?: string;
  plantilla?: string;
  cargoId?: number;
}

const etiqueta = (lista: readonly { valor: string; etiqueta: string }[], v: string | null) => lista.find((x) => x.valor === v)?.etiqueta ?? v ?? '';
const ESTADO_ACTA: Record<string, string> = { PENDIENTE_ACTA: 'Falta la firmada', COMPLETA: 'Firmada', ANULADA: 'Anulada' };
const ESTADO_ACTIVO: Record<string, string> = { DISPONIBLE: 'Disponible', ASIGNADO: 'Asignado', EN_REPARACION: 'En reparación', DADO_DE_BAJA: 'Dado de baja' };
const CONDICION: Record<string, string> = { NUEVO: 'Nuevo', BUENO: 'Bueno', REGULAR: 'Regular', MALO: 'Malo' };
const PLANTILLA: Record<string, string> = { DOTACION: 'Dotación', EPP: 'EPP', EQUIPOS: 'Equipos', MUEBLES: 'Muebles', OTROS: 'Otros elementos', DEVOLUCION: 'Devolución' };
const CATEGORIA: Record<string, string> = { DOTACION: 'Dotación', EPP: 'EPP', EQUIPO: 'Equipo', MUEBLE: 'Mueble', OTRO: 'Otro' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const corta = (iso: string) => iso.split('-').reverse().join('/');

/** Reportes en Excel (RF-60 a RF-66). Cada uno respeta los permisos del usuario. */
@Injectable()
export class ReportesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async generar(reporte: Reporte, f: Filtros, u: UsuarioToken, ip?: string): Promise<{ contenido: Buffer; nombre: string }> {
    if (f.desde && !ISO.test(f.desde)) throw new BadRequestException('La fecha inicial no es válida');
    if (f.hasta && !ISO.test(f.hasta)) throw new BadRequestException('La fecha final no es válida');
    if (f.desde && f.hasta && f.desde > f.hasta) throw new BadRequestException('La fecha inicial es posterior a la final');
    const generadores: Record<Reporte, () => Promise<{ titulo: string; filtros: string[]; hojas: HojaLibre[] }>> = {
      colaboradores: () => this.colaboradores(f, u),
      dotacion: () => this.entregas('DOTACION', f, u),
      epp: () => this.entregas('EPP', f, u),
      existencias: () => this.existencias(u),
      documentos: () => this.documentos(u),
      activos: () => this.activos(u),
      actas: () => this.actas(f, u),
    };
    const r = await generadores[reporte]();
    const empresa = await this.config.texto('empresa_nombre', 'DRIM DUIT S.A.S.');
    const contenido = await libroExcel({ empresa, titulo: r.titulo, usuario: u.nombre, filtros: r.filtros, hojas: r.hojas });
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'DESCARGAR', tabla: 'reportes', despues: { reporte, filtros: f }, ip });
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    return { contenido, nombre: `${r.titulo.replace(/[^\p{L}\p{N}]+/gu, '_')}_${fecha}.xlsx` };
  }

  private exigir(u: UsuarioToken, ...permisos: string[]) {
    if (!permisos.some((p) => u.permisos.includes(p))) throw new ForbiddenException('Su rol no tiene permiso para este reporte');
  }

  private rango(f: Filtros, campo: string, params: unknown[]): string {
    let sql = '';
    if (f.desde) { sql += ` AND ${campo} >= ?`; params.push(f.desde); }
    if (f.hasta) { sql += ` AND ${campo} <= ?`; params.push(f.hasta); }
    return sql;
  }

  private textoRango(f: Filtros) {
    if (f.desde && f.hasta) return `Del ${corta(f.desde)} al ${corta(f.hasta)}`;
    if (f.desde) return `Desde el ${corta(f.desde)}`;
    if (f.hasta) return `Hasta el ${corta(f.hasta)}`;
    return 'Todas las fechas';
  }

  // ---------- RF-60 Colaboradores ----------
  private async colaboradores(f: Filtros, u: UsuarioToken) {
    this.exigir(u, 'colaboradores.ver');
    const sensibles = u.permisos.includes('colaboradores.ver_sensibles');
    const params: unknown[] = [];
    let donde = 'WHERE 1 = 1';
    if (f.estado === 'ACTIVO' || f.estado === 'RETIRADO') { donde += ' AND c.estado = ?'; params.push(f.estado); }
    type F = Record<string, string | number | null>;
    const filas = await this.db.consultar<F>(
      `SELECT td.codigo AS tipo_doc, c.numero_documento, c.nombres, c.apellidos, c.sexo, cg.nombre AS cargo, ar.nombre AS area,
              DATE_FORMAT(c.fecha_ingreso, '%Y-%m-%d') AS ingreso, c.tipo_contrato, DATE_FORMAT(c.fecha_fin_contrato, '%Y-%m-%d') AS fin_contrato,
              c.salario, c.derecho_dotacion, eps.nombre AS eps, afp.nombre AS afp, arl.nombre AS arl, c.nivel_riesgo_arl, ccf.nombre AS ccf,
              ces.nombre AS cesantias, c.telefono, c.correo, c.ciudad_residencia, c.estado,
              DATE_FORMAT(c.fecha_retiro, '%Y-%m-%d') AS retiro, c.motivo_retiro
         FROM colaboradores c
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN cargos cg ON cg.id = c.cargo_id
         LEFT JOIN areas ar ON ar.id = c.area_id
         LEFT JOIN entidades_seguridad_social eps ON eps.id = c.eps_id
         LEFT JOIN entidades_seguridad_social afp ON afp.id = c.afp_id
         LEFT JOIN entidades_seguridad_social arl ON arl.id = c.arl_id
         LEFT JOIN entidades_seguridad_social ccf ON ccf.id = c.ccf_id
         LEFT JOIN entidades_seguridad_social ces ON ces.id = c.cesantias_id
         ${donde}
        ORDER BY c.estado, c.apellidos, c.nombres`,
      params,
    );
    const s = (k: string) => (x: F) => x[k] as string | null;
    const columnas = [
      { titulo: 'Tipo doc.', valor: s('tipo_doc'), ancho: 9 },
      { titulo: 'Número de documento', valor: s('numero_documento'), ancho: 16 },
      { titulo: 'Nombres', valor: s('nombres'), ancho: 20 },
      { titulo: 'Apellidos', valor: s('apellidos'), ancho: 22 },
      { titulo: 'Sexo', valor: (x: F) => etiqueta(LISTAS.sexo, x.sexo as string), ancho: 11 },
      { titulo: 'Cargo', valor: s('cargo'), ancho: 26 },
      { titulo: 'Área', valor: s('area'), ancho: 18 },
      { titulo: 'Fecha de ingreso', valor: s('ingreso'), tipo: 'fecha' as const, ancho: 13 },
      { titulo: 'Tipo de contrato', valor: (x: F) => etiqueta(LISTAS.tipoContrato, x.tipo_contrato as string), ancho: 20 },
      { titulo: 'Fin de contrato', valor: s('fin_contrato'), tipo: 'fecha' as const, ancho: 13 },
      ...(sensibles ? [{ titulo: 'Salario', valor: (x: F) => x.salario, tipo: 'dinero' as const, ancho: 14 }] : []),
      { titulo: 'Derecho a dotación', valor: (x: F) => etiqueta(LISTAS.derechoDotacion, x.derecho_dotacion as string), ancho: 16 },
      { titulo: 'EPS', valor: s('eps'), ancho: 18 },
      { titulo: 'Fondo de pensiones', valor: s('afp'), ancho: 18 },
      { titulo: 'ARL', valor: s('arl'), ancho: 16 },
      { titulo: 'Riesgo ARL', valor: (x: F) => x.nivel_riesgo_arl, tipo: 'numero' as const, ancho: 10 },
      { titulo: 'Caja de compensación', valor: s('ccf'), ancho: 18 },
      { titulo: 'Fondo de cesantías', valor: s('cesantias'), ancho: 18 },
      { titulo: 'Teléfono', valor: s('telefono'), ancho: 13 },
      { titulo: 'Correo', valor: s('correo'), ancho: 26 },
      { titulo: 'Ciudad', valor: s('ciudad_residencia'), ancho: 14 },
      { titulo: 'Estado', valor: (x: F) => (x.estado === 'ACTIVO' ? 'Activo' : 'Retirado'), ancho: 10 },
      { titulo: 'Fecha de retiro', valor: s('retiro'), tipo: 'fecha' as const, ancho: 13 },
      { titulo: 'Motivo de retiro', valor: s('motivo_retiro'), ancho: 26 },
    ];
    const estado = f.estado === 'ACTIVO' ? 'Solo activos' : f.estado === 'RETIRADO' ? 'Solo retirados' : 'Activos y retirados';
    return { titulo: 'Colaboradores', filtros: [estado], hojas: [{ nombre: 'Colaboradores', columnas, filas }] as HojaLibre[] };
  }

  // ---------- RF-61 / RF-62 Entregas de dotación y de EPP ----------
  private async entregas(plantilla: 'DOTACION' | 'EPP', f: Filtros, u: UsuarioToken) {
    this.exigir(u, ...(plantilla === 'EPP' ? ['inventario_epp.ver', 'inventario_epp.gestionar', 'actas_epp.gestionar'] : ['inventario_dotacion.ver', 'inventario_dotacion.gestionar', 'actas_dotacion.gestionar']));
    const params: unknown[] = [plantilla];
    let donde = `WHERE p.plantilla = ? AND a.estado <> 'ANULADA'`;
    donde += this.rango(f, 'COALESCE(a.fecha_entrega_original, a.fecha)', params);
    if (f.cargoId) { donde += ' AND c.cargo_id = ?'; params.push(f.cargoId); }
    type F = Record<string, string | number | null>;
    const filas = await this.db.consultar<F>(
      `SELECT a.consecutivo, DATE_FORMAT(COALESCE(a.fecha_entrega_original, a.fecha), '%Y-%m-%d') AS fecha, a.estado, a.motivo, a.es_historica,
              CONCAT(td.codigo, ' ', c.numero_documento) AS documento, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
              a.firmante_recibe_cargo AS cargo, CONCAT(pd.numero, ' de ', pd.anio) AS periodo, pl.consecutivo AS planilla,
              e.nombre AS elemento, d.talla, d.cantidad, e.unidad, DATE_FORMAT(d.fecha_reposicion, '%Y-%m-%d') AS reposicion, d.repuesto
         FROM actas_detalle d
         JOIN actas a ON a.id = d.acta_id
         JOIN plantillas_acta p ON p.id = a.plantilla_id
         JOIN elementos e ON e.id = d.elemento_id
         JOIN colaboradores c ON c.id = a.colaborador_id
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         LEFT JOIN periodos_dotacion pd ON pd.id = a.periodo_dotacion_id
         LEFT JOIN planillas_epp pl ON pl.id = a.planilla_id
         ${donde}
        ORDER BY fecha, a.consecutivo, d.id`,
      params,
    );
    const s = (k: string) => (x: F) => x[k] as string | null;
    const columnas = [
      { titulo: 'Acta', valor: s('consecutivo'), ancho: 15 },
      { titulo: 'Fecha de entrega', valor: s('fecha'), tipo: 'fecha' as const, ancho: 13 },
      { titulo: 'Documento', valor: s('documento'), ancho: 16 },
      { titulo: 'Colaborador', valor: s('colaborador'), ancho: 30 },
      { titulo: 'Cargo', valor: s('cargo'), ancho: 24 },
      ...(plantilla === 'DOTACION' ? [{ titulo: 'Período', valor: s('periodo'), ancho: 11 }] : [{ titulo: 'Planilla', valor: s('planilla'), ancho: 15 }]),
      { titulo: 'Motivo', valor: (x: F) => MOTIVOS[x.motivo as Motivo]?.etiqueta ?? x.motivo, ancho: 20 },
      { titulo: 'Elemento', valor: s('elemento'), ancho: 28 },
      { titulo: 'Talla', valor: (x: F) => (x.talla === 'UNICA' ? '' : x.talla), ancho: 8 },
      { titulo: 'Cantidad', valor: (x: F) => x.cantidad, tipo: 'numero' as const, ancho: 9 },
      { titulo: 'Unidad', valor: s('unidad'), ancho: 8 },
      ...(plantilla === 'EPP' ? [
        { titulo: 'Reposición', valor: s('reposicion'), tipo: 'fecha' as const, ancho: 12 },
        { titulo: 'Ya se repuso', valor: (x: F) => (x.repuesto ? 'Sí' : 'No'), ancho: 11 },
      ] : []),
      { titulo: 'Estado del acta', valor: (x: F) => ESTADO_ACTA[x.estado as string], ancho: 15 },
      { titulo: 'Acta antigua', valor: (x: F) => (x.es_historica ? 'Sí' : ''), ancho: 11 },
    ];
    const filtros = [this.textoRango(f), 'Sin actas anuladas'];
    if (f.cargoId) {
      const c = await this.db.uno<{ nombre: string }>('SELECT nombre FROM cargos WHERE id = ?', [f.cargoId]);
      filtros.push(`Cargo: ${c?.nombre ?? '?'}`);
    }
    const titulo = plantilla === 'EPP' ? 'Entregas de EPP' : 'Entregas de dotación';
    return { titulo, filtros, hojas: [{ nombre: titulo, columnas, filas }] as HojaLibre[] };
  }

  // ---------- RF-63 Existencias ----------
  private async existencias(u: UsuarioToken) {
    const categorias: string[] = [];
    if (u.permisos.some((p) => p.startsWith('inventario_dotacion'))) categorias.push('DOTACION');
    if (u.permisos.some((p) => p.startsWith('inventario_epp'))) categorias.push('EPP');
    const activos = u.permisos.some((p) => p.startsWith('inventario_activos'));
    if (activos) categorias.push('OTRO');
    if (!categorias.length) throw new ForbiddenException('Su rol no tiene permiso para este reporte');
    type F = Record<string, string | number | null>;
    const stock = await this.db.consultar<F>(
      `SELECT e.categoria_inventario AS categoria, e.nombre, e.subcategoria, e.unidad, COALESCE(x.talla, 'UNICA') AS talla,
              COALESCE(x.cantidad, 0) AS cantidad, e.stock_minimo, e.vida_util_dias
         FROM elementos e LEFT JOIN existencias x ON x.elemento_id = e.id
        WHERE e.activo = 1 AND e.controla_por_unidad = 0 AND e.categoria_inventario IN (?)
        ORDER BY FIELD(e.categoria_inventario, 'DOTACION', 'EPP', 'OTRO'), e.nombre, x.talla`,
      [categorias],
    );
    const s = (k: string) => (x: F) => x[k] as string | null;
    const hojas: HojaLibre[] = [{
      nombre: 'Por cantidad',
      columnas: [
        { titulo: 'Categoría', valor: (x: F) => CATEGORIA[x.categoria as string], ancho: 11 },
        { titulo: 'Elemento', valor: s('nombre'), ancho: 30 },
        { titulo: 'Grupo', valor: s('subcategoria'), ancho: 16 },
        { titulo: 'Unidad', valor: s('unidad'), ancho: 8 },
        { titulo: 'Talla', valor: (x: F) => (x.talla === 'UNICA' ? '' : x.talla), ancho: 8 },
        { titulo: 'En bodega', valor: (x: F) => x.cantidad, tipo: 'numero', ancho: 10 },
        { titulo: 'Stock mínimo', valor: (x: F) => x.stock_minimo, tipo: 'numero', ancho: 12 },
        { titulo: 'Vida útil (días)', valor: (x: F) => x.vida_util_dias, tipo: 'numero', ancho: 13 },
      ] as never,
      filas: stock as never[],
    }];
    if (activos) {
      const unidades = await this.db.consultar<F>(
        `SELECT e.categoria_inventario AS categoria, e.nombre,
                SUM(a.estado = 'DISPONIBLE') AS disponibles, SUM(a.estado = 'ASIGNADO') AS asignados,
                SUM(a.estado = 'EN_REPARACION') AS reparacion, SUM(a.estado = 'DADO_DE_BAJA') AS baja
           FROM elementos e LEFT JOIN activos a ON a.elemento_id = e.id
          WHERE e.controla_por_unidad = 1
          GROUP BY e.id ORDER BY e.categoria_inventario, e.nombre`,
      );
      hojas.push({
        nombre: 'Equipos y muebles',
        columnas: [
          { titulo: 'Clase', valor: (x: F) => CATEGORIA[x.categoria as string], ancho: 10 },
          { titulo: 'Tipo', valor: s('nombre'), ancho: 30 },
          { titulo: 'Disponibles', valor: (x: F) => Number(x.disponibles ?? 0), tipo: 'numero', ancho: 12 },
          { titulo: 'Asignados', valor: (x: F) => Number(x.asignados ?? 0), tipo: 'numero', ancho: 11 },
          { titulo: 'En reparación', valor: (x: F) => Number(x.reparacion ?? 0), tipo: 'numero', ancho: 13 },
          { titulo: 'Dados de baja', valor: (x: F) => Number(x.baja ?? 0), tipo: 'numero', ancho: 13 },
        ] as never,
        filas: unidades as never[],
      });
    }
    return { titulo: 'Existencias de inventario', filtros: [`Categorías: ${categorias.map((c) => CATEGORIA[c]).join(', ')}`], hojas };
  }

  // ---------- RF-64 Documentos vencidos o faltantes ----------
  private async documentos(u: UsuarioToken) {
    this.exigir(u, 'documentos.ver', 'documentos.ver_sst');
    const soloSst = !u.permisos.includes('documentos.ver');
    const dias = await this.config.numero('dias_alerta_documentos', 30);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    type F = Record<string, string | number | null>;
    const vencen = await this.db.consultar<F>(
      `SELECT CONCAT(td.codigo, ' ', c.numero_documento) AS documento, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, cg.nombre AS cargo,
              t.nombre AS tipo, DATE_FORMAT(d.fecha_vencimiento, '%Y-%m-%d') AS vence, DATEDIFF(d.fecha_vencimiento, ?) AS dias
         FROM documentos d
         JOIN tipos_documento_expediente t ON t.id = d.tipo_documento_id
         JOIN colaboradores c ON c.id = d.colaborador_id
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN cargos cg ON cg.id = c.cargo_id
        WHERE d.activo = 1 AND d.vigente = 1 AND c.estado = 'ACTIVO' AND d.fecha_vencimiento IS NOT NULL
          AND d.fecha_vencimiento <= DATE_ADD(?, INTERVAL COALESCE(t.dias_alerta, ?) DAY) ${soloSst ? 'AND t.visible_sst = 1' : ''}
        ORDER BY d.fecha_vencimiento`,
      [hoy, hoy, dias],
    );
    const faltan = await this.db.consultar<F>(
      `SELECT CONCAT(td.codigo, ' ', c.numero_documento) AS documento, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, cg.nombre AS cargo, t.nombre AS tipo
         FROM colaboradores c
         JOIN cargos cg ON cg.id = c.cargo_id
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN tipos_documento_expediente t ON t.activo = 1
              AND (t.obligatorio_todos = 1
                   OR EXISTS (SELECT 1 FROM documentos_obligatorios_cargo o WHERE o.cargo_id = c.cargo_id AND o.tipo_documento_id = t.id))
        WHERE c.estado = 'ACTIVO' ${soloSst ? 'AND t.visible_sst = 1' : ''}
          AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.colaborador_id = c.id AND d.tipo_documento_id = t.id AND d.activo = 1 AND d.vigente = 1)
        ORDER BY colaborador, t.nombre`,
    );
    const s = (k: string) => (x: F) => x[k] as string | null;
    return {
      titulo: 'Documentos',
      filtros: [`Vencidos y por vencer en ${dias} días`, ...(soloSst ? ['Solo documentos visibles para SST'] : [])],
      hojas: [
        {
          nombre: 'Vencidos y por vencer',
          columnas: [
            { titulo: 'Documento', valor: s('documento'), ancho: 16 },
            { titulo: 'Colaborador', valor: s('colaborador'), ancho: 30 },
            { titulo: 'Cargo', valor: s('cargo'), ancho: 24 },
            { titulo: 'Tipo de documento', valor: s('tipo'), ancho: 26 },
            { titulo: 'Vence', valor: s('vence'), tipo: 'fecha', ancho: 12 },
            { titulo: 'Estado', valor: (x: F) => (Number(x.dias) < 0 ? `Vencido hace ${-Number(x.dias)} días` : `Vence en ${x.dias} días`), ancho: 20 },
          ],
          filas: vencen,
          vacio: 'No hay documentos vencidos ni por vencer.',
        },
        {
          nombre: 'Faltantes obligatorios',
          columnas: [
            { titulo: 'Documento', valor: s('documento'), ancho: 16 },
            { titulo: 'Colaborador', valor: s('colaborador'), ancho: 30 },
            { titulo: 'Cargo', valor: s('cargo'), ancho: 24 },
            { titulo: 'Le falta', valor: s('tipo'), ancho: 28 },
          ],
          filas: faltan,
          vacio: 'Nadie tiene documentos obligatorios pendientes.',
        },
      ] as HojaLibre[],
    };
  }

  // ---------- RF-65 Equipos y muebles ----------
  private async activos(u: UsuarioToken) {
    this.exigir(u, 'inventario_activos.ver', 'inventario_activos.gestionar');
    type F = Record<string, string | number | null>;
    const filas = await this.db.consultar<F>(
      `SELECT a.placa_inventario AS placa, e.nombre AS tipo, e.categoria_inventario AS clase, a.marca, a.modelo, a.serial, a.descripcion_adicional AS detalle,
              a.estado, a.condicion, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador, CONCAT(td.codigo, ' ', c.numero_documento) AS documento, cg.nombre AS cargo,
              (SELECT DATE_FORMAT(COALESCE(ac.fecha_entrega_original, ac.fecha), '%Y-%m-%d') FROM movimientos_inventario m JOIN actas ac ON ac.id = m.acta_id
                WHERE m.activo_id = a.id AND m.tipo_movimiento = 'SALIDA' AND ac.estado <> 'ANULADA' ORDER BY m.id DESC LIMIT 1) AS desde,
              DATE_FORMAT(a.fecha_compra, '%Y-%m-%d') AS compra, a.valor_compra
         FROM activos a
         JOIN elementos e ON e.id = a.elemento_id
         LEFT JOIN colaboradores c ON c.id = a.colaborador_actual_id
         LEFT JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         LEFT JOIN cargos cg ON cg.id = c.cargo_id
        ORDER BY a.placa_inventario`,
    );
    const s = (k: string) => (x: F) => x[k] as string | null;
    const columnas = [
      { titulo: 'Placa', valor: s('placa'), ancho: 13 },
      { titulo: 'Clase', valor: (x: F) => CATEGORIA[x.clase as string], ancho: 9 },
      { titulo: 'Tipo', valor: s('tipo'), ancho: 24 },
      { titulo: 'Marca', valor: s('marca'), ancho: 14 },
      { titulo: 'Modelo', valor: s('modelo'), ancho: 16 },
      { titulo: 'Serial', valor: s('serial'), ancho: 18 },
      { titulo: 'Detalle', valor: s('detalle'), ancho: 24 },
      { titulo: 'Estado', valor: (x: F) => ESTADO_ACTIVO[x.estado as string], ancho: 13 },
      { titulo: 'Estado físico', valor: (x: F) => CONDICION[x.condicion as string], ancho: 12 },
      { titulo: 'Asignado a', valor: s('colaborador'), ancho: 28 },
      { titulo: 'Documento', valor: s('documento'), ancho: 16 },
      { titulo: 'Cargo', valor: s('cargo'), ancho: 22 },
      { titulo: 'Asignado desde', valor: (x: F) => (x.colaborador ? x.desde : null), tipo: 'fecha' as const, ancho: 13 },
      { titulo: 'Fecha de compra', valor: s('compra'), tipo: 'fecha' as const, ancho: 13 },
      { titulo: 'Valor de compra', valor: (x: F) => x.valor_compra, tipo: 'dinero' as const, ancho: 15 },
    ];
    return { titulo: 'Equipos y muebles', filtros: ['Todos los estados'], hojas: [{ nombre: 'Equipos y muebles', columnas, filas }] as HojaLibre[] };
  }

  // ---------- RF-66 Actas ----------
  private async actas(f: Filtros, u: UsuarioToken) {
    this.exigir(u, 'actas.ver', 'actas_dotacion.gestionar', 'actas_activos.gestionar', 'actas_epp.gestionar');
    const params: unknown[] = [];
    let donde = 'WHERE 1 = 1';
    donde += this.rango(f, 'a.fecha', params);
    if (f.plantilla && PLANTILLA[f.plantilla]) { donde += ' AND p.plantilla = ?'; params.push(f.plantilla); }
    if (f.estado && ESTADO_ACTA[f.estado]) { donde += ' AND a.estado = ?'; params.push(f.estado); }
    type F = Record<string, string | number | null>;
    const filas = await this.db.consultar<F>(
      `SELECT a.consecutivo, p.plantilla, a.tipo_acta, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.motivo, a.estado, a.es_historica,
              CONCAT(td.codigo, ' ', c.numero_documento) AS documento, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
              CONCAT(an.nombres, ' ', an.apellidos) AS anterior,
              (SELECT GROUP_CONCAT(CONCAT(d.cantidad, ' ', COALESCE(ac.placa_inventario, e.nombre)) ORDER BY d.id SEPARATOR ', ')
                 FROM actas_detalle d JOIN elementos e ON e.id = d.elemento_id LEFT JOIN activos ac ON ac.id = d.activo_id WHERE d.acta_id = a.id) AS elementos,
              us.nombre_completo AS registro, DATE_FORMAT(a.fecha_carga_firmada, '%Y-%m-%d') AS firmada, a.motivo_anulacion
         FROM actas a
         JOIN plantillas_acta p ON p.id = a.plantilla_id
         JOIN colaboradores c ON c.id = a.colaborador_id
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         LEFT JOIN colaboradores an ON an.id = a.colaborador_anterior_id
         JOIN usuarios us ON us.id = a.usuario_id
         ${donde}
        ORDER BY a.id`,
      params,
    );
    const s = (k: string) => (x: F) => x[k] as string | null;
    const columnas = [
      { titulo: 'Acta', valor: s('consecutivo'), ancho: 15 },
      { titulo: 'Tipo', valor: (x: F) => PLANTILLA[x.plantilla as string], ancho: 14 },
      { titulo: 'Fecha', valor: s('fecha'), tipo: 'fecha' as const, ancho: 12 },
      { titulo: 'Documento', valor: s('documento'), ancho: 16 },
      { titulo: 'Colaborador', valor: s('colaborador'), ancho: 28 },
      { titulo: 'Viene de (traspaso)', valor: s('anterior'), ancho: 24 },
      { titulo: 'Motivo', valor: (x: F) => MOTIVOS[x.motivo as Motivo]?.etiqueta ?? x.motivo, ancho: 20 },
      { titulo: 'Elementos', valor: s('elementos'), ancho: 40 },
      { titulo: 'Estado', valor: (x: F) => ESTADO_ACTA[x.estado as string], ancho: 15 },
      { titulo: 'Firmada cargada el', valor: s('firmada'), tipo: 'fecha' as const, ancho: 14 },
      { titulo: 'Motivo de anulación', valor: s('motivo_anulacion'), ancho: 26 },
      { titulo: 'Acta antigua', valor: (x: F) => (x.es_historica ? 'Sí' : ''), ancho: 10 },
      { titulo: 'Registró', valor: s('registro'), ancho: 22 },
    ];
    const filtros = [this.textoRango(f)];
    if (f.plantilla && PLANTILLA[f.plantilla]) filtros.push(`Tipo: ${PLANTILLA[f.plantilla]}`);
    if (f.estado && ESTADO_ACTA[f.estado]) filtros.push(`Estado: ${ESTADO_ACTA[f.estado]}`);
    return { titulo: 'Actas', filtros, hojas: [{ nombre: 'Actas', columnas, filas }] as HojaLibre[] };
  }
}
