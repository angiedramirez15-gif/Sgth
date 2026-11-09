import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import ExcelJS from 'exceljs';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService } from '../database/database.service.js';
import { ColaboradoresService } from './colaboradores.service.js';
import { ColaboradorDto } from './dto/colaborador.dto.js';
import { LISTAS } from './listas.js';

type Lista = 'tiposDocumento' | 'cargos' | 'areas' | 'EPS' | 'AFP' | 'ARL' | 'CCF' | 'CESANTIAS' | keyof typeof LISTAS;

interface Columna {
  titulo: string;
  campo: string; // campo del DTO, o talla:TIPO
  obligatorio?: boolean;
  tipo?: 'texto' | 'fecha' | 'numero';
  lista?: Lista;
  ancho?: number;
  nota?: string;
}

const COLUMNAS: Columna[] = [
  { titulo: 'Tipo de documento', campo: 'tipoDocumentoId', obligatorio: true, lista: 'tiposDocumento', ancho: 26 },
  { titulo: 'Número de documento', campo: 'numeroDocumento', obligatorio: true, ancho: 18, nota: 'Sin puntos ni espacios' },
  { titulo: 'Nombres', campo: 'nombres', obligatorio: true, ancho: 22 },
  { titulo: 'Apellidos', campo: 'apellidos', obligatorio: true, ancho: 22 },
  { titulo: 'Sexo', campo: 'sexo', obligatorio: true, lista: 'sexo', ancho: 12 },
  { titulo: 'Fecha de nacimiento', campo: 'fechaNacimiento', tipo: 'fecha', ancho: 16 },
  { titulo: 'Tipo de sangre', campo: 'tipoSangre', lista: 'tipoSangre', ancho: 12 },
  { titulo: 'Estado civil', campo: 'estadoCivil', lista: 'estadoCivil', ancho: 14 },
  { titulo: 'Número de hijos', campo: 'numeroHijos', tipo: 'numero', ancho: 10 },
  { titulo: 'Personas a cargo', campo: 'personasACargo', tipo: 'numero', ancho: 10 },
  { titulo: 'Nivel educativo', campo: 'nivelEducativo', lista: 'nivelEducativo', ancho: 16 },
  { titulo: 'Teléfono', campo: 'telefono', ancho: 14 },
  { titulo: 'Correo', campo: 'correo', ancho: 26 },
  { titulo: 'Dirección', campo: 'direccion', ancho: 28 },
  { titulo: 'Ciudad de residencia', campo: 'ciudadResidencia', ancho: 16 },
  { titulo: 'Contacto de emergencia', campo: 'contactoEmergenciaNombre', ancho: 24 },
  { titulo: 'Teléfono de emergencia', campo: 'contactoEmergenciaTelefono', ancho: 14 },
  { titulo: 'Cargo', campo: 'cargoId', obligatorio: true, lista: 'cargos', ancho: 26 },
  { titulo: 'Área', campo: 'areaId', obligatorio: true, lista: 'areas', ancho: 20 },
  { titulo: 'Fecha de ingreso', campo: 'fechaIngreso', obligatorio: true, tipo: 'fecha', ancho: 16 },
  { titulo: 'Tipo de contrato', campo: 'tipoContrato', obligatorio: true, lista: 'tipoContrato', ancho: 22 },
  { titulo: 'Fecha fin de contrato', campo: 'fechaFinContrato', tipo: 'fecha', ancho: 16, nota: 'Obligatoria en término fijo y aprendizaje' },
  { titulo: 'Salario', campo: 'salario', tipo: 'numero', ancho: 14, nota: 'Sin puntos ni signo $' },
  { titulo: 'EPS', campo: 'epsId', lista: 'EPS', ancho: 22 },
  { titulo: 'Fondo de pensiones', campo: 'afpId', lista: 'AFP', ancho: 18 },
  { titulo: 'ARL', campo: 'arlId', lista: 'ARL', ancho: 18 },
  { titulo: 'Riesgo ARL', campo: 'nivelRiesgoArl', tipo: 'numero', ancho: 10, nota: 'De 1 a 5' },
  { titulo: 'Caja de compensación', campo: 'ccfId', lista: 'CCF', ancho: 22 },
  { titulo: 'Fondo de cesantías', campo: 'cesantiasId', lista: 'CESANTIAS', ancho: 22 },
  { titulo: 'Banco', campo: 'banco', ancho: 18 },
  { titulo: 'Tipo de cuenta', campo: 'tipoCuenta', lista: 'tipoCuenta', ancho: 12 },
  { titulo: 'Número de cuenta', campo: 'numeroCuenta', ancho: 18 },
  { titulo: 'Talla camisa', campo: 'talla:CAMISA', ancho: 10 },
  { titulo: 'Talla pantalón', campo: 'talla:PANTALON', ancho: 10 },
  { titulo: 'Talla calzado', campo: 'talla:CALZADO', ancho: 10 },
  { titulo: 'Talla guantes', campo: 'talla:GUANTES', ancho: 10 },
];

