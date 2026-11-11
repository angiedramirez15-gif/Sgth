import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { type Columna, COLUMNAS, fechaLarga, type Plantilla } from './textos.js';

const PETROLEO = '#09424D';
const TINTA = '#111111';
const GRIS = '#555555';
const RUTA_LOGO = fileURLToPath(new URL('../../assets/marca/logo-drim-duit.png', import.meta.url));

export interface LineaPdf {
  cantidad: number;
  unidad: string;
  descripcion: string;
  talla: string | null;
  marcaModelo: string | null;
  serialPlaca: string | null;
  placa: string | null;
  estado: string | null;
  observaciones: string | null;
  reposicion: string | null;
}

export interface FirmaPdf {
  titulo: string; // ENTREGA: / RECIBE A CONFORMIDAD:
  nombre: string;
  cargo: string;
  documento?: string; // C.C. 123
}

export interface DatosPdf {
  plantilla: Plantilla;
  consecutivo: string;
  ciudad: string;
  fecha: string; // ISO
  titulo: string;
  destinatario: { tratamiento: string; nombre: string; cargo: string }; // Señor / Señora
  introduccion: string;
  manifiesta: string;
  clausulas: string[];
  lineas: LineaPdf[];
  observaciones: string | null;
  firmas: [FirmaPdf, FirmaPdf];
  pie: string[];
  /** Solo actas antiguas: nota de que se registró después. */
  nota?: string | null;
  anulada?: string | null;
}

export interface DatosCertificadoPdf {
  consecutivo: string;
  titulo: string;
  dirigidoA: string | null; // null = A QUIEN INTERESE
  introduccion: string;
  manifiesta: string;
  parrafos: string[];
  firmante: { nombre: string; cargo: string; empresa: string };
  firma: Buffer | null; // imagen PNG o JPG
  pie: string[];
  nota?: string | null;
}

export interface DatosPlanilla {
  consecutivo: string;
  ciudad: string;
  fecha: string;
  empresa: string;
  motivo: string;
  clausulas: string[];
  observaciones: string | null;
  personas: { nombre: string; documento: string; cargo: string; epp: string[]; reposicion: string }[];
  entrega: { nombre: string; cargo: string };
  pie: string[];
}

/**
 * Arma el PDF del acta con el formato corporativo de DRIM DUIT S.A.S.:
 * logo y línea en el encabezado, dirección en el pie, tabla de elementos y firmas en dos columnas.
 * Medidas en puntos (72 por pulgada), hoja carta.
 */
