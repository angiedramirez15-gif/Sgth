import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';
import { CertificadosService } from '../certificados/certificados.service.js';
import { CAMPOS_CERTIFICADO } from '../certificados/textos-certificado.js';
import type { PlantillaDto } from './dto/plantilla.dto.js';
import { type LineaPdf, PdfActaService } from './pdf-acta.service.js';
import { CAMPOS_PLANTILLA, NOMBRE_PLANTILLA, type Plantilla, rellenar } from './textos.js';

/** Las plantillas de actas y la del certificado laboral, que se edita en la misma pantalla. */
export type TipoPlantilla = Plantilla | 'CERTIFICADO';
export const PLANTILLAS: TipoPlantilla[] = ['DOTACION', 'EPP', 'EQUIPOS', 'MUEBLES', 'OTROS', 'DEVOLUCION', 'CERTIFICADO'];
const NOMBRE: Record<TipoPlantilla, string> = { ...NOMBRE_PLANTILLA, CERTIFICADO: 'Certificado laboral' };

/** Campos {{…}} válidos en cada plantilla. */
function camposDe(plantilla: TipoPlantilla) {
  return plantilla === 'CERTIFICADO' ? CAMPOS_CERTIFICADO : CAMPOS_PLANTILLA.filter((c) => !c.solo || c.solo.includes(plantilla));
}

/** Cuántos documentos (actas o certificados) se hicieron con cada versión. */
const USOS = (alias: string) => `((SELECT COUNT(*) FROM actas a WHERE a.plantilla_id = ${alias}.id)
  + (SELECT COUNT(*) FROM certificados_laborales k WHERE k.plantilla_id = ${alias}.id))`;

interface FilaPlantilla {
  id: number;
  plantilla: TipoPlantilla;
  version: number;
  titulo: string;
  texto_introduccion: string;
  texto_manifiesta: string;
  clausulas: string;
  vigente: number;
  creado_en: string;
  creado_por: string | null;
}

