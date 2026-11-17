import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { api, descargar, esPdf, ETIQUETA, hoy, pdfPrueba, T } from './ayudante.mjs';
import { ana, camisa, carlos, guantes, llave, portatil, silla } from './datos.mjs';

const existencia = async (cat, id, talla) => {
  const e = (await api('GET', `/inventario/elementos?categoria=${cat}`, null, T.admin)).j.find((x) => x.id === id);
  return e.existencias.find((x) => x.talla === talla)?.cantidad ?? 0;
};

describe('Inventario', () => {
  test('validaciones del catálogo y las entradas', async () => {
    let r = await api('POST', '/inventario/elementos', { categoria: 'DOTACION', nombre: camisa.nombre, unidad: 'Und' }, T.admin);
    assert.equal(r.s, 409, 'nombre repetido');
    r = await api('POST', '/inventario/elementos', { categoria: 'EPP', nombre: 'Casco ' + ETIQUETA, unidad: 'Und' }, T.admin);
    assert.equal(r.s, 400, 'EPP sin vida útil');
    r = await api('POST', '/inventario/entradas', { lineas: [{ elementoId: camisa.id, cantidad: 1 }] }, T.admin);
    assert.equal(r.s, 400, 'falta la talla');
    r = await api('POST', '/inventario/entradas', { lineas: [{ elementoId: portatil.id, cantidad: 1 }] }, T.admin);
    assert.equal(r.s, 400, 'un equipo no entra por cantidad');
  });

  test('ajustes: no deja el stock negativo', async () => {
    let r = await api('POST', '/inventario/ajustes', { elementoId: camisa.id, talla: 'M', tipo: 'AJUSTE_NEGATIVO', cantidad: 50, observacion: 'Conteo' }, T.admin);
    assert.equal(r.s, 400);
    r = await api('POST', '/inventario/ajustes', { elementoId: camisa.id, talla: 'M', tipo: 'AJUSTE_NEGATIVO', cantidad: 2, observacion: 'Dos manchadas' }, T.admin);
    assert.equal(r.s, 201);
    assert.equal(await existencia('DOTACION', camisa.id, 'M'), 8);
  });

  test('equipos y muebles con placa', async () => {
    let r = await api('POST', '/inventario/activos', { elementoId: portatil.id, serial: 'SER-' + ETIQUETA, marca: 'Lenovo', condicion: 'NUEVO', valorCompra: '3.250.000' }, T.admin);
    assert.equal(r.s, 201);
    assert.match(r.j[0].placa, /^DD-EQ-\d{4}$/);
    assert.equal(r.j[0].valorCompra, 3_250_000);
    r = await api('POST', '/inventario/activos', { elementoId: portatil.id, serial: 'SER-' + ETIQUETA, condicion: 'NUEVO' }, T.admin);
    assert.equal(r.s, 409, 'serial repetido');
    r = await api('POST', '/inventario/activos', { elementoId: silla.id, condicion: 'BUENO', cantidad: 3 }, T.admin);
    assert.equal(r.j.length, 3);
    const n = r.j.map((a) => Number(a.placa.slice(-4)));
    assert.deepEqual(n, [n[0], n[0] + 1, n[0] + 2], 'placas seguidas');
    r = await api('PATCH', `/inventario/activos/${r.j[2].id}/estado`, { estado: 'DADO_DE_BAJA' }, T.admin);
    assert.equal(r.s, 400, 'la baja exige motivo');
  });

  test('stickers en PDF', async () => {
    const activos = (await api('GET', '/inventario/activos', null, T.admin)).j.slice(0, 3).map((a) => a.id);
    const r = await descargar('/inventario/activos/stickers', T.admin, 'POST', { ids: activos, posicionInicial: 1, bordes: true });
    assert.equal(r.s, 200);
    assert.ok(esPdf(r.b));
  });
});

