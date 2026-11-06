import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchivosService } from '../archivos/archivos.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';

export interface DatosDocumento {
  tipoDocumentoId: number;
  descripcion?: string | null;
  fechaExpedicion?: string | null;
  fechaVencimiento?: string | null;
  reemplazaAId?: number | null;
}

type Alcance = 'todos' | 'sst';

/** Qué documentos puede ver el usuario: todos (TH, Admin) o solo los marcados para SST. */
function alcance(u: UsuarioToken): Alcance {
  if (u.permisos.includes('documentos.ver')) return 'todos';
  if (u.permisos.includes('documentos.ver_sst')) return 'sst';
  throw new ForbiddenException('No tiene permiso para ver documentos del expediente');
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DocumentosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly archivos: ArchivosService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
  ) {}

  /** Documentos del colaborador (vigentes y versiones anteriores) y los obligatorios que faltan. */
  async listar(colaboradorId: number, actor: UsuarioToken) {
    const a = alcance(actor);
    await this.verificarColaborador(colaboradorId);
    const diasGeneral = await this.config.numero('dias_alerta_documentos', 30);
    const filtroSst = a === 'sst' ? 'AND t.visible_sst = 1' : '';

    const documentos = await this.db.consultar<Record<string, unknown>>(
      `SELECT d.id, d.tipo_documento_id AS tipoDocumentoId, t.nombre AS tipoDocumento, t.es_sensible AS esSensible,
              t.maneja_vencimiento AS manejaVencimiento, d.descripcion, d.nombre_original AS nombreOriginal,
              d.mime_type AS mimeType, d.tamano_bytes AS tamanoBytes, d.fecha_expedicion AS fechaExpedicion,
              d.fecha_vencimiento AS fechaVencimiento, d.version, d.reemplaza_a_id AS reemplazaAId, d.vigente,
              d.creado_en AS creadoEn, u.nombre_completo AS creadoPor,
              CASE
                WHEN d.fecha_vencimiento IS NULL THEN 'SIN_VENCIMIENTO'
                WHEN d.fecha_vencimiento < CURDATE() THEN 'VENCIDO'
                WHEN d.fecha_vencimiento <= CURDATE() + INTERVAL COALESCE(t.dias_alerta, ?) DAY THEN 'POR_VENCER'
                ELSE 'AL_DIA'
              END AS estadoVencimiento,
              DATEDIFF(d.fecha_vencimiento, CURDATE()) AS diasParaVencer
         FROM documentos d
         JOIN tipos_documento_expediente t ON t.id = d.tipo_documento_id
         LEFT JOIN usuarios u ON u.id = d.creado_por
        WHERE d.colaborador_id = ? AND d.activo = 1 ${filtroSst}
        ORDER BY d.vigente DESC, t.nombre, d.version DESC`,
      [diasGeneral, colaboradorId],
    );

    const faltantes = await this.db.consultar<{ id: number; nombre: string }>(
      `SELECT t.id, t.nombre
         FROM colaboradores c
         JOIN documentos_obligatorios_cargo o ON o.cargo_id = c.cargo_id
         JOIN tipos_documento_expediente t ON t.id = o.tipo_documento_id AND t.activo = 1
        WHERE c.id = ? ${filtroSst}
          AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.colaborador_id = c.id AND d.tipo_documento_id = t.id
                             AND d.vigente = 1 AND d.activo = 1)
        ORDER BY t.nombre`,
      [colaboradorId],
    );

    const tipos = await this.db.consultar<Record<string, unknown>>(
      `SELECT id, nombre, maneja_vencimiento AS manejaVencimiento, es_sensible AS esSensible
         FROM tipos_documento_expediente t WHERE activo = 1 ${filtroSst} ORDER BY nombre`,
    );

    return {
      documentos: documentos.map((d) => ({ ...d, vigente: !!d.vigente, esSensible: !!d.esSensible, manejaVencimiento: !!d.manejaVencimiento })),
      faltantes,
      tipos: tipos.map((t) => ({ ...t, manejaVencimiento: !!t.manejaVencimiento, esSensible: !!t.esSensible })),
      maxMb: await this.config.numero('tamano_max_archivo_mb', 10),
    };
  }

  async subir(colaboradorId: number, archivo: { buffer: Buffer; originalname: string } | undefined, datos: DatosDocumento, actor: UsuarioToken, ip?: string) {
    if (!archivo) throw new BadRequestException('Seleccione el archivo');
    const tipoId = Number(datos.tipoDocumentoId);
    if (!Number.isInteger(tipoId)) throw new BadRequestException('Seleccione el tipo de documento');
    const colaborador = await this.verificarColaborador(colaboradorId);
    if (colaborador.estado === 'RETIRADO') throw new BadRequestException('El colaborador está retirado; no se pueden agregar documentos');

    const tipo = await this.db.uno<{ nombre: string; maneja_vencimiento: number }>(
      'SELECT nombre, maneja_vencimiento FROM tipos_documento_expediente WHERE id = ? AND activo = 1', [tipoId],
    );
    if (!tipo) throw new BadRequestException('El tipo de documento no existe o está inactivo');

    const expedicion = datos.fechaExpedicion || null;
    const vencimiento = datos.fechaVencimiento || null;
    for (const [f, nombre] of [[expedicion, 'expedición'], [vencimiento, 'vencimiento']] as const) {
      if (f && !FECHA.test(f)) throw new BadRequestException(`La fecha de ${nombre} no es válida`);
    }
    if (tipo.maneja_vencimiento && !vencimiento) throw new BadRequestException(`"${tipo.nombre}" necesita fecha de vencimiento`);
    if (expedicion && vencimiento && vencimiento < expedicion) {
      throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de expedición');
    }
    const descripcion = (datos.descripcion ?? '').toString().trim().slice(0, 200) || null;

    // Reemplazo: el documento anterior queda como versión anterior (RF-23)
    let version = 1;
    let reemplazaA: number | null = null;
    if (datos.reemplazaAId) {
      const anterior = await this.db.uno<{ id: number; version: number; tipo_documento_id: number }>(
        'SELECT id, version, tipo_documento_id FROM documentos WHERE id = ? AND colaborador_id = ? AND vigente = 1 AND activo = 1',
        [Number(datos.reemplazaAId), colaboradorId],
      );
      if (!anterior) throw new BadRequestException('El documento que quiere reemplazar no existe o ya fue reemplazado');
      if (anterior.tipo_documento_id !== tipoId) throw new BadRequestException('El reemplazo debe ser del mismo tipo de documento');
      version = anterior.version + 1;
      reemplazaA = anterior.id;
    }

    const maxMb = await this.config.numero('tamano_max_archivo_mb', 10);
    const guardado = await this.archivos.guardar(archivo.buffer, `colaboradores/${colaboradorId}/documentos`, ['pdf', 'jpg', 'png'], maxMb);
    // El navegador envía el nombre en UTF-8 pero puede llegar leído como latin1 ("contrato_aÃ±o.pdf")
    const convertido = Buffer.from(archivo.originalname, 'latin1').toString('utf8');
    const nombreOriginal = (convertido.includes('�') ? archivo.originalname : convertido).slice(0, 255);

    const id = await this.db.transaccion(async (cx) => {
      if (reemplazaA) await cx.ejecutar('UPDATE documentos SET vigente = 0, actualizado_por = ? WHERE id = ?', [actor.sub, reemplazaA]);
      const r = await cx.ejecutar(
        `INSERT INTO documentos (colaborador_id, tipo_documento_id, descripcion, nombre_original, ruta_archivo, mime_type,
                                 tamano_bytes, fecha_expedicion, fecha_vencimiento, version, reemplaza_a_id, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [colaboradorId, tipoId, descripcion, nombreOriginal, guardado.ruta, guardado.mime, guardado.tamano, expedicion, vencimiento, version, reemplazaA, actor.sub],
      );
      await this.auditoria.registrar(
        { usuarioId: actor.sub, accion: 'CREAR', tabla: 'documentos', registroId: r.insertId, despues: { colaboradorId, tipo: tipo.nombre, version, nombreOriginal }, ip },
        cx,
      );
      return r.insertId;
    });
    return { id };
  }

  /** Archivo para ver o descargar. Registra la descarga; si es sensible, también como consulta sensible. */
  async abrir(documentoId: number, actor: UsuarioToken, ip?: string) {
    const a = alcance(actor);
    const d = await this.db.uno<{ ruta_archivo: string; mime_type: string; nombre_original: string; visible_sst: number; es_sensible: number; colaborador_id: number }>(
      `SELECT d.ruta_archivo, d.mime_type, d.nombre_original, t.visible_sst, t.es_sensible, d.colaborador_id
         FROM documentos d JOIN tipos_documento_expediente t ON t.id = d.tipo_documento_id
        WHERE d.id = ? AND d.activo = 1`,
      [documentoId],
    );
    if (!d || (a === 'sst' && !d.visible_sst)) throw new NotFoundException('El documento no existe');
    const flujo = await this.archivos.abrir(d.ruta_archivo);
    await this.auditoria.registrar({ usuarioId: actor.sub, accion: d.es_sensible ? 'CONSULTAR_SENSIBLE' : 'DESCARGAR', tabla: 'documentos', registroId: documentoId, ip });
    return { flujo, mime: d.mime_type, nombre: d.nombre_original };
  }

  /** Inactiva un documento cargado por error. El archivo se conserva en el servidor. */
  async inactivar(documentoId: number, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const d = await cx.uno<{ reemplaza_a_id: number | null; vigente: number }>(
        'SELECT reemplaza_a_id, vigente FROM documentos WHERE id = ? AND activo = 1', [documentoId],
      );
      if (!d) throw new NotFoundException('El documento no existe');
      await cx.ejecutar('UPDATE documentos SET activo = 0, vigente = 0, actualizado_por = ? WHERE id = ?', [actor.sub, documentoId]);
      // Si era un reemplazo vigente, la versión anterior vuelve a ser la vigente
      if (d.vigente && d.reemplaza_a_id) {
        await cx.ejecutar('UPDATE documentos SET vigente = 1, actualizado_por = ? WHERE id = ? AND activo = 1', [actor.sub, d.reemplaza_a_id]);
      }
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'INACTIVAR', tabla: 'documentos', registroId: documentoId, ip }, cx);
    });
  }

  // --- Documentos obligatorios por cargo (RF-24) ---

  async obligatorios(cargoId: number): Promise<number[]> {
    const filas = await this.db.consultar<{ tipo_documento_id: number }>(
      'SELECT tipo_documento_id FROM documentos_obligatorios_cargo WHERE cargo_id = ?', [cargoId],
    );
    return filas.map((f) => f.tipo_documento_id);
  }

  async guardarObligatorios(cargoId: number, tipos: number[], actor: UsuarioToken, ip?: string) {
    const cargo = await this.db.uno<{ nombre: string }>('SELECT nombre FROM cargos WHERE id = ?', [cargoId]);
    if (!cargo) throw new NotFoundException('El cargo no existe');
    const unicos = [...new Set(tipos.map(Number))].filter(Number.isInteger);
    return this.db.transaccion(async (cx) => {
      const antes = await this.obligatorios(cargoId);
      if (unicos.length) {
        const validos = await cx.consultar<{ id: number }>(
          `SELECT id FROM tipos_documento_expediente WHERE id IN (${unicos.map(() => '?').join(',')})`, unicos,
        );
        if (validos.length !== unicos.length) throw new BadRequestException('Alguno de los tipos de documento no existe');
      }
      await cx.ejecutar('DELETE FROM documentos_obligatorios_cargo WHERE cargo_id = ?', [cargoId]);
      for (const t of unicos) {
        await cx.ejecutar('INSERT INTO documentos_obligatorios_cargo (cargo_id, tipo_documento_id) VALUES (?, ?)', [cargoId, t]);
      }
      await this.auditoria.registrar(
        { usuarioId: actor.sub, accion: 'EDITAR', tabla: 'documentos_obligatorios_cargo', registroId: cargoId, antes, despues: unicos, ip },
        cx,
      );
      return unicos;
    });
  }

  private async verificarColaborador(id: number) {
    const c = await this.db.uno<{ estado: string }>('SELECT estado FROM colaboradores WHERE id = ? AND activo = 1', [id]);
    if (!c) throw new NotFoundException('El colaborador no existe');
    return c;
  }
}
