import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/** Días desde los que se avisa que el certificado HTTPS está por vencer (win-acme lo renueva antes). */
const DIAS_AVISO_CERTIFICADO = 20;
/** Horas sin un respaldo correcto antes de avisar. */
const HORAS_AVISO_RESPALDO = 50;

const produccion = () => process.env.NODE_ENV === 'production';

/** Fecha de vencimiento del certificado HTTPS en uso (archivo PEM), o null. */
export function vencimientoCertificado(): Date | null {
  const ruta = process.env.HTTPS_CERT;
  if (!ruta || !existsSync(ruta)) return null;
  try {
    return new Date(new X509Certificate(readFileSync(ruta)).validTo);
  } catch {
    return null;
  }
}

/**
 * Avisos para el administrador sobre el servidor: respaldo atrasado o con error,
 * certificado HTTPS por vencer y sistema sin HTTPS. Solo en producción.
 */
export function avisosServidor(ahora = new Date()): string[] {
  return avisosServidorDetalle(ahora).map((a) => a.texto);
}

export type TipoAvisoServidor = 'RESPALDO' | 'HTTPS' | 'CERTIFICADO';

/** Igual que avisosServidor, con el tipo de cada aviso (para los avisos por correo). */
export function avisosServidorDetalle(ahora = new Date()): { tipo: TipoAvisoServidor; texto: string }[] {
  if (!produccion()) return [];
  const avisos: { tipo: TipoAvisoServidor; texto: string }[] = [];
  const agregar = (tipo: TipoAvisoServidor, texto: string) => avisos.push({ tipo, texto });

  const rutaEstado = process.env.RESPALDO_ESTADO || 'C:\\SGTH\\logs\\ultimo_respaldo.json';
  if (!existsSync(rutaEstado)) {
    agregar('RESPALDO', 'Todavía no hay ningún respaldo del sistema. Revise la tarea "SGTH - Respaldo diario".');
  } else {
    try {
      const e = JSON.parse(readFileSync(rutaEstado, 'utf8')) as { ok: boolean; fecha: string; error?: string };
      const horas = (ahora.getTime() - new Date(e.fecha).getTime()) / 3_600_000;
      if (!e.ok) agregar('RESPALDO', `El último respaldo falló: ${e.error ?? 'error desconocido'}. Revise C:\\SGTH\\logs\\respaldo.log.`);
      else if (horas > HORAS_AVISO_RESPALDO) agregar('RESPALDO', `El último respaldo correcto fue hace ${Math.floor(horas / 24)} días. Revise que el portátil esté prendido a las 12:30 p. m.`);
    } catch {
      agregar('RESPALDO', 'No se pudo leer el estado del último respaldo.');
    }
  }

  if (!process.env.HTTPS_CERT && !process.env.HTTPS_PFX) {
    agregar('HTTPS', 'El sistema está funcionando sin HTTPS: la información viaja sin cifrar por la red.');
  } else {
    const vence = vencimientoCertificado();
    if (vence) {
      const dias = Math.floor((vence.getTime() - ahora.getTime()) / 86_400_000);
      if (dias < 0) agregar('CERTIFICADO', 'El certificado HTTPS se venció. Revise la tarea de renovación de win-acme.');
      else if (dias <= DIAS_AVISO_CERTIFICADO) agregar('CERTIFICADO', `El certificado HTTPS vence en ${dias} días y no se ha renovado. Revise la tarea de renovación de win-acme.`);
    }
  }
  return avisos;
}
