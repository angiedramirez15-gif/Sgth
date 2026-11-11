import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hoyColombia } from '../actas/actas.service.js';
import { PdfActaService } from '../actas/pdf-acta.service.js';
import { ArchivosService } from '../archivos/archivos.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { puedeVerSensibles } from '../colaboradores/colaboradores.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { CertificadoDto } from './dto/certificado.dto.js';
import { type DatosCertificado, NOMBRE_CONTRATO, rellenarCertificado, type TipoContrato } from './textos-certificado.js';

export interface Certificado {
  id: number;
  consecutivo: string;
  fechaExpedicion: string;
  conSalario: boolean;
  dirigidoA: string | null;
  cargo: string;
  tipoContrato: string;
  firmante: string;
  creadoPor: string;
  creadoEn: string;
}

interface FilaColaborador {
  id: number;
  nombre: string;
  sexo: string;
  estado: 'ACTIVO' | 'RETIRADO';
  tipoDoc: string;
  numeroDoc: string;
  cargo: string;
  tipoContrato: TipoContrato;
  fechaIngreso: string;
  fechaFinContrato: string | null;
  fechaRetiro: string | null;
  salario: string | null;
}

/** Certificados laborales: los genera Talento Humano desde la ficha; cada uno queda guardado con consecutivo. */
@Injectable()
export class CertificadosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly archivos: ArchivosService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
    private readonly pdf: PdfActaService,
  ) {}

  /** Qué falta configurar para poder expedir certificados (se muestra en el diálogo y en Configuración). */
  async faltantes(): Promise<string[]> {
    const f: string[] = [];
    if (!(await this.config.texto('empresa_nit', '')).trim()) f.push('el NIT de la empresa');
    if (!(await this.config.texto('certificado_firmante_nombre', '')).trim()) f.push('el nombre de quien firma');
    if (!(await this.config.texto('certificado_firmante_cargo', '')).trim()) f.push('el cargo de quien firma');
    if (!(await this.archivos.existe(await this.config.texto('certificado_firma', '')))) f.push('la imagen de la firma');
    return f;
  }

  async estado(colaboradorId: number, u: UsuarioToken) {
    const c = await this.colaborador(colaboradorId);
    return {
      faltantes: await this.faltantes(),
      tieneSalario: c.salario != null && Number(c.salario) > 0,
      puedeConSalario: puedeVerSensibles(u),
      retirado: c.estado === 'RETIRADO',
      firmante: {
        nombre: await this.config.texto('certificado_firmante_nombre', ''),
        cargo: await this.config.texto('certificado_firmante_cargo', ''),
      },
    };
  }

  async listar(colaboradorId: number): Promise<Certificado[]> {
    await this.colaborador(colaboradorId);
    const filas = await this.db.consultar<{
      id: number; consecutivo: string; fecha: string; con_salario: number; dirigido_a: string | null; datos: string;
      firmante_nombre: string; creado_por: string; creado_en: string;
    }>(
      `SELECT k.id, k.consecutivo, DATE_FORMAT(k.fecha_expedicion, '%Y-%m-%d') AS fecha, k.con_salario, k.dirigido_a, k.datos,
              k.firmante_nombre, u.nombre_completo AS creado_por, DATE_FORMAT(k.creado_en, '%Y-%m-%d %H:%i') AS creado_en
         FROM certificados_laborales k JOIN usuarios u ON u.id = k.creado_por
        WHERE k.colaborador_id = ? ORDER BY k.id DESC`,
      [colaboradorId],
    );
    return filas.map((f) => {
      const d = JSON.parse(f.datos) as DatosCertificado;
      return {
        id: f.id,
        consecutivo: f.consecutivo,
        fechaExpedicion: f.fecha,
        conSalario: !!f.con_salario,
        dirigidoA: f.dirigido_a,
        cargo: d.cargo,
        tipoContrato: NOMBRE_CONTRATO[d.tipoContrato] ?? d.tipoContrato,
        firmante: f.firmante_nombre,
        creadoPor: f.creado_por,
        creadoEn: f.creado_en,
      };
    });
  }

  /** Expide el certificado: consecutivo, PDF guardado y registro. */
  async crear(colaboradorId: number, dto: CertificadoDto, u: UsuarioToken, ip?: string) {
    if (dto.conSalario && !puedeVerSensibles(u)) {
      throw new ForbiddenException('Su rol no puede ver el salario. Genere el certificado sin salario');
    }
    const faltan = await this.faltantes();
    if (faltan.length) {
      throw new BadRequestException(`Antes de expedir certificados, registre en Configuración ${unirLista(faltan)}`);
    }
    const c = await this.colaborador(colaboradorId);
    if (dto.conSalario && !(c.salario != null && Number(c.salario) > 0)) {
      throw new BadRequestException('El colaborador no tiene salario registrado. Regístrelo en su ficha o genere el certificado sin salario');
    }
    const datos: DatosCertificado = {
      sexo: c.sexo,
      nombre: c.nombre,
      tipoDoc: c.tipoDoc,
      numeroDoc: c.numeroDoc,
      cargo: c.cargo,
      tipoContrato: c.tipoContrato,
      fechaIngreso: c.fechaIngreso,
      fechaFinContrato: c.fechaFinContrato,
      fechaRetiro: c.estado === 'RETIRADO' ? c.fechaRetiro : null,
      salario: dto.conSalario ? Number(c.salario) : null,
    };
    const firmante = {
      nombre: (await this.config.texto('certificado_firmante_nombre', '')).trim(),
      cargo: (await this.config.texto('certificado_firmante_cargo', '')).trim(),
    };
    const fecha = hoyColombia();
    const dirigidoA = dto.dirigidoA?.trim() || null;

    const { id, consecutivo, plantilla } = await this.db.transaccion(async (cx) => {
      const plantilla = await cx.uno<{ id: number; titulo: string; texto_introduccion: string; texto_manifiesta: string; clausulas: string }>(
        `SELECT id, titulo, texto_introduccion, texto_manifiesta, clausulas FROM plantillas_acta WHERE plantilla = 'CERTIFICADO' AND vigente = 1 LIMIT 1`,
      );
      if (!plantilla) throw new BadRequestException('Falta la plantilla del certificado. Ejecute el cambio 010 de la base de datos');
      const anio = Number(fecha.slice(0, 4));
      await cx.ejecutar('INSERT IGNORE INTO consecutivos_certificado (anio, ultimo) VALUES (?, 0)', [anio]);
      const fila = await cx.uno<{ ultimo: number }>('SELECT ultimo FROM consecutivos_certificado WHERE anio = ? FOR UPDATE', [anio]);
      const n = fila!.ultimo + 1;
      await cx.ejecutar('UPDATE consecutivos_certificado SET ultimo = ? WHERE anio = ?', [n, anio]);
      const consecutivo = `CER-${anio}-${String(n).padStart(4, '0')}`;
      const r = await cx.ejecutar(
        `INSERT INTO certificados_laborales (consecutivo, colaborador_id, plantilla_id, fecha_expedicion, con_salario, dirigido_a, datos, firmante_nombre, firmante_cargo, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [consecutivo, colaboradorId, plantilla.id, fecha, dto.conSalario ? 1 : 0, dirigidoA, JSON.stringify(datos), firmante.nombre, firmante.cargo, u.sub],
      );
      await this.auditoria.registrar({
        usuarioId: u.sub, accion: 'CREAR', tabla: 'certificados_laborales', registroId: r.insertId,
        despues: { consecutivo, colaboradorId, conSalario: dto.conSalario, dirigidoA }, ip,
      }, cx);
      return { id: r.insertId, consecutivo, plantilla };
    });

    const contenido = await this.armarPdf({
      consecutivo, datos, fecha, dirigidoA, firmante,
      titulo: plantilla.titulo, introduccion: plantilla.texto_introduccion, manifiesta: plantilla.texto_manifiesta,
      clausulas: JSON.parse(plantilla.clausulas) as string[],
    });
    const ruta = await this.archivos.guardarGenerado(contenido, `certificados/${fecha.slice(0, 4)}/${consecutivo}.pdf`);
    await this.db.ejecutar('UPDATE certificados_laborales SET ruta_pdf = ? WHERE id = ?', [ruta, id]);
    return (await this.listar(colaboradorId)).find((k) => k.id === id)!;
  }

  /** PDF guardado de un certificado. */
  async archivo(id: number, u: UsuarioToken, ip?: string) {
    const k = await this.db.uno<{ consecutivo: string; ruta_pdf: string | null; con_salario: number; nombre: string }>(
      `SELECT k.consecutivo, k.ruta_pdf, k.con_salario, CONCAT(c.nombres, ' ', c.apellidos) AS nombre
         FROM certificados_laborales k JOIN colaboradores c ON c.id = k.colaborador_id WHERE k.id = ?`,
      [id],
    );
    if (!k) throw new NotFoundException('El certificado no existe');
    if (k.con_salario && !puedeVerSensibles(u)) throw new ForbiddenException('Este certificado incluye el salario y su rol no puede verlo');
    if (!k.ruta_pdf) throw new NotFoundException('El PDF de este certificado no se generó. Expida uno nuevo');
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'DESCARGAR', tabla: 'certificados_laborales', registroId: id, ip });
    return { ruta: k.ruta_pdf, nombre: `Certificado_laboral_${k.nombre.replace(/\s+/g, '_')}_${k.consecutivo}.pdf` };
  }

  /** Arma el PDF con los textos dados (también lo usa la vista previa de la plantilla). */
  async armarPdf(p: {
    consecutivo: string; datos: DatosCertificado; fecha: string; dirigidoA: string | null; firmante: { nombre: string; cargo: string };
    titulo: string; introduccion: string; manifiesta: string; clausulas: string[]; nota?: string;
  }): Promise<Buffer> {
    const empresa = await this.config.texto('empresa_nombre', 'DRIM DUIT S.A.S.');
    const contexto = {
      empresa,
      nit: await this.config.texto('empresa_nit', ''),
      ciudad: await this.config.texto('ciudad_actas', 'Palmira'),
      fechaExpedicion: p.fecha,
      cargoFirmante: p.firmante.cargo,
    };
    const [titulo, introduccion, manifiesta] = rellenarCertificado([p.titulo, p.introduccion, p.manifiesta], { ...p.datos, salario: 0 }, contexto);
    const pie = (await this.config.texto('pie_actas', '')).split(/\s*\|\s*|\n/).map((r) => r.trim()).filter(Boolean);
    return this.pdf.generarCertificado({
      consecutivo: p.consecutivo,
      titulo,
      dirigidoA: p.dirigidoA,
      introduccion,
      manifiesta,
      parrafos: rellenarCertificado(p.clausulas, p.datos, contexto),
      firmante: { ...p.firmante, empresa },
      firma: await this.leerFirma(),
      pie,
      nota: p.nota,
    });
  }

  // ---------------------------------------------------------------------
  //  Firma escaneada
  // ---------------------------------------------------------------------

  async subirFirma(contenido: Buffer | undefined, u: UsuarioToken, ip?: string) {
    if (!contenido) throw new BadRequestException('Seleccione la imagen de la firma');
    const g = await this.archivos.guardar(contenido, 'firmas', ['png', 'jpg'], 2);
    const antes = await this.config.texto('certificado_firma', '');
    await this.db.ejecutar(
      `INSERT INTO configuracion (clave, valor, descripcion, actualizado_por) VALUES ('certificado_firma', ?, 'Imagen de la firma (se sube desde Configuración)', ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por)`,
      [g.ruta, u.sub],
    );
    this.config.invalidar();
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'configuracion', antes: { clave: 'certificado_firma', valor: antes || null }, despues: { clave: 'certificado_firma', valor: g.ruta }, ip });
    return { tieneFirma: true };
  }

  async rutaFirma(): Promise<{ ruta: string; mime: string }> {
    const ruta = await this.config.texto('certificado_firma', '');
    if (!(await this.archivos.existe(ruta))) throw new NotFoundException('Todavía no se ha subido la firma');
    return { ruta, mime: ruta.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  private async leerFirma(): Promise<Buffer | null> {
    const ruta = await this.config.texto('certificado_firma', '');
    if (!(await this.archivos.existe(ruta))) return null;
    const partes: Buffer[] = [];
    for await (const p of await this.archivos.abrir(ruta)) partes.push(p as Buffer);
    return Buffer.concat(partes);
  }

  private async colaborador(id: number): Promise<FilaColaborador> {
    const c = await this.db.uno<FilaColaborador>(
      `SELECT c.id, CONCAT(c.nombres, ' ', c.apellidos) AS nombre, c.sexo, c.estado, td.codigo AS tipoDoc, c.numero_documento AS numeroDoc,
              g.nombre AS cargo, c.tipo_contrato AS tipoContrato, DATE_FORMAT(c.fecha_ingreso, '%Y-%m-%d') AS fechaIngreso,
              DATE_FORMAT(c.fecha_fin_contrato, '%Y-%m-%d') AS fechaFinContrato, DATE_FORMAT(c.fecha_retiro, '%Y-%m-%d') AS fechaRetiro, c.salario
         FROM colaboradores c
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN cargos g ON g.id = c.cargo_id
        WHERE c.id = ?`,
      [id],
    );
    if (!c) throw new NotFoundException('El colaborador no existe');
    return c;
  }
}

function unirLista(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
