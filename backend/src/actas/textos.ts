import type { Categoria } from '../inventario/categorias.js';

export type Plantilla = 'DOTACION' | 'EPP' | 'EQUIPOS' | 'MUEBLES' | 'OTROS' | 'DEVOLUCION';
export type PlantillaEntrega = Exclude<Plantilla, 'DEVOLUCION'>;
export type Motivo =
  | 'INGRESO' | 'DOTACION_PERIODICA' | 'REPOSICION_VIDA_UTIL' | 'DANO' | 'PERDIDA' | 'ASIGNACION'
  | 'TRASPASO' | 'RETIRO' | 'CAMBIO_CARGO' | 'REPARACION' | 'OTRO';

/** Texto del motivo dentro de las frases del acta: "por motivo de …". */
export const MOTIVOS: Record<Motivo, { etiqueta: string; frase: string }> = {
  INGRESO: { etiqueta: 'Ingreso a la empresa', frase: 'ingreso a la empresa' },
  DOTACION_PERIODICA: { etiqueta: 'Dotación del período', frase: 'dotación del período' },
  REPOSICION_VIDA_UTIL: { etiqueta: 'Reposición por vida útil', frase: 'reposición por cumplimiento de la vida útil' },
  DANO: { etiqueta: 'Reposición por daño', frase: 'reposición por daño' },
  PERDIDA: { etiqueta: 'Reposición por pérdida', frase: 'reposición por pérdida' },
  ASIGNACION: { etiqueta: 'Asignación', frase: 'asignación para sus labores' },
  TRASPASO: { etiqueta: 'Traspaso', frase: 'traspaso de otro colaborador' },
  RETIRO: { etiqueta: 'Retiro de la empresa', frase: 'retiro de la empresa' },
  CAMBIO_CARGO: { etiqueta: 'Cambio de cargo', frase: 'cambio de cargo' },
  REPARACION: { etiqueta: 'Envío a reparación', frase: 'envío a reparación' },
  OTRO: { etiqueta: 'Otro', frase: 'otro motivo' },
};

/** Motivos que se ofrecen en cada tipo de acta. */
export const MOTIVOS_POR_PLANTILLA: Record<Plantilla, Motivo[]> = {
  DOTACION: ['DOTACION_PERIODICA', 'INGRESO', 'DANO', 'PERDIDA', 'OTRO'],
  EPP: ['INGRESO', 'REPOSICION_VIDA_UTIL', 'DANO', 'PERDIDA', 'CAMBIO_CARGO', 'OTRO'],
  EQUIPOS: ['ASIGNACION', 'INGRESO', 'CAMBIO_CARGO', 'DANO', 'PERDIDA', 'TRASPASO', 'OTRO'],
  MUEBLES: ['ASIGNACION', 'INGRESO', 'CAMBIO_CARGO', 'TRASPASO', 'OTRO'],
  OTROS: ['ASIGNACION', 'INGRESO', 'CAMBIO_CARGO', 'DANO', 'PERDIDA', 'OTRO'],
  DEVOLUCION: ['RETIRO', 'CAMBIO_CARGO', 'DANO', 'REPARACION', 'OTRO'],
};

/** Categoría del inventario que entrega cada plantilla. */
export const CATEGORIA_DE_PLANTILLA: Record<PlantillaEntrega, Categoria> = {
  DOTACION: 'DOTACION',
  EPP: 'EPP',
  EQUIPOS: 'EQUIPO',
  MUEBLES: 'MUEBLE',
  OTROS: 'OTRO',
};

/** Permiso para registrar cada tipo de acta. */
export const PERMISO_ACTA: Record<Plantilla, string> = {
  DOTACION: 'actas_dotacion.gestionar',
  EPP: 'actas_epp.gestionar',
  EQUIPOS: 'actas_activos.gestionar',
  MUEBLES: 'actas_activos.gestionar',
  OTROS: 'actas_activos.gestionar',
  DEVOLUCION: 'actas_activos.gestionar',
};

export const NOMBRE_PLANTILLA: Record<Plantilla, string> = {
  DOTACION: 'Dotación',
  EPP: 'EPP',
  EQUIPOS: 'Equipos',
  MUEBLES: 'Muebles',
  OTROS: 'Otros elementos',
  DEVOLUCION: 'Devolución',
};

