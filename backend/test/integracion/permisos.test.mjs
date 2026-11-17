import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { api, descargar, hoy, T } from './ayudante.mjs';
import { camisa, cargoId, carlos, guantes } from './datos.mjs';

describe('Permisos por rol', () => {
  const acta = {};
  before(async () => {
    const op = (await api('GET', '/actas/opciones', null, T.admin)).j;
    acta.dotacion = (await api('POST', '/actas/entregas', { plantilla: 'DOTACION', colaboradorId: carlos.id, fecha: hoy, motivo: 'INGRESO', periodoDotacionId: op.actual, lineas: [{ elementoId: camisa.id, talla: 'M', cantidad: 1 }] }, T.admin)).j.id;
    acta.epp = (await api('POST', '/actas/entregas', { plantilla: 'EPP', colaboradorId: carlos.id, fecha: hoy, motivo: 'INGRESO', lineas: [{ elementoId: guantes.id, cantidad: 1 }] }, T.admin)).j.id;
    assert.ok(acta.dotacion && acta.epp, 'actas de apoyo');
  });

  describe('SST: solo colaboradores, EPP y actas de EPP', () => {
    test('ve solo actas de EPP', async () => {
      const r = await api('GET', '/actas', null, T.sst);
      assert.equal(r.s, 200);
      assert.ok(r.j.length > 0 && r.j.every((a) => a.plantilla === 'EPP'));
    });
    test('abre un acta de EPP, no una de dotación', async () => {
      assert.equal((await api('GET', `/actas/${acta.epp}`, null, T.sst)).s, 200);
      assert.equal((await api('GET', `/actas/${acta.dotacion}`, null, T.sst)).s, 404);
      assert.equal((await descargar(`/actas/${acta.dotacion}/pdf`, T.sst)).s, 404);
    });
    test('en la ficha no ve la dotación ni los equipos del colaborador', async () => {
      const r = await api('GET', `/colaboradores/${carlos.id}/tenencia`, null, T.sst);
      assert.equal(r.j.dotacion.length, 0);
      assert.equal(r.j.activos.length, 0);
      assert.ok(r.j.cantidades.every((c) => c.categoria === 'EPP'));
    });
    test('inventario: EPP sí; dotación, equipos y plantillas no', async () => {
      assert.equal((await api('GET', '/inventario/elementos?categoria=EPP', null, T.sst)).s, 200);
      assert.equal((await api('GET', '/inventario/elementos?categoria=DOTACION', null, T.sst)).s, 403);
      assert.equal((await api('GET', '/inventario/activos', null, T.sst)).s, 403);
      assert.equal((await api('GET', '/plantillas', null, T.sst)).s, 403);
      assert.equal((await api('GET', '/epp/matriz', null, T.sst)).s, 200);
    });
    test('reportes: actas sí, dotación y equipos no', async () => {
      assert.equal((await descargar('/reportes/actas', T.sst)).s, 200);
      assert.equal((await descargar('/reportes/dotacion', T.sst)).s, 403);
      assert.equal((await descargar('/reportes/activos', T.sst)).s, 403);
    });
    test('administración: nada', async () => {
      for (const ruta of ['/usuarios', '/configuracion', '/auditoria']) assert.equal((await api('GET', ruta, null, T.sst)).s, 403, ruta);
    });
  });

  describe('Talento Humano: todo menos usuarios, configuración y plantillas', () => {
    test('ve todas las actas', async () => {
      const r = await api('GET', '/actas', null, T.th);
      assert.ok(new Set(r.j.map((a) => a.plantilla)).size >= 2);
      assert.equal((await api('GET', `/actas/${acta.dotacion}`, null, T.th)).s, 200);
    });
    test('gestiona EPP y catálogos', async () => {
      assert.equal((await api('POST', '/epp/planillas', {}, T.th)).s, 400, 'llega a la validación (no 403)');
      const m = await api('GET', '/epp/matriz', null, T.th);
      assert.equal(m.s, 200);
      assert.equal((await api('POST', '/catalogos/areas', {}, T.th)).s, 400);
    });
    test('no entra a usuarios, configuración ni edita plantillas', async () => {
      assert.equal((await api('GET', '/usuarios', null, T.th)).s, 403);
      assert.equal((await api('GET', '/configuracion', null, T.th)).s, 403);
      assert.equal((await api('PUT', '/configuracion/url_sistema', { valor: 'http://x.y' }, T.th)).s, 403);
      assert.equal((await api('POST', '/plantillas/DOTACION', {}, T.th)).s, 403);
      assert.equal((await api('POST', '/usuarios', { usuario: 'x', nombreCompleto: 'x', cargo: 'x', rol: 'ADMIN' }, T.th)).s, 403);
    });
    test('consulta la auditoría', async () => {
      const r = await api('GET', '/auditoria?accion=LOGIN', null, T.th);
      assert.equal(r.s, 200);
      assert.ok(r.j.total > 0 && r.j.filas.every((f) => f.accion === 'LOGIN'));
    });
    test('matriz de EPP: guarda el cargo', async () => {
      const r = await api('PUT', `/epp/matriz/${cargoId}`, { items: [{ elementoId: guantes.id, cantidad: 1 }] }, T.th);
      assert.ok([200, 201].includes(r.s), r.j.message);
    });
  });
});
