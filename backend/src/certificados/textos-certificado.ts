import { fechaLarga, siglaDocumento } from '../actas/textos.js';

export type TipoContrato = 'INDEFINIDO' | 'FIJO' | 'OBRA_LABOR' | 'APRENDIZAJE' | 'PRESTACION_SERVICIOS';

/** Datos del colaborador con los que se arma el certificado (se guardan tal cual en certificados_laborales.datos). */
export interface DatosCertificado {
  sexo: string; // F o M
  nombre: string;
  tipoDoc: string;
  numeroDoc: string;
  cargo: string;
  tipoContrato: TipoContrato;
  fechaIngreso: string; // ISO
  fechaFinContrato: string | null;
  fechaRetiro: string | null; // si está retirado
  salario: number | null; // null = certificado sin salario
}

export interface ContextoCertificado {
  empresa: string;
  nit: string;
  ciudad: string;
  fechaExpedicion: string; // ISO
  cargoFirmante: string;
}

/** Campos que se pueden usar en la plantilla del certificado. */
export const CAMPOS_CERTIFICADO: { campo: string; descripcion: string; ejemplo: string }[] = [
  { campo: 'NOMBRE', descripcion: 'Nombre completo del colaborador', ejemplo: 'Ana María Gómez Restrepo' },
  { campo: 'TIPO_DOC', descripcion: 'Tipo de documento', ejemplo: 'C.C.' },
  { campo: 'NUMERO_DOC', descripcion: 'Número de documento', ejemplo: '1113654321' },
  { campo: 'CARGO', descripcion: 'Cargo desempeñado', ejemplo: 'Asistente de Talento Humano' },
  { campo: 'EL_SENOR', descripcion: '"el señor" o "la señora"', ejemplo: 'la señora' },
  { campo: 'EL_SENOR_CAP', descripcion: '"El señor" o "La señora", para empezar una frase', ejemplo: 'La señora' },
  { campo: 'IDENTIFICADO', descripcion: '"identificado" o "identificada"', ejemplo: 'identificada' },
  { campo: 'DEL_INTERESADO', descripcion: '"del interesado" o "de la interesada"', ejemplo: 'de la interesada' },
  { campo: 'LABORA', descripcion: '"labora" si está activo, "laboró" si está retirado', ejemplo: 'labora' },
  { campo: 'DEVENGA', descripcion: '"devenga" si está activo, "devengó" si está retirado', ejemplo: 'devenga' },
  { campo: 'PERIODO_LABORAL', descripcion: '"desde el …" y, si está retirado, "hasta el …"', ejemplo: 'desde el 3 de marzo de 2024' },
  { campo: 'FECHA_INGRESO', descripcion: 'Fecha de ingreso', ejemplo: '3 de marzo de 2024' },
  { campo: 'FECHA_RETIRO', descripcion: 'Fecha de retiro (vacío si está activo)', ejemplo: '' },
  { campo: 'TIPO_CONTRATO', descripcion: 'Frase del contrato, por ejemplo "mediante contrato de trabajo a término indefinido"', ejemplo: 'mediante contrato de trabajo a término indefinido' },
  { campo: 'SALARIO', descripcion: 'Salario en números y letras. El párrafo que lo tenga se quita si el certificado es sin salario', ejemplo: '$2.500.000 (DOS MILLONES QUINIENTOS MIL PESOS M/CTE)' },
  { campo: 'FECHA_EXPEDICION', descripcion: 'Fecha en que se expide', ejemplo: '11 de noviembre de 2026' },
  { campo: 'CIUDAD', descripcion: 'Ciudad de expedición', ejemplo: 'Palmira' },
  { campo: 'EMPRESA', descripcion: 'Nombre de la empresa', ejemplo: 'DRIM DUIT S.A.S.' },
  { campo: 'NIT', descripcion: 'NIT de la empresa', ejemplo: '900.000.000-0' },
  { campo: 'CARGO_FIRMANTE', descripcion: 'Cargo de quien firma', ejemplo: 'Directora Financiera' },
];

export const NOMBRE_CONTRATO: Record<TipoContrato, string> = {
  INDEFINIDO: 'Término indefinido',
  FIJO: 'Término fijo',
  OBRA_LABOR: 'Obra o labor',
  APRENDIZAJE: 'Aprendizaje',
  PRESTACION_SERVICIOS: 'Prestación de servicios',
};