export interface Columna {
  titulo: string;
  campo: 'cantidad' | 'unidad' | 'descripcion' | 'talla' | 'marcaModelo' | 'serialPlaca' | 'placa' | 'estado' | 'observaciones' | 'reposicion';
  ancho: number; // proporción
  centrado?: boolean;
}

/** Columnas de la tabla de elementos de cada acta (Anexo A de la documentación). */
export const COLUMNAS: Record<Plantilla, Columna[]> = {
  DOTACION: [
    { titulo: 'CANT.', campo: 'cantidad', ancho: 0.8, centrado: true },
    { titulo: 'UNIDAD', campo: 'unidad', ancho: 1, centrado: true },
    { titulo: 'DESCRIPCIÓN', campo: 'descripcion', ancho: 4.4 },
    { titulo: 'TALLA', campo: 'talla', ancho: 1, centrado: true },
  ],
  EPP: [
    { titulo: 'CANT.', campo: 'cantidad', ancho: 0.8, centrado: true },
    { titulo: 'UNIDAD', campo: 'unidad', ancho: 1, centrado: true },
    { titulo: 'DESCRIPCIÓN', campo: 'descripcion', ancho: 3.4 },
    { titulo: 'TALLA', campo: 'talla', ancho: 0.9, centrado: true },
    { titulo: 'REPOSICIÓN', campo: 'reposicion', ancho: 1.3, centrado: true },
  ],
  EQUIPOS: [
    { titulo: 'CANT.', campo: 'cantidad', ancho: 0.7, centrado: true },
    { titulo: 'DESCRIPCIÓN', campo: 'descripcion', ancho: 2.6 },
    { titulo: 'MARCA / MODELO', campo: 'marcaModelo', ancho: 1.7, centrado: true },
    { titulo: 'SERIAL / PLACA', campo: 'serialPlaca', ancho: 1.7, centrado: true },
    { titulo: 'ESTADO', campo: 'estado', ancho: 1, centrado: true },
  ],
  MUEBLES: [
    { titulo: 'CANT.', campo: 'cantidad', ancho: 0.7, centrado: true },
    { titulo: 'DESCRIPCIÓN', campo: 'descripcion', ancho: 3.6 },
    { titulo: 'PLACA', campo: 'placa', ancho: 1.5, centrado: true },
    { titulo: 'ESTADO', campo: 'estado', ancho: 1.1, centrado: true },
  ],
  OTROS: [
    { titulo: 'CANT.', campo: 'cantidad', ancho: 0.8, centrado: true },
    { titulo: 'UNIDAD', campo: 'unidad', ancho: 1, centrado: true },
    { titulo: 'DESCRIPCIÓN', campo: 'descripcion', ancho: 5 },
  ],
  DEVOLUCION: [
    { titulo: 'CANT.', campo: 'cantidad', ancho: 0.7, centrado: true },
    { titulo: 'DESCRIPCIÓN', campo: 'descripcion', ancho: 2.5 },
    { titulo: 'SERIAL / PLACA', campo: 'serialPlaca', ancho: 1.6, centrado: true },
    { titulo: 'ESTADO', campo: 'estado', ancho: 0.95, centrado: true },
    { titulo: 'OBSERVACIONES', campo: 'observaciones', ancho: 2 },
  ],
};

export const CONDICION_TEXTO: Record<string, string> = { NUEVO: 'Nuevo', BUENO: 'Bueno', REGULAR: 'Regular', MALO: 'Malo' };

/** C.C., C.E., T.I.… como se escribe en las actas. */
export function siglaDocumento(codigo: string): string {
  const siglas: Record<string, string> = { CC: 'C.C.', CE: 'C.E.', TI: 'T.I.', PA: 'Pasaporte', PPT: 'PPT' };
  return siglas[codigo] ?? codigo;
}

export interface CamposActa {
  sexo: string; // F o M
  nombre: string;
  tipoDoc: string;
  numeroDoc: string;
  cargo: string;
  empresa: string;
  periodo?: string;
  motivo?: string;
  ubicacion?: string | null;
  anterior?: { sexo: string; nombre: string; cargo: string } | null;
}

