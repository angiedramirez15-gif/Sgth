/** Valores de las listas del colaborador, con su texto para mostrar (pantallas, plantilla de Excel). */
export const LISTAS = {
  sexo: [
    { valor: 'F', etiqueta: 'Femenino' },
    { valor: 'M', etiqueta: 'Masculino' },
  ],
  tipoSangre: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((v) => ({ valor: v, etiqueta: v })),
  estadoCivil: [
    { valor: 'SOLTERO', etiqueta: 'Soltero(a)' },
    { valor: 'CASADO', etiqueta: 'Casado(a)' },
    { valor: 'UNION_LIBRE', etiqueta: 'Unión libre' },
    { valor: 'SEPARADO', etiqueta: 'Separado(a)' },
    { valor: 'DIVORCIADO', etiqueta: 'Divorciado(a)' },
    { valor: 'VIUDO', etiqueta: 'Viudo(a)' },
  ],
  nivelEducativo: [
    { valor: 'PRIMARIA', etiqueta: 'Primaria' },
    { valor: 'BACHILLER', etiqueta: 'Bachiller' },
    { valor: 'TECNICO', etiqueta: 'Técnico' },
    { valor: 'TECNOLOGO', etiqueta: 'Tecnólogo' },
    { valor: 'PROFESIONAL', etiqueta: 'Profesional' },
    { valor: 'ESPECIALIZACION', etiqueta: 'Especialización' },
    { valor: 'MAESTRIA', etiqueta: 'Maestría' },
    { valor: 'DOCTORADO', etiqueta: 'Doctorado' },
  ],
  tipoContrato: [
    { valor: 'INDEFINIDO', etiqueta: 'Término indefinido' },
    { valor: 'FIJO', etiqueta: 'Término fijo' },
    { valor: 'OBRA_LABOR', etiqueta: 'Obra o labor' },
    { valor: 'APRENDIZAJE', etiqueta: 'Aprendizaje' },
    { valor: 'PRESTACION_SERVICIOS', etiqueta: 'Prestación de servicios' },
  ],
  tipoCuenta: [
    { valor: 'AHORROS', etiqueta: 'Ahorros' },
    { valor: 'CORRIENTE', etiqueta: 'Corriente' },
  ],
  derechoDotacion: [
    { valor: 'AUTO', etiqueta: 'Según salario y antigüedad' },
    { valor: 'SI', etiqueta: 'Sí' },
    { valor: 'NO', etiqueta: 'No' },
  ],
  tipoTalla: [
    { valor: 'CAMISA', etiqueta: 'Camisa' },
    { valor: 'PANTALON', etiqueta: 'Pantalón' },
    { valor: 'CALZADO', etiqueta: 'Calzado' },
    { valor: 'GUANTES', etiqueta: 'Guantes' },
    { valor: 'OVEROL', etiqueta: 'Overol' },
  ],
} as const;

export const valores = <K extends keyof typeof LISTAS>(k: K) => LISTAS[k].map((x) => x.valor) as string[];

/** Contratos que exigen fecha de terminación. */
export const CONTRATOS_CON_FIN = ['FIJO', 'APRENDIZAJE'];
