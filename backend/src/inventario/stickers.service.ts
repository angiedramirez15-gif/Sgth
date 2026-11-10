import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { Activo } from './activos.service.js';

const PT = 72; // puntos por pulgada

/**
 * Hoja carta de 10 etiquetas de 4 × 2 pulgadas (formato tipo Avery 5163 / 8163):
 * 2 columnas × 5 filas, margen superior de 0,5" y laterales de 0,156".
 */
export const HOJA = {
  ancho: 8.5 * PT,
  alto: 11 * PT,
  columnas: 2,
  filas: 5,
  etiquetaAncho: 4 * PT,
  etiquetaAlto: 2 * PT,
  margenSuperior: 0.5 * PT,
  margenLateral: 0.15625 * PT,
  separacionColumnas: 0.1875 * PT,
};
export const ETIQUETAS_POR_HOJA = HOJA.columnas * HOJA.filas;

const PETROLEO = '#09424D';
const VERDE = '#4DD970';
const GRIS = '#5B6B70';

const RUTA_LOGO = fileURLToPath(new URL('../../assets/marca/logo-drim-duit.png', import.meta.url));

/** PDF con los stickers de placa: logo, placa, tipo de activo, serial y QR que abre la ficha. */
@Injectable()
export class StickersService {
  constructor(private readonly config: ConfiguracionService) {}

  async generar(activos: Activo[], opciones: { posicionInicial?: number | null; bordes?: boolean } = {}): Promise<Buffer> {
    const empresa = await this.config.texto('empresa_nombre', 'DRIM DUIT S.A.S.');
    const url = (await this.config.texto('url_sistema', 'http://localhost:3000')).replace(/\/+$/, '');
    const logo = existsSync(RUTA_LOGO) ? RUTA_LOGO : null;
    const qrs = await Promise.all(
      activos.map((a) => QRCode.toBuffer(`${url}/equipos/activos/${a.id}`, { margin: 0, errorCorrectionLevel: 'M', width: 360, color: { dark: PETROLEO, light: '#FFFFFF' } })),
    );

    const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, info: { Title: 'Stickers de placas - SGTH', Author: empresa } });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    const fin = new Promise<Buffer>((ok, error) => {
      doc.on('end', () => ok(Buffer.concat(partes)));
      doc.on('error', error);
    });

    let posicion = Math.min(Math.max((opciones.posicionInicial ?? 1) - 1, 0), ETIQUETAS_POR_HOJA - 1);
    doc.addPage();
    activos.forEach((activo, i) => {
      if (posicion >= ETIQUETAS_POR_HOJA) {
        doc.addPage();
        posicion = 0;
      }
      const columna = posicion % HOJA.columnas;
      const fila = Math.floor(posicion / HOJA.columnas);
      const x = HOJA.margenLateral + columna * (HOJA.etiquetaAncho + HOJA.separacionColumnas);
      const y = HOJA.margenSuperior + fila * HOJA.etiquetaAlto;
      this.etiqueta(doc, x, y, activo, qrs[i], empresa, logo, !!opciones.bordes);
      posicion++;
    });
    doc.end();
    return fin;
  }

  private etiqueta(doc: PDFKit.PDFDocument, x: number, y: number, a: Activo, qr: Buffer, empresa: string, logo: string | null, bordes: boolean) {
    const w = HOJA.etiquetaAncho;
    const h = HOJA.etiquetaAlto;
    const pad = 12;
    const qrLado = 104;

    if (bordes) {
      doc.save().lineWidth(0.5).dash(3, { space: 3 }).strokeColor('#B8C4C7').roundedRect(x + 1, y + 1, w - 2, h - 2, 8).stroke().restore();
    }

    // QR a la derecha, centrado verticalmente
    const qrX = x + w - pad - qrLado;
    const qrY = y + (h - qrLado) / 2 - 5;
    doc.image(qr, qrX, qrY, { width: qrLado, height: qrLado });
    doc.font('Helvetica').fontSize(5.5).fillColor(GRIS)
      .text('Escanee para ver la ficha', qrX - 6, qrY + qrLado + 3, { width: qrLado + 12, align: 'center', lineBreak: false });

    // Columna izquierda
    const izqAncho = qrX - x - pad - 10;
    let cursor = y + pad;
    if (logo) {
      doc.image(logo, x + pad, cursor, { height: 24 });
      cursor += 30;
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PETROLEO).text(empresa, x + pad, cursor, { width: izqAncho, lineBreak: false });
      cursor += 18;
    }
    doc.font('Helvetica').fontSize(6.5).fillColor(GRIS)
      .text(`Propiedad de ${empresa}`, x + pad, cursor, { width: izqAncho, lineBreak: false, ellipsis: true });
    cursor += 13;

    // Placa: el dato principal. Se reduce si no cabe en una línea.
    let tamano = 19;
    doc.font('Helvetica-Bold');
    while (tamano > 11 && doc.fontSize(tamano).widthOfString(a.placa) > izqAncho) tamano -= 1;
    doc.fillColor(PETROLEO).text(a.placa, x + pad, cursor, { width: izqAncho, lineBreak: false });
    cursor += tamano + 3;
    doc.save().rect(x + pad, cursor, 28, 2.5).fill(VERDE).restore();
    cursor += 8;

    const descripcion = [a.elemento, [a.marca, a.modelo].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    doc.font('Helvetica').fontSize(8).fillColor('#1B2B2F')
      .text(descripcion, x + pad, cursor, { width: izqAncho, height: 20, ellipsis: true, lineGap: 0.5 });
    if (a.serial) {
      doc.font('Helvetica').fontSize(6.5).fillColor(GRIS)
        .text(`S/N ${a.serial}`, x + pad, y + h - pad - 8, { width: izqAncho, lineBreak: false, ellipsis: true });
    }
  }
}