/** Frase del contrato dentro del certificado. */
export function fraseContrato(d: Pick<DatosCertificado, 'tipoContrato' | 'fechaFinContrato' | 'fechaRetiro'>): string {
  switch (d.tipoContrato) {
    case 'INDEFINIDO': return 'mediante contrato de trabajo a término indefinido';
    case 'FIJO':
      return !d.fechaRetiro && d.fechaFinContrato
        ? `mediante contrato de trabajo a término fijo hasta el ${fechaLarga(d.fechaFinContrato)}`
        : 'mediante contrato de trabajo a término fijo';
    case 'OBRA_LABOR': return 'mediante contrato de trabajo por obra o labor';
    case 'APRENDIZAJE': return 'mediante contrato de aprendizaje';
    case 'PRESTACION_SERVICIOS': return 'mediante contrato de prestación de servicios';
  }
}

/** $2.500.000 (DOS MILLONES QUINIENTOS MIL PESOS M/CTE) */
export function salarioEnTexto(valor: number): string {
  const pesos = Math.round(valor);
  const numero = '$' + pesos.toLocaleString('es-CO', { maximumFractionDigits: 0 }).replace(/,/g, '.');
  return `${numero} (${pesosEnLetras(pesos)})`;
}

/** Párrafos del certificado con los campos reemplazados. Sin salario se omiten los párrafos que lo usan. */
export function rellenarCertificado(textos: string[], d: DatosCertificado, c: ContextoCertificado): string[] {
  const f = d.sexo === 'F';
  const retirado = !!d.fechaRetiro;
  const valores: Record<string, string> = {
    NOMBRE: d.nombre,
    TIPO_DOC: siglaDocumento(d.tipoDoc),
    NUMERO_DOC: d.numeroDoc,
    CARGO: d.cargo,
    EL_SENOR: f ? 'la señora' : 'el señor',
    EL_SENOR_CAP: f ? 'La señora' : 'El señor',
    IDENTIFICADO: f ? 'identificada' : 'identificado',
    DEL_INTERESADO: f ? 'de la interesada' : 'del interesado',
    LABORA: retirado ? 'laboró' : 'labora',
    DEVENGA: retirado ? 'devengó' : 'devenga',
    PERIODO_LABORAL: retirado
      ? `desde el ${fechaLarga(d.fechaIngreso)} hasta el ${fechaLarga(d.fechaRetiro!)}`
      : `desde el ${fechaLarga(d.fechaIngreso)}`,
    FECHA_INGRESO: fechaLarga(d.fechaIngreso),
    FECHA_RETIRO: d.fechaRetiro ? fechaLarga(d.fechaRetiro) : '',
    TIPO_CONTRATO: fraseContrato(d),
    SALARIO: d.salario != null ? salarioEnTexto(d.salario) : '',
    FECHA_EXPEDICION: fechaLarga(c.fechaExpedicion),
    CIUDAD: c.ciudad,
    EMPRESA: c.empresa,
    NIT: c.nit,
    CARGO_FIRMANTE: c.cargoFirmante,
  };
  return textos
    .filter((t) => d.salario != null || !/\{\{\s*SALARIO\s*\}\}/.test(t))
    .map((t) => t
      .replace(/\{\{([A-Z_]+)\}\}/g, (todo, campo: string) => valores[campo] ?? todo)
      .replace(/\ba el\b/g, 'al')
      .replace(/\bde el\b/g, 'del')
      .replace(/\.\./g, '.')
      .replace(/\s+([,.:])/g, '$1'));
}

// ---------------------------------------------------------------------
//  Números en letras (pesos colombianos)
// ---------------------------------------------------------------------

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0 a 999 */
function centenas(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let resto = '';
  if (r < 30) resto = UNIDADES[r];
  else resto = DECENAS[Math.floor(r / 10)] + (r % 10 ? ' Y ' + UNIDADES[r % 10] : '');
  return [CENTENAS[c], resto].filter(Boolean).join(' ');
}

/** 0 a 999.999 */
function miles(n: number): string {
  const m = Math.floor(n / 1000);
  const r = n % 1000;
  const textoMiles = m === 0 ? '' : m === 1 ? 'MIL' : `${centenas(m)} MIL`;
  return [textoMiles, centenas(r)].filter(Boolean).join(' ');
}

/** 2500000 → "DOS MILLONES QUINIENTOS MIL PESOS M/CTE" */
export function pesosEnLetras(valor: number): string {
  const n = Math.floor(Math.abs(valor));
  if (n === 0) return 'CERO PESOS M/CTE';
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  let texto = '';
  if (millones > 0) texto = millones === 1 ? 'UN MILLÓN' : `${miles(millones)} MILLONES`;
  if (resto > 0) texto = [texto, miles(resto)].filter(Boolean).join(' ');
  // "DOS MILLONES DE PESOS" cuando no hay nada después de los millones
  const de = millones > 0 && resto === 0 ? ' DE' : '';
  return `${texto}${de} PESOS M/CTE`.replace(/\s+/g, ' ').trim();
}