/** Reemplaza los campos {{…}} de las plantillas y corrige "a el" → "al", "de el" → "del". */
export function rellenar(texto: string, c: CamposActa): string {
  const f = c.sexo === 'F';
  const traspaso = c.anterior
    ? `. Los elementos se encontraban asignados a ${c.anterior.sexo === 'F' ? 'la señora' : 'el señor'} ${c.anterior.nombre}, ${c.anterior.cargo}.`
    : '.';
  const valores: Record<string, string> = {
    EL_SENOR: f ? 'la señora' : 'el señor',
    EL_TRABAJADOR: f ? 'la trabajadora' : 'el trabajador',
    EL_TRABAJADOR_MAY: f ? 'LA TRABAJADORA' : 'EL TRABAJADOR',
    ESTE: f ? 'esta' : 'este',
    NOMBRE: c.nombre,
    TIPO_DOC: siglaDocumento(c.tipoDoc),
    NUMERO_DOC: c.numeroDoc,
    CARGO: c.cargo,
    EMPRESA: c.empresa,
    PERIODO: c.periodo ?? '',
    MOTIVO: c.motivo ?? '',
    UBICACION: c.ubicacion || 'las instalaciones de la empresa',
    TRASPASO: traspaso,
  };
  return texto
    .replace(/\{\{([A-Z_]+)\}\}/g, (todo, campo: string) => valores[campo] ?? todo)
    .replace(/\ba el\b/g, 'al')
    .replace(/\bde el\b/g, 'del')
    .replace(/\.\./g, '.')
    .replace(/\s+([,.:])/g, '$1');
}

/** "1 de 2026", con la fecha límite legal (Art. 232 CST). */
export function textoPeriodo(numero: number, anio: number): string {
  return `${numero} de ${anio}`;
}

/** 09/11/2026 */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Suma días a una fecha 'YYYY-MM-DD' sin problemas de zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const f = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** 9 de noviembre de 2026 */
export function fechaLarga(iso: string): string {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${meses[m - 1]} de ${a}`;
}

/** Campos que se pueden usar en las plantillas, con su explicación para la pantalla de edición. */
export const CAMPOS_PLANTILLA: { campo: string; descripcion: string; ejemplo: string; solo?: Plantilla[] }[] = [
  { campo: 'NOMBRE', descripcion: 'Nombre completo del colaborador', ejemplo: 'Ana María Gómez Restrepo' },
  { campo: 'CARGO', descripcion: 'Cargo del colaborador', ejemplo: 'Asistente de Talento Humano' },
  { campo: 'TIPO_DOC', descripcion: 'Tipo de documento', ejemplo: 'C.C.' },
  { campo: 'NUMERO_DOC', descripcion: 'Número de documento', ejemplo: '1113654321' },
  { campo: 'EL_SENOR', descripcion: '"el señor" o "la señora"', ejemplo: 'la señora' },
  { campo: 'EL_TRABAJADOR', descripcion: '"el trabajador" o "la trabajadora"', ejemplo: 'la trabajadora' },
  { campo: 'EL_TRABAJADOR_MAY', descripcion: 'Lo mismo, en mayúsculas', ejemplo: 'LA TRABAJADORA' },
  { campo: 'ESTE', descripcion: '"este" o "esta"', ejemplo: 'esta' },
  { campo: 'EMPRESA', descripcion: 'Nombre de la empresa', ejemplo: 'DRIM DUIT S.A.S.' },
  { campo: 'MOTIVO', descripcion: 'Motivo de la entrega o devolución', ejemplo: 'ingreso a la empresa' },
  { campo: 'PERIODO', descripcion: 'Período de dotación', ejemplo: '3 de 2026', solo: ['DOTACION'] },
  { campo: 'UBICACION', descripcion: 'Ubicación del puesto', ejemplo: 'la oficina administrativa', solo: ['MUEBLES'] },
  { campo: 'TRASPASO', descripcion: 'Frase "Los elementos se encontraban asignados a…" (solo en traspasos)', ejemplo: '', solo: ['EQUIPOS', 'MUEBLES'] },
];