const PETROLEO = 'FF09424D';
const MAX_FILAS = 1000;

/** Normaliza para comparar sin importar mayúsculas, tildes ni espacios de más. */
const clave = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface ErrorFila {
  fila: number;
  documento: string;
  nombre: string;
  errores: string[];
}

@Injectable()
export class ImportacionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly colaboradores: ColaboradoresService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Opciones de cada lista: texto que se escribe en Excel → valor que se guarda. */
  private async listas(): Promise<Record<Lista, { texto: string; valor: string | number }[]>> {
    const op = await this.colaboradores.opciones();
    const ent = (tipo: string) => (op.entidades as { id: number; tipo: string; nombre: string }[])
      .filter((e) => e.tipo === tipo).map((e) => ({ texto: e.nombre, valor: e.id }));
    const fijas = Object.fromEntries(
      Object.entries(LISTAS).map(([k, v]) => [k, v.map((x) => ({ texto: x.etiqueta, valor: x.valor }))]),
    );
    return {
      ...fijas,
      tiposDocumento: (op.tiposDocumento as { id: number; nombre: string }[]).map((t) => ({ texto: t.nombre, valor: t.id })),
      cargos: (op.cargos as { id: number; nombre: string }[]).map((c) => ({ texto: c.nombre, valor: c.id })),
      areas: (op.areas as { id: number; nombre: string }[]).map((a) => ({ texto: a.nombre, valor: a.id })),
      EPS: ent('EPS'), AFP: ent('AFP'), ARL: ent('ARL'), CCF: ent('CCF'), CESANTIAS: ent('CESANTIAS'),
    } as Record<Lista, { texto: string; valor: string | number }[]>;
  }

  /** Plantilla de Excel con listas desplegables tomadas de los catálogos actuales. */
  async plantilla(): Promise<Buffer> {
    const listas = await this.listas();
    const libro = new ExcelJS.Workbook();
    libro.creator = 'SGTH - DRIM DUIT S.A.S.';

    const hoja = libro.addWorksheet('Colaboradores', { views: [{ state: 'frozen', ySplit: 1, xSplit: 4 }] });
    const opciones = libro.addWorksheet('Listas', { state: 'veryHidden' });
    const instrucciones = libro.addWorksheet('Instrucciones');

    hoja.columns = COLUMNAS.map((c) => ({ header: c.obligatorio ? `${c.titulo} *` : c.titulo, key: c.campo, width: c.ancho ?? 16 }));
    const encabezado = hoja.getRow(1);
    encabezado.height = 34;
    encabezado.eachCell((celda, n) => {
      const c = COLUMNAS[n - 1];
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.obligatorio ? PETROLEO : 'FF4D6166' } };
      celda.alignment = { vertical: 'middle', wrapText: true };
      if (c.nota) celda.note = c.nota;
    });

    // Listas en la hoja oculta y validación de datos en las filas 2..MAX_FILAS
    // (ExcelJS permite validar rangos completos, pero sus tipos no lo declaran)
    const validaciones = (hoja as unknown as { dataValidations: { add(rango: string, v: ExcelJS.DataValidation): void } }).dataValidations;
    let col = 1;
    COLUMNAS.forEach((c, i) => {
      const letra = hoja.getColumn(i + 1).letter;
      const rango = `${letra}2:${letra}${MAX_FILAS + 1}`;
      if (c.lista) {
        const items = listas[c.lista];
        const colLista = opciones.getColumn(col);
        items.forEach((it, j) => (opciones.getCell(j + 1, col).value = it.texto));
        const ref = `Listas!$${colLista.letter}$1:$${colLista.letter}$${Math.max(items.length, 1)}`;
        validaciones.add(rango, {
          type: 'list', allowBlank: !c.obligatorio, formulae: [ref], showErrorMessage: true,
          errorTitle: c.titulo, error: `Seleccione un valor de la lista. Si falta, créelo primero en Catálogos del SGTH y descargue la plantilla de nuevo.`,
        });
        col++;
      } else if (c.tipo === 'fecha') {
        hoja.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
        validaciones.add(rango, {
          type: 'date', operator: 'between', allowBlank: !c.obligatorio, formulae: [new Date(1930, 0, 1), new Date(2100, 0, 1)],
          showErrorMessage: true, errorTitle: c.titulo, error: 'Escriba una fecha válida, por ejemplo 15/03/2024',
        });
      } else if (c.campo === 'numeroDocumento' || c.campo === 'numeroCuenta' || c.campo === 'telefono' || c.campo.startsWith('talla:')) {
        hoja.getColumn(i + 1).numFmt = '@'; // como texto, para no perder ceros a la izquierda
      }
    });

    // Fila de ejemplo, en gris, que se debe borrar
    const ejemplo: Record<string, unknown> = {
      tipoDocumentoId: listas.tiposDocumento[0]?.texto, numeroDocumento: '1113000000', nombres: 'Ejemplo (borre esta fila)',
      apellidos: 'Apellido Apellido', sexo: 'Femenino', fechaNacimiento: new Date(1995, 4, 20), cargoId: listas.cargos[0]?.texto,
      areaId: listas.areas[0]?.texto, fechaIngreso: new Date(2024, 0, 15), tipoContrato: 'Término indefinido',
    };
    const filaEjemplo = hoja.addRow(ejemplo);
    filaEjemplo.font = { italic: true, color: { argb: 'FF8A9A9D' } };

    instrucciones.columns = [{ width: 110 }];
    [
      ['Cómo llenar la plantilla de colaboradores', true],
      ['1. Llene una fila por colaborador en la hoja "Colaboradores". Borre la fila de ejemplo.', false],
      ['2. Las columnas con * (encabezado petróleo) son obligatorias.', false],
      ['3. En las columnas con lista desplegable, seleccione un valor de la lista. Los cargos, áreas, EPS, ARL y demás vienen de los Catálogos del SGTH.', false],
      ['   Si falta un cargo o una entidad, créelo primero en el SGTH (Administración > Catálogos) y descargue la plantilla de nuevo.', false],
      ['4. Escriba las fechas como día/mes/año, por ejemplo 15/03/2024.', false],
      ['5. El número de documento va sin puntos ni espacios. El salario va sin puntos ni signo $.', false],
      ['6. En el SGTH, use "Revisar archivo": el sistema muestra los errores fila por fila y no guarda nada hasta que todo esté correcto.', false],
      ['7. El jefe inmediato y los documentos se registran después, desde la ficha de cada colaborador.', false],
      [`Máximo ${MAX_FILAS} colaboradores por archivo.`, false],
    ].forEach(([t, negrita], i) => {
      const c = instrucciones.getCell(i + 1, 1);
      c.value = t as string;
      c.font = negrita ? { bold: true, size: 14, color: { argb: PETROLEO } } : { size: 11 };
    });

    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  /**
   * Revisa el archivo. Si confirmar es true y no hay errores, crea todos los colaboradores
   * en una sola transacción: o se guardan todos o ninguno.
   */
  async importar(archivo: Buffer | undefined, confirmar: boolean, actor: UsuarioToken, ip?: string) {
    if (!archivo?.length) throw new BadRequestException('Seleccione el archivo de Excel');
    const libro = new ExcelJS.Workbook();
    try {
      await libro.xlsx.load(archivo as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('El archivo no es un Excel válido (.xlsx). Use la plantilla del sistema');
    }
    const hoja = libro.getWorksheet('Colaboradores') ?? libro.worksheets[0];
    if (!hoja) throw new BadRequestException('El archivo no tiene hojas');

    // Ubicar cada columna por su título (tolera que muevan columnas)
    const posicion = new Map<string, number>();
    hoja.getRow(1).eachCell((celda, n) => {
      const titulo = clave(String(celda.value ?? '').replace('*', ''));
      const c = COLUMNAS.find((x) => clave(x.titulo) === titulo);
      if (c) posicion.set(c.campo, n);
    });
    const faltan = COLUMNAS.filter((c) => c.obligatorio && !posicion.has(c.campo)).map((c) => c.titulo);
    if (faltan.length) throw new BadRequestException(`Al archivo le faltan columnas: ${faltan.join(', ')}. Use la plantilla del sistema`);

    const listas = await this.listas();
    const buscar = new Map(Object.entries(listas).map(([k, items]) => [k, new Map(items.map((it) => [clave(it.texto), it.valor]))]));
    // También se acepta el código (CC, M/F, INDEFINIDO…)
    for (const [k, items] of Object.entries(LISTAS)) for (const it of items) buscar.get(k)!.set(clave(it.valor), it.valor);
    const tiposDoc = (await this.colaboradores.opciones()).tiposDocumento as { id: number; codigo: string }[];
    for (const t of tiposDoc) buscar.get('tiposDocumento')!.set(clave(t.codigo), t.id);

    // Para nombres que no coinciden exacto: "Sura" encuentra "EPS Sura" si es la única que lo contiene
    const textos = new Map(Object.entries(listas).map(([k, items]) => [k, items.map((it) => ({ clave: clave(it.texto), texto: it.texto, valor: it.valor }))]));
    const contienePalabras = (largo: string, corto: string) => corto.length >= 3 && ` ${largo} `.includes(` ${corto} `);
    const resolver = (lista: Lista, v: unknown): { valor?: string | number; sugerencia?: string } => {
      const k = clave(v);
      const exacto = buscar.get(lista)!.get(k);
      if (exacto !== undefined) return { valor: exacto };
      const items = textos.get(lista) ?? [];
      const parecidos = items.filter((it) => contienePalabras(it.clave, k) || contienePalabras(k, it.clave));
      if (parecidos.length === 1) return { valor: parecidos[0].valor };
      // Sugerencia: mismo comienzo de palabra ("Administrativo" → "Administración")
      const raiz = k.slice(0, Math.max(6, Math.floor(k.length * 0.6)));
      const sugerido = items.find((it) => raiz.length >= 6 && it.clave.startsWith(raiz.slice(0, 6)));
      return { sugerencia: sugerido?.texto };
    };
    const faltantes = new Map<string, Set<string>>(); // "Cargo" → nombres que no existen en el catálogo

    const existentes = new Set(
      (await this.db.consultar<{ tipo_documento_id: number; numero_documento: string }>('SELECT tipo_documento_id, numero_documento FROM colaboradores'))
        .map((c) => `${c.tipo_documento_id}|${c.numero_documento}`),
    );

    const filas: { fila: number; dto: ColaboradorDto; nombre: string; documento: string }[] = [];
    const errores: ErrorFila[] = [];
    const enArchivo = new Map<string, number>();

    for (let n = 2; n <= hoja.rowCount; n++) {
      const fila = hoja.getRow(n);
      const valor = (campo: string) => {
        const p = posicion.get(campo);
        return p ? this.valorCelda(fila.getCell(p)) : null;
      };
      if (COLUMNAS.every((c) => valor(c.campo) === null)) continue; // fila vacía
      if (clave(valor('nombres')).startsWith('ejemplo')) continue; // fila de ejemplo sin borrar
      if (filas.length + errores.length >= MAX_FILAS) throw new BadRequestException(`El archivo supera el máximo de ${MAX_FILAS} colaboradores`);

      const problemas: string[] = [];
      const camposConError = new Set<string>();
      const datos: Record<string, unknown> = { tallas: {} };
      for (const c of COLUMNAS) {
        let v = valor(c.campo);
        if (v === null) continue;
        if (c.lista) {
          const r = resolver(c.lista, v);
          if (r.valor === undefined) {
            camposConError.add(c.campo);
            const esCatalogo = !(c.lista in LISTAS);
            if (esCatalogo) {
              if (!faltantes.has(c.titulo)) faltantes.set(c.titulo, new Set());
              faltantes.get(c.titulo)!.add(String(v).trim());
            }
            problemas.push(
              `${c.titulo}: "${v}" no existe ${esCatalogo ? 'en los catálogos del sistema' : 'en la lista'}` +
              (r.sugerencia ? `. ¿Quiso decir "${r.sugerencia}"?` : ''),
            );
            continue;
          }
          v = r.valor;
        } else if (c.tipo === 'fecha') {
          const f = this.fecha(v);
          if (!f) { camposConError.add(c.campo); problemas.push(`${c.titulo}: "${v}" no es una fecha válida (use día/mes/año)`); continue; }
          v = f;
        } else if (c.tipo === 'numero') {
          // Acepta "1.750.905", "$ 1.750.905" o el número de Excel
          if (typeof v === 'string') v = v.replace(/[$\s.]/g, '').replace(',', '.');
        } else if (typeof v === 'number') {
          // Documento, teléfono, cuenta o talla escritos como número en Excel
          if (!Number.isSafeInteger(v)) {
            camposConError.add(c.campo);
            problemas.push(`${c.titulo}: el número es muy largo y Excel lo cambió. Formatee la celda como texto y escríbalo de nuevo`);
            continue;
          }
          v = String(v);
        } else if (v instanceof Date) {
          v = String(v);
        }
        if (c.campo.startsWith('talla:')) (datos.tallas as Record<string, unknown>)[c.campo.slice(6)] = String(v);
        else datos[c.campo] = v;
      }

      const dto = plainToInstance(ColaboradorDto, datos);
      for (const e of await validate(dto, { whitelist: true })) {
        if (!camposConError.has(e.property)) problemas.push(...Object.values(e.constraints ?? {}));
      }
      if (!problemas.length) {
        try {
          await this.colaboradores.validar(dto, this.db);
        } catch (e) {
          const m = (e as BadRequestException).getResponse?.() as { message?: string | string[] } | undefined;
          problemas.push(...([] as string[]).concat(m?.message ?? (e as Error).message));
        }
      }

      const doc = String(dto.numeroDocumento ?? valor('numeroDocumento') ?? '');
      const llave = `${dto.tipoDocumentoId}|${dto.numeroDocumento}`;
      if (dto.tipoDocumentoId && dto.numeroDocumento) {
        if (existentes.has(llave)) problemas.push(`Ya existe en el SGTH un colaborador con el documento ${doc}`);
        if (enArchivo.has(llave)) problemas.push(`El documento ${doc} está repetido en la fila ${enArchivo.get(llave)}`);
        else enArchivo.set(llave, n);
      }

      const nombre = `${valor('nombres') ?? ''} ${valor('apellidos') ?? ''}`.trim();
      if (problemas.length) errores.push({ fila: n, documento: doc, nombre, errores: [...new Set(problemas)] });
      else filas.push({ fila: n, dto, nombre, documento: doc });
    }

    const resumen = {
      total: filas.length + errores.length,
      validas: filas.length,
      errores,
      vistaPrevia: filas.slice(0, 10).map((f) => ({ fila: f.fila, documento: f.documento, nombre: f.nombre })),
      faltantes: [...faltantes.entries()].map(([lista, valores]) => ({ lista, valores: [...valores].sort() })),
      creados: 0,
    };
    if (!resumen.total) throw new BadRequestException('El archivo no tiene colaboradores. Llene la hoja "Colaboradores" desde la fila 2');
    if (!confirmar || errores.length) return resumen;

    await this.db.transaccion(async (cx) => {
      for (const f of filas) await this.colaboradores.insertar(f.dto, actor, cx);
      await this.auditoria.registrar(
        { usuarioId: actor.sub, accion: 'CREAR', tabla: 'colaboradores', despues: { importacion: true, cantidad: filas.length, documentos: filas.map((f) => f.documento) }, ip },
        cx,
      );
    });
    return { ...resumen, creados: filas.length };
  }

  /** Valor de una celda como texto, número o fecha; null si está vacía. */
  private valorCelda(celda: ExcelJS.Cell): string | number | Date | null {
    let v: unknown = celda.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as { result?: unknown; text?: string; richText?: { text: string }[]; hyperlink?: string };
      v = o.result ?? o.text ?? o.richText?.map((r) => r.text).join('') ?? null;
    }
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
    return v as number | Date;
  }

  /** Acepta fechas de Excel, dd/mm/aaaa y aaaa-mm-dd. Devuelve aaaa-mm-dd. */
  private fecha(v: unknown): string | null {
    let d: Date | null = null;
    if (v instanceof Date) d = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    else if (typeof v === 'number') d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); // número de serie de Excel
    else if (typeof v === 'string') {
      const m1 = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      const m2 = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m1) d = new Date(Date.UTC(+m1[3], +m1[2] - 1, +m1[1]));
      else if (m2) d = new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3]));
      if (d && m1 && d.getUTCDate() !== +m1[1]) return null; // ej. 31/02
      if (d && m2 && d.getUTCDate() !== +m2[3]) return null;
    }
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
}
