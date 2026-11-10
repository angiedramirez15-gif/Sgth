/** Parámetros de la tabla configuracion que se muestran en la pantalla de Configuración. */
export interface Parametro {
  clave: string;
  etiqueta: string;
  grupo: 'Empresa y actas' | 'Dotación' | 'Alertas' | 'Seguridad' | 'Archivos';
  tipo: 'texto' | 'numero' | 'dinero';
  minimo?: number;
  maximo?: number;
  sufijo?: string;
  editable: boolean;
  ayuda?: string;
  formato?: 'url';
}

export const PARAMETROS: Parametro[] = [
  { clave: 'empresa_nombre', etiqueta: 'Nombre de la empresa', grupo: 'Empresa y actas', tipo: 'texto', maximo: 150, editable: true, ayuda: 'Aparece en el texto de las actas' },
  { clave: 'ciudad_actas', etiqueta: 'Ciudad de las actas', grupo: 'Empresa y actas', tipo: 'texto', maximo: 80, editable: true },
  { clave: 'pie_actas', etiqueta: 'Pie de página de las actas', grupo: 'Empresa y actas', tipo: 'texto', maximo: 400, editable: true, ayuda: 'Dirección, teléfono y correo. Separe los renglones con |' },
  { clave: 'url_sistema', etiqueta: 'Dirección del sistema en la red', grupo: 'Empresa y actas', tipo: 'texto', maximo: 200, formato: 'url', editable: true, ayuda: 'La que escriben los demás equipos para abrir el SGTH, por ejemplo http://192.168.1.20:3000. Va en el QR de los stickers' },
  { clave: 'prefijo_placa', etiqueta: 'Prefijo de las placas de inventario', grupo: 'Empresa y actas', tipo: 'texto', editable: false, ayuda: 'Fijo para que las placas ya pegadas no se repitan: DD-EQ-0001, DD-MU-0001' },
  { clave: 'prefijo_acta', etiqueta: 'Prefijo del consecutivo de actas', grupo: 'Empresa y actas', tipo: 'texto', editable: false, ayuda: 'Fijo para que los números de acta no se repitan' },

  { clave: 'smmlv_valor', etiqueta: 'Salario mínimo vigente', grupo: 'Dotación', tipo: 'dinero', minimo: 1, maximo: 100_000_000, editable: true, ayuda: 'Valor del decreto del Gobierno para el año indicado abajo. Sin este valor no se calcula el derecho a dotación' },
  { clave: 'smmlv_anio', etiqueta: 'Año del salario mínimo', grupo: 'Dotación', tipo: 'numero', minimo: 2020, maximo: 2100, editable: true },
  { clave: 'dotacion_tope_smmlv', etiqueta: 'Derecho a dotación hasta', grupo: 'Dotación', tipo: 'numero', minimo: 1, maximo: 10, sufijo: 'salarios mínimos', editable: true, ayuda: 'Art. 230 del Código Sustantivo del Trabajo: 2' },
  { clave: 'dotacion_meses_minimos', etiqueta: 'Antigüedad mínima para dotación', grupo: 'Dotación', tipo: 'numero', minimo: 0, maximo: 24, sufijo: 'meses', editable: true, ayuda: 'Art. 230 del Código Sustantivo del Trabajo: 3' },

  { clave: 'dias_alerta_documentos', etiqueta: 'Aviso de documentos por vencer', grupo: 'Alertas', tipo: 'numero', minimo: 1, maximo: 365, sufijo: 'días antes', editable: true },
  { clave: 'dias_alerta_contrato', etiqueta: 'Aviso de fin de contrato', grupo: 'Alertas', tipo: 'numero', minimo: 1, maximo: 365, sufijo: 'días antes', editable: true },
  { clave: 'dias_alerta_epp', etiqueta: 'Aviso de reposición de EPP', grupo: 'Alertas', tipo: 'numero', minimo: 1, maximo: 365, sufijo: 'días antes', editable: true },
  { clave: 'dias_alerta_dotacion', etiqueta: 'Aviso de dotación pendiente', grupo: 'Alertas', tipo: 'numero', minimo: 1, maximo: 120, sufijo: 'días antes de la fecha límite', editable: true },

  { clave: 'sesion_minutos_inactividad', etiqueta: 'Cierre de sesión por inactividad', grupo: 'Seguridad', tipo: 'numero', minimo: 5, maximo: 480, sufijo: 'minutos', editable: true, ayuda: 'Aplica desde el siguiente inicio de sesión' },
  { clave: 'login_intentos_maximos', etiqueta: 'Intentos fallidos antes de bloquear', grupo: 'Seguridad', tipo: 'numero', minimo: 3, maximo: 10, sufijo: 'intentos', editable: true, ayuda: 'El usuario queda bloqueado 15 minutos' },

  { clave: 'tamano_max_archivo_mb', etiqueta: 'Tamaño máximo por archivo', grupo: 'Archivos', tipo: 'numero', minimo: 1, maximo: 50, sufijo: 'MB', editable: true },
  { clave: 'ruta_archivos', etiqueta: 'Carpeta de archivos en el servidor', grupo: 'Archivos', tipo: 'texto', editable: false, ayuda: 'Se cambia en el servidor; moverla sin copiar los archivos rompería los documentos guardados' },
];

export const PARAMETROS_POR_CLAVE = new Map(PARAMETROS.map((p) => [p.clave, p]));
