import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import ExcelJS from 'exceljs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchivosService, detectarTipo } from '../archivos/archivos.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ColaboradoresService } from './colaboradores.service.js';
import { ColaboradorDto } from './dto/colaborador.dto.js';
import { ImportacionService } from './importacion.service.js';

const actor: UsuarioToken = { sub: 1, usuario: 'admin', nombre: 'A', cargo: 'A', rol: 'ADMIN', permisos: ['colaboradores.ver_sensibles'], cambiarClave: false, motivoClave: null, aceptarCompromiso: false, dobleVerificacion: false, v: 0, ini: 0 };
const PDF = Buffer.from('%PDF-1.7\n%prueba\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const base = {
  tipoDocumentoId: 1, numeroDocumento: '1.113.456.789', nombres: '  Ana  María ', apellidos: 'Gómez', sexo: 'F',
  cargoId: 2, areaId: 3, fechaIngreso: '2024-01-15', tipoContrato: 'INDEFINIDO',
};

/** Base de datos simulada en la que todo existe y está activo. */
const dbTodoExiste = () => ({
  uno: vi.fn(async () => ({ ok: 1 })),
  consultar: vi.fn(async () => []),
  ejecutar: vi.fn(async () => ({ insertId: 1, affectedRows: 1 })),
});

describe('Archivos', () => {
  it('reconoce el tipo real por el contenido, no por el nombre', () => {
    expect(detectarTipo(PDF)).toBe('pdf');
    expect(detectarTipo(PNG)).toBe('png');
    expect(detectarTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe('jpg');
    expect(detectarTipo(Buffer.from('MZ\x90\x00 ejecutable de windows'))).toBeNull();
  });

  it('guarda con nombre generado dentro de la carpeta y rechaza tipos y tamaños no permitidos', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sgth-'));
    const s = new ArchivosService({ get: () => dir } as never, {} as never);
    const g = await s.guardar(PDF, 'colaboradores/7/documentos', ['pdf'], 10);
    expect(g.ruta).toMatch(/^colaboradores\/7\/documentos\/[0-9a-f-]{36}\.pdf$/);
    expect(await readFile(join(dir, ...g.ruta.split('/')))).toEqual(PDF);
    await expect(s.guardar(PNG, 'x', ['pdf'], 10)).rejects.toThrow('Solo se aceptan: PDF');
    await expect(s.guardar(Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]), 'x', ['pdf'], 1)).rejects.toThrow('1 MB');
  });

  it('no permite salir de la carpeta base', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sgth-'));
    const s = new ArchivosService({ get: () => dir } as never, {} as never);
    await expect(s.abrir('../../windows/system32/config')).rejects.toThrow('Ruta de archivo no válida');
    await expect(s.guardar(PDF, '../fuera', ['pdf'], 10)).rejects.toThrow('Ruta de archivo no válida');
    expect(await readdir(dir)).toEqual([]);
  });
});

describe('ColaboradorDto', () => {
  it('limpia el documento y los espacios de los nombres', async () => {
    const dto = plainToInstance(ColaboradorDto, base);
    expect(await validate(dto)).toEqual([]);
    expect(dto.numeroDocumento).toBe('1113456789');
    expect(dto.nombres).toBe('Ana María');
    expect(dto.derechoDotacion).toBe('AUTO');
  });

  it('rechaza correo, riesgo ARL, cuenta y fechas inválidas con mensajes en español', async () => {
    const dto = plainToInstance(ColaboradorDto, { ...base, correo: 'no', nivelRiesgoArl: 7, numeroCuenta: '12ab', fechaIngreso: '2024-13-40' });
    const mensajes = (await validate(dto)).flatMap((e) => Object.values(e.constraints ?? {}));
    expect(mensajes).toEqual(expect.arrayContaining([
      'El correo no es válido', 'Seleccione un riesgo ARL de 1 a 5', 'El número de cuenta debe tener solo dígitos', 'Escriba una fecha de ingreso válida',
    ]));
  });
});