/** Textos de las actas. Cada cambio crea una versión nueva; las actas guardan la versión con la que se hicieron. */
@Injectable()
export class PlantillasService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
    private readonly pdf: PdfActaService,
    private readonly certificados: CertificadosService,
  ) {}

  async listar() {
    const filas = await this.db.consultar<{ plantilla: TipoPlantilla; version: number; creado_en: string; creado_por: string | null; versiones: number; actas: number }>(
      `SELECT p.plantilla, p.version, DATE_FORMAT(p.creado_en, '%Y-%m-%d %H:%i') AS creado_en, u.nombre_completo AS creado_por,
              (SELECT COUNT(*) FROM plantillas_acta x WHERE x.plantilla = p.plantilla) AS versiones,
              (SELECT SUM(${USOS('x')}) FROM plantillas_acta x WHERE x.plantilla = p.plantilla) AS actas
         FROM plantillas_acta p LEFT JOIN usuarios u ON u.id = p.creado_por
        WHERE p.vigente = 1`,
    );
    return PLANTILLAS.filter((p) => p !== 'CERTIFICADO' || filas.some((x) => x.plantilla === p)).map((p) => {
      const f = filas.find((x) => x.plantilla === p);
      return {
        plantilla: p,
        nombre: NOMBRE[p],
        version: f?.version ?? null,
        actualizada: f?.creado_en ?? null,
        actualizadaPor: f?.creado_por ?? null,
        versiones: Number(f?.versiones ?? 0),
        actas: Number(f?.actas ?? 0),
      };
    });
  }

  async versiones(plantilla: TipoPlantilla) {
    this.validarTipo(plantilla);
    return (await this.db.consultar<{ id: number; version: number; vigente: number; creado_en: string; creado_por: string | null; actas: number }>(
      `SELECT p.id, p.version, p.vigente, DATE_FORMAT(p.creado_en, '%Y-%m-%d %H:%i') AS creado_en, u.nombre_completo AS creado_por,
              ${USOS('p')} AS actas
         FROM plantillas_acta p LEFT JOIN usuarios u ON u.id = p.creado_por
        WHERE p.plantilla = ? ORDER BY p.version DESC`,
      [plantilla],
    )).map((v) => ({ id: v.id, version: v.version, vigente: !!v.vigente, creadoEn: v.creado_en, creadoPor: v.creado_por, actas: Number(v.actas) }));
  }

  /** Una versión concreta; sin id, la vigente. */
  async obtener(plantilla: TipoPlantilla, id?: number) {
    this.validarTipo(plantilla);
    const f = await this.db.uno<FilaPlantilla>(
      `SELECT p.*, DATE_FORMAT(p.creado_en, '%Y-%m-%d %H:%i') AS creado_en, u.nombre_completo AS creado_por
         FROM plantillas_acta p LEFT JOIN usuarios u ON u.id = p.creado_por
        WHERE p.plantilla = ? AND ${id ? 'p.id = ?' : 'p.vigente = 1'} ORDER BY p.version DESC LIMIT 1`,
      id ? [plantilla, id] : [plantilla],
    );
    if (!f) throw new NotFoundException('La plantilla no existe');
    return {
      id: f.id,
      plantilla: f.plantilla,
      nombre: NOMBRE[f.plantilla],
      version: f.version,
      vigente: !!f.vigente,
      titulo: f.titulo,
      textoIntroduccion: f.texto_introduccion,
      textoManifiesta: f.texto_manifiesta,
      clausulas: JSON.parse(f.clausulas) as string[],
      creadoEn: f.creado_en,
      creadoPor: f.creado_por,
      campos: camposDe(f.plantilla),
    };
  }

  /** Guarda los textos como versión nueva y la deja vigente. */
  async guardar(plantilla: TipoPlantilla, dto: PlantillaDto, u: UsuarioToken, ip?: string) {
    this.validarTipo(plantilla);
    this.validarCampos(plantilla, dto);
    const id = await this.db.transaccion(async (cx) => {
      const ultima = await cx.uno<{ version: number }>('SELECT MAX(version) AS version FROM plantillas_acta WHERE plantilla = ? FOR UPDATE', [plantilla]);
      const anterior = await cx.uno<FilaPlantilla>('SELECT * FROM plantillas_acta WHERE plantilla = ? AND vigente = 1', [plantilla]);
      if (anterior && anterior.titulo === dto.titulo && anterior.texto_introduccion === dto.textoIntroduccion
        && anterior.texto_manifiesta === dto.textoManifiesta && JSON.stringify(JSON.parse(anterior.clausulas)) === JSON.stringify(dto.clausulas)) {
        throw new BadRequestException('No hay cambios para guardar');
      }
      await cx.ejecutar('UPDATE plantillas_acta SET vigente = 0 WHERE plantilla = ?', [plantilla]);
      const version = (ultima?.version ?? 0) + 1;
      const r = await cx.ejecutar(
        `INSERT INTO plantillas_acta (plantilla, version, titulo, texto_introduccion, texto_manifiesta, clausulas, vigente, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [plantilla, version, dto.titulo, dto.textoIntroduccion, dto.textoManifiesta, JSON.stringify(dto.clausulas), u.sub],
      );
      await this.auditoria.registrar({
        usuarioId: u.sub, accion: 'EDITAR', tabla: 'plantillas_acta', registroId: r.insertId,
        antes: anterior ? { version: anterior.version } : null, despues: { plantilla, version }, ip,
      }, cx);
      return r.insertId;
    });
    return this.obtener(plantilla, id);
  }

  /** PDF de ejemplo con los textos enviados (sin guardar) y datos ficticios. */
  async vistaPrevia(plantilla: TipoPlantilla, dto: PlantillaDto): Promise<Buffer> {
    this.validarTipo(plantilla);
    this.validarCampos(plantilla, dto);
    if (plantilla === 'CERTIFICADO') {
      return this.certificados.armarPdf({
        consecutivo: 'CER-0000-0000',
        datos: {
          sexo: 'F', nombre: 'Nombre De Ejemplo', tipoDoc: 'CC', numeroDoc: '1000000000', cargo: 'Cargo de ejemplo',
          tipoContrato: 'INDEFINIDO', fechaIngreso: '2024-03-04', fechaFinContrato: null, fechaRetiro: null, salario: 2_500_000,
        },
        fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
        dirigidoA: null,
        firmante: {
          nombre: (await this.config.texto('certificado_firmante_nombre', '')) || 'Nombre de quien firma',
          cargo: (await this.config.texto('certificado_firmante_cargo', '')) || 'Directora Financiera',
        },
        titulo: dto.titulo, introduccion: dto.textoIntroduccion, manifiesta: dto.textoManifiesta, clausulas: dto.clausulas,
        nota: 'Vista previa con datos de ejemplo. No es un certificado real.',
      });
    }
    const empresa = await this.config.texto('empresa_nombre', 'DRIM DUIT S.A.S.');
    const ciudad = await this.config.texto('ciudad_actas', 'Palmira');
    const pie = (await this.config.texto('pie_actas', '')).split(/\s*\|\s*|\n/).map((r) => r.trim()).filter(Boolean);
    const campos = {
      sexo: 'F', nombre: 'Nombre De Ejemplo', tipoDoc: 'CC', numeroDoc: '1000000000', cargo: 'Cargo de ejemplo', empresa,
      periodo: '3 de 2026', motivo: 'ingreso a la empresa', ubicacion: 'la oficina administrativa', anterior: null,
    };
    const devolucion = plantilla === 'DEVOLUCION';
    const linea = (descripcion: string, extra: Partial<LineaPdf> = {}): LineaPdf => ({
      cantidad: 1, unidad: 'Und', descripcion, talla: null, marcaModelo: null, serialPlaca: null, placa: null, estado: null, observaciones: null, reposicion: null, ...extra,
    });
    const lineas: Record<Plantilla, LineaPdf[]> = {
      DOTACION: [linea('Camisa tipo polo', { cantidad: 2, talla: 'M' }), linea('Botas de cuero', { unidad: 'Par', talla: '38' })],
      EPP: [linea('Casco de seguridad', { reposicion: '10/11/2027' }), linea('Guantes de nitrilo', { unidad: 'Par', talla: 'M', reposicion: '10/12/2026' })],
      EQUIPOS: [linea('Computador portátil', { marcaModelo: 'Marca Modelo', serialPlaca: 'SERIAL123\nDD-EQ-0001', estado: 'Nuevo' })],
      MUEBLES: [linea('Silla ergonómica', { placa: 'DD-MU-0001', estado: 'Bueno' })],
      OTROS: [linea('Llave de oficina')],
      DEVOLUCION: [linea('Computador portátil', { serialPlaca: 'SERIAL123\nDD-EQ-0001', estado: 'Bueno', observaciones: 'Sin novedad' })],
    };
    const quien = { nombre: 'Usuario Del Sistema', cargo: 'Analista de Talento Humano' };
    const colaborador = { nombre: campos.nombre, cargo: campos.cargo, documento: 'C.C. 1000000000' };
    return this.pdf.generar({
      plantilla,
      consecutivo: 'ACT-0000-0000',
      ciudad,
      fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      titulo: dto.titulo,
      destinatario: { tratamiento: 'Señora', nombre: campos.nombre, cargo: campos.cargo },
      introduccion: rellenar(dto.textoIntroduccion, campos),
      manifiesta: rellenar(dto.textoManifiesta, campos),
      clausulas: dto.clausulas.map((c) => rellenar(c, campos)),
      lineas: lineas[plantilla],
      observaciones: null,
      firmas: devolucion
        ? [{ titulo: 'ENTREGA:', ...colaborador }, { titulo: 'RECIBE:', ...quien }]
        : [{ titulo: 'ENTREGA:', ...quien }, { titulo: 'RECIBE A CONFORMIDAD:', ...colaborador }],
      pie,
      nota: 'Vista previa con datos de ejemplo. No es un acta real.',
    });
  }

  private validarTipo(plantilla: string): asserts plantilla is TipoPlantilla {
    if (!PLANTILLAS.includes(plantilla as TipoPlantilla)) throw new BadRequestException('Tipo de plantilla no válido');
  }

  /** Avisa de campos {{…}} mal escritos o que no aplican a este tipo de acta. */
  private validarCampos(plantilla: TipoPlantilla, dto: PlantillaDto) {
    const validos = new Set(camposDe(plantilla).map((c) => c.campo));
    const todos = [dto.titulo, dto.textoIntroduccion, dto.textoManifiesta, ...dto.clausulas].join('\n');
    const malos = [...new Set([...todos.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]))].filter((c) => !validos.has(c));
    if (malos.length) {
      throw new BadRequestException(`Estos campos no existen o no aplican a esta plantilla: ${malos.map((m) => `{{${m}}}`).join(', ')}`);
    }
    const sueltas = todos.replace(/\{\{[A-Z_]+\}\}/g, '');
    if (/\{\{|\}\}/.test(sueltas)) throw new BadRequestException('Hay llaves {{ }} sin cerrar o con espacios. Escriba los campos como {{NOMBRE}}');
  }
}