@Injectable()
export class PdfActaService {
  async generar(d: DatosPdf): Promise<Buffer> {
    const margenX = 62;
    const margenSup = 96;
    const margenInf = 84;
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: margenSup, bottom: margenInf, left: margenX, right: margenX },
      bufferPages: true,
      info: { Title: `${d.titulo} ${d.consecutivo}`, Author: 'SGTH - DRIM DUIT S.A.S.', Subject: d.consecutivo },
    });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    const fin = new Promise<Buffer>((ok, error) => {
      doc.on('end', () => ok(Buffer.concat(partes)));
      doc.on('error', error);
    });

    const ancho = doc.page.width - margenX * 2;
    const x0 = margenX;

    // --- Ciudad y fecha, título y consecutivo ---
    doc.font('Helvetica').fontSize(10.5).fillColor(TINTA).text(`${d.ciudad}, ${fechaLarga(d.fecha)}`, x0, margenSup);
    doc.moveDown(0.9);
    doc.font('Helvetica-Bold').fontSize(12).text(d.titulo, { align: 'center' });
    doc.font('Helvetica').fontSize(9).text(`No. ${d.consecutivo}`, { align: 'center' });
    doc.moveDown(1);

    // --- Destinatario ---
    doc.font('Helvetica').fontSize(10.5).text(`${d.destinatario.tratamiento}:`, x0);
    doc.font('Helvetica-Bold').text(d.destinatario.nombre.toUpperCase());
    doc.font('Helvetica').text(d.destinatario.cargo);
    doc.text(d.ciudad);
    doc.moveDown(0.8);

    // --- Introducción ---
    doc.font('Helvetica').fontSize(10.5).text(d.introduccion, x0, doc.y, { width: ancho, align: 'justify', lineGap: 1.5 });
    doc.moveDown(0.8);

    // --- Tabla de elementos ---
    this.tabla(doc, COLUMNAS[d.plantilla], d.lineas, x0, ancho);

    if (d.observaciones) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(9).text('Observaciones: ', x0, doc.y, { continued: true, width: ancho });
      doc.font('Helvetica').text(d.observaciones, { width: ancho });
    }
    doc.moveDown(0.8);

    // --- Manifiesta y cláusulas ---
    this.asegurarEspacio(doc, 60);
    doc.font('Helvetica-Bold').fontSize(10.5).text(d.manifiesta, x0, doc.y, { width: ancho, align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9.5);
    for (const c of d.clausulas) {
      doc.text(c, x0, doc.y, { width: ancho, align: 'justify', lineGap: 1.2 });
      doc.moveDown(0.45);
    }

    if (d.nota) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRIS).text(d.nota, x0, doc.y, { width: ancho });
      doc.fillColor(TINTA);
    }

    // --- Firmas: siempre juntas en la misma página ---
    doc.moveDown(0.9);
    this.asegurarEspacio(doc, 100);
    const yFirmas = doc.y;
    const col = (ancho - 30) / 2;
    d.firmas.forEach((f, i) => {
      const x = x0 + i * (col + 30);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TINTA).text(f.titulo, x, yFirmas, { width: col });
      const yLinea = yFirmas + 48;
      doc.moveTo(x, yLinea).lineTo(x + col - 20, yLinea).lineWidth(0.7).strokeColor(TINTA).stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).text(f.nombre.toUpperCase(), x, yLinea + 5, { width: col });
      doc.font('Helvetica').fontSize(9.5).text(f.cargo, x, doc.y, { width: col });
      if (f.documento) doc.text(f.documento, x, doc.y, { width: col });
    });

    // --- Encabezado, pie, marca de anulada y número de página en todas las hojas ---
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      this.encabezado(doc, x0, ancho);
      this.pie(doc, d.pie, x0, ancho, i + 1, paginas.count, d.consecutivo);
      if (d.anulada) this.marcaAnulada(doc, d.anulada);
    }
    doc.end();
    return fin;
  }

  /**
   * Planilla de entrega grupal de EPP: hoja carta horizontal, compromiso de uso arriba
   * y una fila por persona con espacio para su firma.
   */
  async generarPlanilla(d: DatosPlanilla): Promise<Buffer> {
    const margenX = 46;
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 92, bottom: 84, left: margenX, right: margenX },
      bufferPages: true,
      info: { Title: `Planilla de entrega de EPP ${d.consecutivo}`, Author: 'SGTH - DRIM DUIT S.A.S.', Subject: d.consecutivo },
    });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    const fin = new Promise<Buffer>((ok, error) => {
      doc.on('end', () => ok(Buffer.concat(partes)));
      doc.on('error', error);
    });
    const ancho = doc.page.width - margenX * 2;
    const x0 = margenX;

    doc.font('Helvetica').fontSize(10).fillColor(TINTA).text(`${d.ciudad}, ${fechaLarga(d.fecha)}`, x0, 92);
    doc.font('Helvetica-Bold').fontSize(12).text('PLANILLA DE ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL (EPP)', x0, doc.y + 4, { width: ancho, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(`No. ${d.consecutivo}`, { width: ancho, align: 'center' });
    doc.moveDown(0.7);
    doc.font('Helvetica').fontSize(9.5).text(
      `Por medio de la presente se deja constancia de la entrega, sin costo, de los Elementos de Protección Personal (EPP) que se relacionan a continuación a los trabajadores de ${d.empresa} que firman esta planilla, por motivo de ${d.motivo}, en cumplimiento del Sistema de Gestión de Seguridad y Salud en el Trabajo.`,
      x0, doc.y, { width: ancho, align: 'justify', lineGap: 1 },
    );
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9).text('CADA TRABAJADOR, CON SU FIRMA, MANIFIESTA QUE:', x0, doc.y, { width: ancho });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(8);
    d.clausulas.forEach((c, i) => {
      doc.text(`${i + 1}. ${c}`, x0, doc.y, { width: ancho, align: 'justify', lineGap: 0.6 });
      doc.moveDown(0.2);
    });
    doc.moveDown(0.5);

    // Tabla: una fila por persona, con la firma al final
    const columnas = [
      { titulo: 'N°', ancho: 0.35, centrado: true },
      { titulo: 'NOMBRE', ancho: 2.1 },
      { titulo: 'DOCUMENTO', ancho: 1.25, centrado: true },
      { titulo: 'CARGO', ancho: 1.5 },
      { titulo: 'EPP ENTREGADOS', ancho: 3.1 },
      { titulo: 'REPOSICIÓN', ancho: 1.0, centrado: true },
      { titulo: 'FIRMA', ancho: 2.0 },
    ];
    const total = columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / total) * ancho);
    const pad = 4;
    const fila = (celdas: string[], encabezado: boolean) => {
      doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(encabezado ? 7.8 : 8.2);
      const alto = Math.max(encabezado ? 16 : 42, ...celdas.map((t, i) => doc.heightOfString(t || ' ', { width: anchos[i] - pad * 2 }) + pad * 2));
      if (doc.y + alto > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        if (!encabezado) fila(columnas.map((c) => c.titulo), true);
      }
      const y = doc.y;
      let x = x0;
      celdas.forEach((t, i) => {
        if (encabezado) doc.rect(x, y, anchos[i], alto).fill('#E8EFF0');
        doc.rect(x, y, anchos[i], alto).lineWidth(0.6).strokeColor(TINTA).stroke();
        const h = doc.heightOfString(t || ' ', { width: anchos[i] - pad * 2 });
        doc.fillColor(TINTA).text(t, x + pad, y + (alto - h) / 2, { width: anchos[i] - pad * 2, align: columnas[i].centrado || encabezado ? 'center' : 'left' });
        x += anchos[i];
      });
      doc.x = x0;
      doc.y = y + alto;
    };
    fila(columnas.map((c) => c.titulo), true);
    d.personas.forEach((p, i) => fila([String(i + 1), p.nombre.toUpperCase(), p.documento, p.cargo, p.epp.join('\n'), p.reposicion, ''], false));

    if (d.observaciones) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(8.5).text('Observaciones: ', x0, doc.y, { continued: true, width: ancho });
      doc.font('Helvetica').text(d.observaciones, { width: ancho });
    }

    // Firma de quien entrega
    doc.moveDown(1);
    this.asegurarEspacio(doc, 80);
    const yF = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TINTA).text('ENTREGA:', x0, yF);
    doc.moveTo(x0, yF + 44).lineTo(x0 + 220, yF + 44).lineWidth(0.7).strokeColor(TINTA).stroke();
    doc.font('Helvetica-Bold').fontSize(9).text(d.entrega.nombre.toUpperCase(), x0, yF + 49, { width: 260 });
    doc.font('Helvetica').text(d.entrega.cargo, x0, doc.y, { width: 260 });

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      this.encabezado(doc, x0, ancho);
      this.pie(doc, d.pie, x0, ancho, i + 1, paginas.count, d.consecutivo);
    }
    doc.end();
    return fin;
  }

  /** Certificado laboral: una hoja carta con el mismo encabezado y pie de las actas, y la firma escaneada. */
  async generarCertificado(d: DatosCertificadoPdf): Promise<Buffer> {
    const margenX = 72;
    const margenSup = 104;
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: margenSup, bottom: 84, left: margenX, right: margenX },
      bufferPages: true,
      info: { Title: `${d.titulo} ${d.consecutivo}`, Author: 'SGTH - DRIM DUIT S.A.S.', Subject: d.consecutivo },
    });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    const fin = new Promise<Buffer>((ok, error) => {
      doc.on('end', () => ok(Buffer.concat(partes)));
      doc.on('error', error);
    });
    const ancho = doc.page.width - margenX * 2;
    const x0 = margenX;

    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(`No. ${d.consecutivo}`, x0, margenSup - 18, { width: ancho, align: 'right' });
    doc.fillColor(TINTA);

    // --- Título ---
    doc.font('Helvetica-Bold').fontSize(14).text(d.titulo, x0, margenSup + 22, { width: ancho, align: 'center', characterSpacing: 0.5 });
    doc.moveDown(2);

    // --- Destinatario ---
    if (d.dirigidoA) {
      doc.font('Helvetica').fontSize(11).text('Señores:', x0, doc.y, { width: ancho });
      doc.font('Helvetica-Bold').text(d.dirigidoA.toUpperCase(), { width: ancho });
    } else {
      doc.font('Helvetica-Bold').fontSize(11).text('A QUIEN INTERESE', x0, doc.y, { width: ancho });
    }
    doc.moveDown(2);

    // --- Texto ---
    const opciones = { width: ancho, align: 'justify' as const, lineGap: 4 };
    doc.font('Helvetica').fontSize(11.5).text(d.introduccion, x0, doc.y, opciones);
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(12).text(d.manifiesta, x0, doc.y, { width: ancho, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(11.5);
    for (const p of d.parrafos) {
      doc.text(p, x0, doc.y, opciones);
      doc.moveDown(1.1);
    }

    if (d.nota) {
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRIS).text(d.nota, x0, doc.y, { width: ancho });
      doc.fillColor(TINTA);
    }

    // --- Firma: imagen sobre la línea ---
    doc.moveDown(1.5);
    this.asegurarEspacio(doc, 150);
    doc.font('Helvetica').fontSize(11.5).text('Atentamente,', x0, doc.y);
    const yLinea = doc.y + 78;
    const anchoFirma = 220;
    if (d.firma) {
      try {
        doc.image(d.firma, x0, yLinea - 70, { fit: [anchoFirma - 20, 66], valign: 'bottom' });
      } catch {
        // imagen dañada: queda la línea para firmar a mano
      }
    }
    doc.moveTo(x0, yLinea).lineTo(x0 + anchoFirma, yLinea).lineWidth(0.7).strokeColor(TINTA).stroke();
    doc.font('Helvetica-Bold').fontSize(11).text(d.firmante.nombre.toUpperCase(), x0, yLinea + 6, { width: ancho });
    doc.font('Helvetica').fontSize(10.5).text(d.firmante.cargo, x0, doc.y, { width: ancho });
    doc.text(d.firmante.empresa, x0, doc.y, { width: ancho });

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      this.encabezado(doc, x0 - 10, ancho + 20);
      this.pie(doc, d.pie, x0 - 10, ancho + 20, i + 1, paginas.count, d.consecutivo);
    }
    doc.end();
    return fin;
  }

  private tabla(doc: PDFKit.PDFDocument, columnas: Columna[], lineas: LineaPdf[], x0: number, ancho: number) {
    const total = columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / total) * ancho);
    const pad = 4;
    const fuente = 8.5;

    const fila = (celdas: string[], negrita: boolean, fondo?: string) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(fuente);
      const alto = Math.max(16, ...celdas.map((t, i) => doc.heightOfString(t || ' ', { width: anchos[i] - pad * 2 }) + pad * 2));
      if (doc.y + alto > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (!negrita) fila(columnas.map((c) => c.titulo), true, '#E8EFF0'); // repite encabezado
      }
      const y = doc.y;
      let x = x0;
      celdas.forEach((t, i) => {
        if (fondo) doc.rect(x, y, anchos[i], alto).fill(fondo);
        doc.rect(x, y, anchos[i], alto).lineWidth(0.6).strokeColor(TINTA).stroke();
        const h = doc.heightOfString(t || ' ', { width: anchos[i] - pad * 2 });
        doc.fillColor(TINTA).text(t, x + pad, y + (alto - h) / 2, { width: anchos[i] - pad * 2, align: columnas[i].centrado || negrita ? 'center' : 'left' });
        x += anchos[i];
      });
      doc.x = x0;
      doc.y = y + alto;
    };

    fila(columnas.map((c) => c.titulo), true, '#E8EFF0');
    for (const l of lineas) {
      fila(columnas.map((c) => valorCelda(l, c.campo)), false);
    }
  }

  private encabezado(doc: PDFKit.PDFDocument, x0: number, ancho: number) {
    const y = 30;
    const altoLogo = 44;
    let finLogo = x0;
    if (existsSync(RUTA_LOGO)) {
      doc.image(RUTA_LOGO, x0 - 6, y, { height: altoLogo });
      finLogo = x0 - 6 + altoLogo * (876 / 374) + 8;
    }
    // Línea petróleo a la derecha del logo, como en el formato de la empresa
    doc.save().moveTo(finLogo, y + altoLogo - 4).lineTo(x0 + ancho + 20, y + altoLogo - 4).lineWidth(2.2).strokeColor(PETROLEO).stroke().restore();
  }

  private pie(doc: PDFKit.PDFDocument, renglones: string[], x0: number, ancho: number, pagina: number, paginas: number, consecutivo: string) {
    const yLinea = doc.page.height - 74;
    doc.save().moveTo(x0 + 30, yLinea).lineTo(x0 + ancho - 30, yLinea).lineWidth(2.2).strokeColor(PETROLEO).stroke().restore();
    // El texto del pie va fuera del margen: se baja el margen inferior mientras se escribe
    const margen = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    let y = yLinea + 6;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1B2B2F');
    for (const r of renglones) {
      doc.text(r, x0, y, { width: ancho, align: 'center', lineBreak: false });
      y += 10.5;
    }
    if (paginas > 1) {
      doc.font('Helvetica').fontSize(7).fillColor(GRIS).text(`${consecutivo}, página ${pagina} de ${paginas}`, x0, doc.page.height - 22, { width: ancho, align: 'right', lineBreak: false });
    }
    doc.page.margins.bottom = margen;
    doc.fillColor(TINTA);
  }

  private marcaAnulada(doc: PDFKit.PDFDocument, motivo: string) {
    const margen = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font('Helvetica-Bold').fontSize(90).fillColor('#B3261E').fillOpacity(0.13)
      .text('ANULADA', 0, doc.page.height / 2 - 50, { width: doc.page.width, align: 'center', lineBreak: false });
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#B3261E')
      .text(`ACTA ANULADA: ${motivo}`, doc.page.margins.left, 80, { width: doc.page.width - doc.page.margins.left * 2, align: 'center', lineBreak: false });
    doc.page.margins.bottom = margen;
    doc.fillColor(TINTA);
  }

  private asegurarEspacio(doc: PDFKit.PDFDocument, alto: number) {
    if (doc.y + alto > doc.page.height - doc.page.margins.bottom) doc.addPage();
  }
}

function valorCelda(l: LineaPdf, campo: Columna['campo']): string {
  switch (campo) {
    case 'cantidad': return String(l.cantidad);
    case 'talla': return l.talla && l.talla !== 'UNICA' ? l.talla : '—';
    default: return (l[campo] as string | null) ?? '—';
  }
}