describe('ColaboradoresService.validar', () => {
  const s = new ColaboradoresService({} as never, {} as never);
  const dto = (extra: object) => plainToInstance(ColaboradorDto, { ...base, ...extra });

  it('exige fecha de fin en contrato a término fijo y que sea posterior al ingreso', async () => {
    await expect(s.validar(dto({ tipoContrato: 'FIJO' }), dbTodoExiste() as never)).rejects.toThrow(BadRequestException);
    const e = await s.validar(dto({ tipoContrato: 'FIJO', fechaFinContrato: '2023-12-31' }), dbTodoExiste() as never).catch((x) => x.getResponse().message);
    expect(e).toContain('La fecha de fin de contrato no puede ser anterior a la fecha de ingreso');
  });

  it('no permite que alguien sea su propio jefe', async () => {
    const e = await s.validar(dto({ jefeId: 5 }), dbTodoExiste() as never, 5).catch((x) => x.getResponse().message);
    expect(e).toContain('Un colaborador no puede ser su propio jefe');
  });

  it('avisa si la EPS no existe o no es de tipo EPS', async () => {
    const db = { uno: vi.fn(async (sql: string) => (sql.includes('entidades') ? null : { ok: 1 })) };
    const e = await s.validar(dto({ epsId: 9 }), db as never).catch((x) => x.getResponse().message);
    expect(e).toContain('La EPS seleccionada no existe o está inactiva');
  });

  it('devuelve las columnas listas para guardar', async () => {
    const v = await s.validar(dto({ salario: '1750905', tallas: { CALZADO: '38' } }), dbTodoExiste() as never);
    expect(v).toMatchObject({ numero_documento: '1113456789', salario: 1750905, cargo_id: 2, jefe_id: null });
  });
});

