/**
 * Definición de los catálogos que se administran desde el sistema.
 * El servicio solo usa las tablas y columnas declaradas aquí, nunca nombres que lleguen del navegador.
 */

export type TipoCampo = 'texto' | 'numero' | 'booleano' | 'opciones' | 'referencia';

export interface CampoCatalogo {
  columna: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  maximo?: number; // longitud máxima (texto) o valor máximo (número)
  minimo?: number; // valor mínimo (número)
  opciones?: { valor: string; etiqueta: string }[];
  referencia?: string; // clave de otro catálogo (tipo 'referencia')
  ayuda?: string;
  enTabla?: boolean; // se muestra como columna en el listado (por defecto sí)
  formato?: 'correo' | 'mayusculas';
}

export interface DefinicionCatalogo {
  clave: string;
  tabla: string;
  titulo: string;
  singular: string; // "un área", "un cargo"
  descripcion: string;
  campos: CampoCatalogo[];
  columnaNombre: string; // la que identifica el registro en mensajes y listas
  columnasAuditoria: boolean; // la tabla tiene creado_por / actualizado_por
  mensajeDuplicado: string;
}

export const CATALOGOS: DefinicionCatalogo[] = [
  {
    clave: 'areas',
    tabla: 'areas',
    titulo: 'Áreas',
    singular: 'un área',
    descripcion: 'Áreas o dependencias de la empresa.',
    columnaNombre: 'nombre',
    columnasAuditoria: true,
    mensajeDuplicado: 'Ya existe un área con ese nombre',
    campos: [{ columna: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 100 }],
  },
  {
    clave: 'cargos',
    tabla: 'cargos',
    titulo: 'Cargos',
    singular: 'un cargo',
    descripcion: 'Cargos de los colaboradores. El cargo define los documentos obligatorios y los EPP requeridos.',
    columnaNombre: 'nombre',
    columnasAuditoria: true,
    mensajeDuplicado: 'Ya existe un cargo con ese nombre',
    campos: [
      { columna: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 100 },
      { columna: 'area_id', etiqueta: 'Área', tipo: 'referencia', referencia: 'areas' },
      {
        columna: 'nivel_riesgo_arl', etiqueta: 'Riesgo ARL', tipo: 'opciones',
        ayuda: 'Nivel de riesgo sugerido para el cargo',
        opciones: [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), etiqueta: `Riesgo ${n}` })),
      },
    ],
  },
  {
    clave: 'tipos_documento_expediente',
    tabla: 'tipos_documento_expediente',
    titulo: 'Tipos de documento del expediente',
    singular: 'un tipo de documento',
    descripcion: 'Documentos que se adjuntan a la ficha del colaborador: contrato, exámenes médicos, certificados…',
    columnaNombre: 'nombre',
    columnasAuditoria: false,
    mensajeDuplicado: 'Ya existe un tipo de documento con ese nombre',
    campos: [
      { columna: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 100 },
      { columna: 'maneja_vencimiento', etiqueta: 'Tiene vencimiento', tipo: 'booleano', ayuda: 'Genera alerta antes de vencer' },
      { columna: 'dias_alerta', etiqueta: 'Días de alerta', tipo: 'numero', minimo: 1, maximo: 365, ayuda: 'Vacío = valor general de Configuración' },
      { columna: 'visible_sst', etiqueta: 'Visible para SST', tipo: 'booleano' },
      { columna: 'es_sensible', etiqueta: 'Dato sensible', tipo: 'booleano', ayuda: 'Información médica u otra protegida por la Ley 1581' },
      { columna: 'obligatorio_todos', etiqueta: 'Obligatorio para todos', tipo: 'booleano', ayuda: 'Lo deben tener todos los colaboradores, sin importar el cargo; si falta genera alerta' },
    ],
  },
  {
    clave: 'entidades_seguridad_social',
    tabla: 'entidades_seguridad_social',
    titulo: 'Entidades de seguridad social',
    singular: 'una entidad',
    descripcion: 'EPS, fondos de pensión, ARL, cajas de compensación y fondos de cesantías.',
    columnaNombre: 'nombre',
    columnasAuditoria: false,
    mensajeDuplicado: 'Ya existe una entidad de ese tipo con ese nombre',
    campos: [
      {
        columna: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', requerido: true,
        opciones: [
          { valor: 'EPS', etiqueta: 'EPS' },
          { valor: 'AFP', etiqueta: 'Fondo de pensiones' },
          { valor: 'ARL', etiqueta: 'ARL' },
          { valor: 'CCF', etiqueta: 'Caja de compensación' },
          { valor: 'CESANTIAS', etiqueta: 'Fondo de cesantías' },
        ],
      },
      { columna: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 120 },
    ],
  },
  {
    clave: 'proveedores',
    tabla: 'proveedores',
    titulo: 'Proveedores',
    singular: 'un proveedor',
    descripcion: 'Proveedores de dotación, EPP, equipos y muebles.',
    columnaNombre: 'nombre',
    columnasAuditoria: true,
    mensajeDuplicado: 'Ya existe un proveedor con ese NIT',
    campos: [
      { columna: 'nombre', etiqueta: 'Nombre o razón social', tipo: 'texto', requerido: true, maximo: 150 },
      { columna: 'nit', etiqueta: 'NIT', tipo: 'texto', maximo: 20 },
      { columna: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', maximo: 30 },
      { columna: 'correo', etiqueta: 'Correo', tipo: 'texto', maximo: 150, formato: 'correo' },
    ],
  },
  {
    clave: 'tipos_documento_identidad',
    tabla: 'tipos_documento_identidad',
    titulo: 'Tipos de documento de identidad',
    singular: 'un tipo de documento de identidad',
    descripcion: 'Cédula de ciudadanía, cédula de extranjería, PPT, pasaporte…',
    columnaNombre: 'nombre',
    columnasAuditoria: false,
    mensajeDuplicado: 'Ya existe un tipo de documento de identidad con ese código',
    campos: [
      { columna: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, maximo: 5, formato: 'mayusculas' },
      { columna: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 60 },
    ],
  },
];

export const CATALOGOS_POR_CLAVE = new Map(CATALOGOS.map((c) => [c.clave, c]));
