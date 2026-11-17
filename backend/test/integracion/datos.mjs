// Datos propios de cada ejecución: todo lleva la etiqueta PRB… para no chocar con datos existentes.
import { api, ETIQUETA, T } from './ayudante.mjs';

const o = (await api('GET', '/colaboradores/opciones', null, T.admin)).j;
if (!o.cargos?.length || !o.tiposDocumento?.length) throw new Error('La base de pruebas no tiene cargos o tipos de documento: créelos en Catálogos.');
export const opciones = o;
const cargo = o.cargos[0];
let documento = Number(String(Date.now()).slice(-9)) * 10;

export async function crearColaborador(nombres, extra = {}) {
  const r = await api('POST', '/colaboradores', {
    tipoDocumentoId: o.tiposDocumento[0].id, numeroDocumento: String(++documento), nombres, apellidos: `Prueba ${ETIQUETA}`,
    sexo: 'F', cargoId: cargo.id, areaId: cargo.areaId, fechaIngreso: '2024-01-15', tipoContrato: 'INDEFINIDO', salario: 2_500_000, ...extra,
  }, T.admin);
  if (r.s !== 201) throw new Error(`No se pudo crear el colaborador de prueba: ${r.j.message}`);
  return r.j;
}

async function crearElemento(cuerpo) {
  const r = await api('POST', '/inventario/elementos', { unidad: 'Und', ...cuerpo, nombre: `${cuerpo.nombre} ${ETIQUETA}` }, T.admin);
  if (r.s !== 201) throw new Error(`No se pudo crear "${cuerpo.nombre}": ${r.j.message}`);
  return r.j;
}

export const ana = await crearColaborador('Ana');
export const carlos = await crearColaborador('Carlos');
export const cargoId = cargo.id;

export const camisa = await crearElemento({ categoria: 'DOTACION', nombre: 'Camisa', manejaTallas: true });
export const guantes = await crearElemento({ categoria: 'EPP', nombre: 'Guantes', vidaUtilDias: 90 });
export const llave = await crearElemento({ categoria: 'OTRO', nombre: 'Llave' });
export const portatil = await crearElemento({ categoria: 'EQUIPO', nombre: 'Portátil' });
export const silla = await crearElemento({ categoria: 'MUEBLE', nombre: 'Silla' });

const entrada = await api('POST', '/inventario/entradas', {
  numeroFactura: ETIQUETA,
  lineas: [{ elementoId: camisa.id, talla: 'M', cantidad: 10 }, { elementoId: guantes.id, cantidad: 20 }, { elementoId: llave.id, cantidad: 3 }],
}, T.admin);
if (entrada.s !== 201) throw new Error('No se pudo registrar la entrada de prueba: ' + entrada.j.message);