describe('ImportacionService', () => {
  const opciones = {
    tiposDocumento: [{ id: 1, codigo: 'CC', nombre: 'Cédula de ciudadanía' }],
    areas: [{ id: 3, nombre: 'Obra' }],
    cargos: [{ id: 2, nombre: 'Auxiliar de obra' }],
    entidades: [{ id: 10, tipo: 'EPS', nombre: 'Nueva EPS' }, { id: 11, tipo: 'ARL', nombre: 'Positiva' }],
    jefes: [],
  };
  const crearServicio = (existentes: { tipo_documento_id: number; numero_documento: string }[] = []) => {
    const insertados: ColaboradorDto[] = [];
    const colaboradores = {
      opciones: vi.fn(async () => ({ ...opciones, listas: {} })),
      validar: vi.fn(async (d: ColaboradorDto) => {
        if (d.tipoContrato === 'FIJO' && !d.fechaFinContrato) throw new BadRequestException(['Un contrato de término fijo necesita fecha de fin']);
        return {};
      }),
      insertar: vi.fn(async (d: ColaboradorDto) => void insertados.push(d)),
    };
    const db = { consultar: vi.fn(async () => existentes), transaccion: vi.fn(async (fn: (cx: unknown) => unknown) => fn({})) };
    const s = new ImportacionService(db as never, colaboradores as never, { registrar: vi.fn() } as never);
    return { s, insertados };
  };

  /** Genera la plantilla real, borra el ejemplo y escribe filas como lo haría una persona. */
  async function archivoCon(filas: Record<string, unknown>[]) {
    const { s } = crearServicio();
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await s.plantilla()) as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet('Colaboradores')!;
    hoja.spliceRows(2, 1);
    const titulos: string[] = [];
    hoja.getRow(1).eachCell((c, n) => (titulos[n] = String(c.value).replace(' *', '')));
    filas.forEach((f, i) => {
      for (const [titulo, valor] of Object.entries(f)) hoja.getRow(i + 2).getCell(titulos.indexOf(titulo)).value = valor as ExcelJS.CellValue;
    });
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  const fila = (extra: object = {}) => ({
    'Tipo de documento': 'Cédula de ciudadanía', 'Número de documento': '1113000001', Nombres: 'Luis', Apellidos: 'Rojas',
    Sexo: 'Masculino', Cargo: 'Auxiliar de obra', Área: 'obra', 'Fecha de ingreso': '15/03/2024', 'Tipo de contrato': 'Término indefinido',
    ...extra,
  });

  it('la plantilla trae las listas desplegables y las instrucciones', async () => {
    const { s } = crearServicio();
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await s.plantilla()) as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Colaboradores', 'Listas', 'Instrucciones']);
    expect(libro.getWorksheet('Colaboradores')!.getCell('A1').value).toBe('Tipo de documento *');
    expect(libro.getWorksheet('Colaboradores')!.getCell('A2').dataValidation?.type).toBe('list');
  });

  it('revisa sin guardar, acepta mayúsculas y tildes distintas, y traduce las listas', async () => {
    const archivo = await archivoCon([fila({ EPS: 'NUEVA EPS', 'Talla calzado': '40', 'Fecha de nacimiento': new Date(Date.UTC(1990, 6, 9)) })]);
    const { s, insertados } = crearServicio();
    const r = await s.importar(archivo, false, actor);
    expect(r).toMatchObject({ total: 1, validas: 1, errores: [], creados: 0 });
    expect(insertados).toHaveLength(0);
  });

  it('confirma y crea todos cuando no hay errores', async () => {
    const archivo = await archivoCon([fila(), fila({ 'Número de documento': '1113000002', Nombres: 'Eva' })]);
    const { s, insertados } = crearServicio();
    const r = await s.importar(archivo, true, actor);
    expect(r.creados).toBe(2);
    expect(insertados[0]).toMatchObject({ tipoDocumentoId: 1, cargoId: 2, areaId: 3, sexo: 'M', tipoContrato: 'INDEFINIDO', fechaIngreso: '2024-03-15' });
  });

  it('muestra los errores fila por fila y no guarda nada si hay alguno', async () => {
    const archivo = await archivoCon([
      fila(),
      fila({ 'Número de documento': '1113000001' }), // repetido en el archivo
      fila({ 'Número de documento': '999', Cargo: 'Gerente general', 'Fecha de ingreso': '31/02/2024' }),
      fila({ 'Número de documento': '1113000005', 'Tipo de contrato': 'Término fijo' }),
      fila({ 'Número de documento': '55' }), // ya existe en el sistema
    ]);
    const { s, insertados } = crearServicio([{ tipo_documento_id: 1, numero_documento: '55' }]);
    const r = await s.importar(archivo, true, actor);
    expect(r.creados).toBe(0);
    expect(insertados).toHaveLength(0);
    const porFila = Object.fromEntries(r.errores.map((e) => [e.fila, e.errores.join(' | ')]));
    expect(porFila[3]).toContain('repetido en la fila 2');
    expect(porFila[4]).toContain('Cargo: "Gerente general" no existe en los catálogos del sistema');
    expect(porFila[4]).toContain('no es una fecha válida');
    expect(porFila[5]).toContain('término fijo necesita fecha de fin');
    expect(porFila[6]).toContain('Ya existe en el SGTH');
  });

  it('acepta documento, teléfono y salario escritos como número en Excel (caso real de la primera importación)', async () => {
    const archivo = await archivoCon([fila({ 'Número de documento': 16737348, Teléfono: 3157894561, Salario: '1.750.905' })]);
    const { s, insertados } = crearServicio();
    const r = await s.importar(archivo, true, actor);
    expect(r.errores).toEqual([]);
    expect(insertados[0]).toMatchObject({ numeroDocumento: '16737348', telefono: '3157894561', salario: 1750905 });
  });

  it('encuentra "Sura" como "EPS Sura", sugiere nombres parecidos y resume lo que falta en los catálogos', async () => {
    const archivo = await archivoCon([
      fila({ 'Número de documento': 16737348, EPS: 'Nueva', Área: 'Obras civiles', Cargo: 'General General' }),
      fila({ 'Número de documento': 31477806, Cargo: 'Asistente de General y Tesoreria', Área: 'Obra' }),
    ]);
    const { s } = crearServicio();
    const r = await s.importar(archivo, false, actor);
    const fila2 = r.errores.find((e) => e.fila === 2)!.errores;
    expect(fila2.join(' ')).not.toContain('EPS'); // "Nueva" → "Nueva EPS"
    expect(fila2).toContain('Cargo: "General General" no existe en los catálogos del sistema');
    expect(fila2.some((m) => m.startsWith('Área: "Obras civiles"'))).toBe(true);
    // Sin mensajes repetidos por el mismo campo
    expect(fila2).not.toContain('Seleccione el cargo');
    expect(fila2.join(' ')).not.toContain('número de documento');
    expect(r.faltantes).toEqual([
      { lista: 'Cargo', valores: ['Asistente de General y Tesoreria', 'General General'] },
      { lista: 'Área', valores: ['Obras civiles'] },
    ]);
  });

  it('sugiere el nombre correcto cuando está mal escrito', async () => {
    const archivo = await archivoCon([fila({ Cargo: 'Auxiliar de obras' })]);
    const { s } = crearServicio();
    const r = await s.importar(archivo, false, actor);
    expect(r.errores[0].errores[0]).toBe('Cargo: "Auxiliar de obras" no existe en los catálogos del sistema. ¿Quiso decir "Auxiliar de obra"?');
  });

  it('rechaza archivos que no son Excel', async () => {
    const { s } = crearServicio();
    await expect(s.importar(PDF, false, actor)).rejects.toThrow('no es un Excel válido');
  });
});
