import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { Activo } from './activos.service.js';

const PT = 72; // puntos por pulgada

/**
 * Hoja carta de 30 etiquetas de 2⅝ × 1 pulgadas (6,7 × 2,5 cm), formato tipo Avery 5160:
 * 3 columnas × 10 filas, margen superior de 0,5", laterales de 3/16" y 1/8" entre columnas.
 */
export const HOJA = {
  ancho: 8.5 * PT,
  alto: 11 * PT,
  columnas: 3,
  filas: 10,
  etiquetaAncho: 2.625 * PT,
  etiquetaAlto: 1 * PT,
  margenSuperior: 0.5 * PT,
  margenLateral: 0.1875 * PT,
  separacionColumnas: 0.125 * PT,
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

  /** Etiqueta pequeña y discreta: logo, placa y QR. El resto de datos está en la ficha que abre el QR. */
  private etiqueta(doc: PDFKit.PDFDocument, x: number, y: number, a: Activo, qr: Buffer, empresa: string, logo: string | null, bordes: boolean) {
    const w = HOJA.etiquetaAncho;
    const h = HOJA.etiquetaAlto;
    const pad = 7;
    const qrLado = 54; // 1,9 cm: legible con la cámara del celular

    if (bordes) {
      doc.save().lineWidth(0.4).dash(2, { space: 2 }).strokeColor('#B8C4C7').roundedRect(x + 1, y + 1, w - 2, h - 2, 5).stroke().restore();
    }

    // QR a la derecha, centrado verticalmente
    doc.image(qr, x + w - pad - qrLado, y + (h - qrLado) / 2, { width: qrLado, height: qrLado });

    const izq = x + pad + 1;
    const izqAncho = w - pad * 2 - qrLado - 8;
    if (logo) {
      doc.image(logo, izq - 1, y + pad, { height: 15 });
    } else {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PETROLEO).text(empresa, izq, y + pad, { width: izqAncho, lineBreak: false, ellipsis: true });
    }

    // Placa: el dato principal; se reduce si no cabe en una línea
    let tamano = 13;
    doc.font('Helvetica-Bold');
    while (tamano > 8 && doc.fontSize(tamano).widthOfString(a.placa) > izqAncho) tamano -= 0.5;
    const yPlaca = y + h / 2 - tamano / 2 + 3;
    doc.fillColor(PETROLEO).text(a.placa, izq, yPlaca, { width: izqAncho, lineBreak: false });
    doc.save().rect(izq, yPlaca + tamano + 1.5, 18, 1.6).fill(VERDE).restore();

    doc.font('Helvetica').fontSize(4.8).fillColor(GRIS)
      .text(`Propiedad de ${empresa}`, izq, y + h - pad - 5, { width: izqAncho, lineBreak: false, ellipsis: true });
  }
}
