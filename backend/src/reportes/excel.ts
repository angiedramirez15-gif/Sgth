import ExcelJS from 'exceljs';

export type TipoColumna = 'texto' | 'fecha' | 'numero' | 'dinero';

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
  ancho?: number;
  tipo?: TipoColumna;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HojaLibre = Hoja<any>;

export interface Hoja<T = unknown> {
  nombre: string;
  columnas: Columna<T>[];
  filas: T[];
  vacio?: string;
}

const PETROLEO = 'FF09424D';
const VERDE = 'FF4DD970';

/**
 * Libro de Excel con el formato de la empresa: nombre, título del reporte, fecha y filtros arriba,
 * encabezados en petróleo, filtros automáticos y la fila de títulos fija al desplazarse.
 */
export async function libroExcel(o: { empresa: string; titulo: string; usuario: string; filtros: string[]; hojas: HojaLibre[] }): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SGTH';
  libro.created = new Date();
  const ahora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });

  for (const h of o.hojas) {
    const ws = libro.addWorksheet(h.nombre.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 5 }],
      properties: { defaultRowHeight: 16 },
      // Para imprimir: horizontal, todas las columnas en el ancho de la hoja y los títulos repetidos
      pageSetup: { orientation: 'landscape', paperSize: 1 as ExcelJS.PaperSize, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:5', margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    });
    const n = Math.max(h.columnas.length, 1);

    ws.mergeCells(1, 1, 1, n);
    ws.getCell(1, 1).value = o.empresa;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: PETROLEO } };
    ws.mergeCells(2, 1, 2, n);
    ws.getCell(2, 1).value = h.nombre === o.titulo ? o.titulo : `${o.titulo}: ${h.nombre}`;
    ws.getCell(2, 1).font = { bold: true, size: 12 };
    ws.mergeCells(3, 1, 3, n);
    ws.getCell(3, 1).value = [`Generado el ${ahora} por ${o.usuario}`, ...o.filtros].join('   |   ');
    ws.getCell(3, 1).font = { size: 9, color: { argb: 'FF5B6B70' } };
    ws.getRow(4).height = 4;
    for (let c = 1; c <= n; c++) ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };

    const encabezado = ws.getRow(5);
    h.columnas.forEach((col, i) => {
      const celda = encabezado.getCell(i + 1);
      celda.value = col.titulo;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PETROLEO } };
      celda.alignment = { vertical: 'middle', wrapText: true };
      ws.getColumn(i + 1).width = col.ancho ?? Math.min(Math.max(col.titulo.length + 4, 12), 40);
    });
    encabezado.height = 22;

    if (!h.filas.length) {
      ws.mergeCells(6, 1, 6, n);
      ws.getCell(6, 1).value = h.vacio ?? 'No hay datos con estos filtros.';
      ws.getCell(6, 1).font = { italic: true, color: { argb: 'FF5B6B70' } };
      continue;
    }

    h.filas.forEach((f, r) => {
      const fila = ws.getRow(6 + r);
      h.columnas.forEach((col, i) => {
        const celda = fila.getCell(i + 1);
        const v = col.valor(f);
        if (v === null || v === undefined || v === '') return;
        if (col.tipo === 'fecha' && typeof v === 'string') {
          const [a, m, d] = v.slice(0, 10).split('-').map(Number);
          celda.value = new Date(Date.UTC(a, m - 1, d));
          celda.numFmt = 'dd/mm/yyyy';
        } else if (col.tipo === 'numero' || col.tipo === 'dinero') {
          celda.value = Number(v);
          celda.numFmt = col.tipo === 'dinero' ? '"$"#,##0' : '#,##0';
        } else {
          celda.value = String(v);
        }
      });
      if (r % 2 === 1) fila.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7F7' } }; });
    });
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + h.filas.length, column: n } };
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}