describe('Actas', () => {
  const ids = {};
  const activo = async (elementoId) => (await api('GET', '/inventario/activos', null, T.admin)).j.find((a) => a.elementoId === elementoId && a.estado === 'DISPONIBLE');

  test('entrega de dotación descuenta el stock y genera el PDF', async () => {
    const op = (await api('GET', '/actas/opciones', null, T.admin)).j;
    const antes = await existencia('DOTACION', camisa.id, 'M');
    const r = await api('POST', '/actas/entregas', { plantilla: 'DOTACION', colaboradorId: ana.id, fecha: hoy, motivo: 'DOTACION_PERIODICA', periodoDotacionId: op.actual, lineas: [{ elementoId: camisa.id, talla: 'M', cantidad: 2 }] }, T.admin);
    assert.equal(r.s, 201, r.j.message);
    assert.match(r.j.consecutivo, /^ACT-\d{4}-\d{4}$/);
    ids.dotacion = r.j.id;
    assert.equal(await existencia('DOTACION', camisa.id, 'M'), antes - 2);
    const pdf = await descargar(`/actas/${r.j.id}/pdf`, T.admin);
    assert.ok(esPdf(pdf.b));
  });

  test('no entrega sin stock ni con fecha futura', async () => {
    let r = await api('POST', '/actas/entregas', { plantilla: 'DOTACION', colaboradorId: ana.id, fecha: hoy, motivo: 'DANO', lineas: [{ elementoId: camisa.id, talla: 'M', cantidad: 999 }] }, T.admin);
    assert.equal(r.s, 400);
    r = await api('POST', '/actas/entregas', { plantilla: 'DOTACION', colaboradorId: ana.id, fecha: '2099-01-01', motivo: 'DANO', lineas: [{ elementoId: camisa.id, talla: 'M', cantidad: 1 }] }, T.admin);
    assert.equal(r.s, 400);
  });

  test('entrega de EPP', async () => {
    const r = await api('POST', '/actas/entregas', { plantilla: 'EPP', colaboradorId: ana.id, fecha: hoy, motivo: 'INGRESO', lineas: [{ elementoId: guantes.id, cantidad: 1 }] }, T.sst);
    assert.equal(r.s, 201, r.j.message);
    ids.epp = r.j.id;
  });

  test('equipo: asignación, traspaso, devolución y anulación en orden', async () => {
    const eq = await activo(portatil.id);
    let r = await api('POST', '/actas/entregas', { plantilla: 'EQUIPOS', colaboradorId: ana.id, fecha: hoy, motivo: 'ASIGNACION', lineas: [{ activoId: eq.id }] }, T.admin);
    assert.equal(r.s, 201, r.j.message);
    ids.equipos = r.j.id;
    assert.equal((await api('GET', `/inventario/activos/${eq.id}`, null, T.admin)).j.colaboradorId, ana.id);
    r = await api('POST', '/actas/entregas', { plantilla: 'EQUIPOS', colaboradorId: carlos.id, fecha: hoy, motivo: 'ASIGNACION', lineas: [{ activoId: eq.id }] }, T.admin);
    assert.equal(r.s, 400, 'ya está asignado');

    r = await api('POST', '/actas/entregas', { plantilla: 'EQUIPOS', colaboradorId: carlos.id, colaboradorAnteriorId: ana.id, fecha: hoy, motivo: 'ASIGNACION', lineas: [{ activoId: eq.id }] }, T.admin);
    assert.equal(r.j.motivo, 'TRASPASO');
    const traspaso = r.j.id;

    r = await api('POST', '/actas/devoluciones', { colaboradorId: carlos.id, fecha: hoy, motivo: 'CAMBIO_CARGO', lineas: [{ activoId: eq.id, condicion: 'REGULAR', quedaEn: 'EN_REPARACION', observaciones: 'Pantalla' }] }, T.admin);
    assert.equal(r.s, 201, r.j.message);
    const devolucion = r.j.id;
    assert.equal((await api('GET', `/inventario/activos/${eq.id}`, null, T.admin)).j.estado, 'EN_REPARACION');

    r = await api('POST', `/actas/${traspaso}/anular`, { motivo: 'Prueba' }, T.admin);
    assert.equal(r.s, 400, 'no anula si hubo movimientos después');
    r = await api('POST', `/actas/${devolucion}/anular`, { motivo: 'Registrada por error' }, T.admin);
    assert.equal(r.j.estado, 'ANULADA');
    assert.equal((await api('GET', `/inventario/activos/${eq.id}`, null, T.admin)).j.colaboradorId, carlos.id, 'vuelve a Carlos');
    r = await api('POST', `/actas/${devolucion}/anular`, { motivo: 'otra vez' }, T.admin);
    assert.equal(r.s, 400, 'no se anula dos veces');
  });

  test('otros elementos y su devolución', async () => {
    let r = await api('POST', '/actas/entregas', { plantilla: 'OTROS', colaboradorId: carlos.id, fecha: hoy, motivo: 'INGRESO', lineas: [{ elementoId: llave.id, cantidad: 1 }] }, T.admin);
    assert.equal(r.s, 201, r.j.message);
    r = await api('POST', '/actas/devoluciones', { colaboradorId: carlos.id, fecha: hoy, motivo: 'RETIRO', lineas: [{ elementoId: llave.id, cantidad: 2, condicion: 'BUENO' }] }, T.admin);
    assert.equal(r.s, 400, 'no devuelve más de lo que tiene');
  });

  test('subir el acta firmada la deja completa', async () => {
    const fd = new FormData();
    fd.append('archivo', pdfPrueba(), 'firmada.pdf');
    const r = await api('POST', `/actas/${ids.equipos}/firmada`, fd, T.admin);
    assert.equal(r.s, 200, r.j.message);
    assert.equal(r.j.estado, 'COMPLETA');
    assert.equal((await descargar(`/actas/${ids.equipos}/firmada`, T.admin)).s, 200);
  });

  test('un archivo que no es PDF se rechaza', async () => {
    const fd = new FormData();
    fd.append('archivo', new Blob(['MZ ejecutable'], { type: 'application/pdf' }), 'virus.pdf');
    assert.equal((await api('POST', `/actas/${ids.epp}/firmada`, fd, T.admin)).s, 400);
  });
});
