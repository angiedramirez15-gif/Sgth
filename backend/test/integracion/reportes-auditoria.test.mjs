import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { api, descargar, esExcel, T } from './ayudante.mjs';
import { ana } from './datos.mjs';

describe('Reportes, alertas y auditoría', () => {
  test('los reportes salen en Excel', async () => {
    for (const reporte of ['colaboradores', 'actas', 'existencias']) {
      const r = await descargar(`/reportes/${reporte}`, T.admin);
      assert.equal(r.s, 200, reporte);
      assert.ok(esExcel(r.b), reporte);
    }
  });

  test('las alertas se recalculan', async () => {
    assert.ok([200, 201].includes((await api('POST', '/alertas/actualizar', {}, T.admin)).s));
    const r = await api('GET', '/alertas/resumen', null, T.admin);
    assert.equal(r.s, 200);
    assert.equal(typeof r.j.total, 'number');
  });

  test('la auditoría registra la creación del colaborador', async () => {
    const r = await api('GET', '/auditoria?modulo=colaboradores&accion=CREAR', null, T.admin);
    assert.equal(r.s, 200);
    assert.ok(r.j.filas.some((f) => f.registroId === ana.id), 'aparece el registro');
  });

  test('ver datos sensibles queda en la auditoría', async () => {
    await api('GET', `/colaboradores/${ana.id}`, null, T.th);
    const r = await api('GET', '/auditoria?accion=CONSULTAR_SENSIBLE', null, T.admin);
    assert.ok(r.j.filas.some((f) => f.registroId === ana.id));
  });

  test('la descarga de reportes queda en la auditoría', async () => {
    const r = await api('GET', '/auditoria?accion=DESCARGAR', null, T.admin);
    assert.ok(r.j.filas.some((f) => f.modulo === 'Reportes'));
  });

  test('avisos por correo: estado y validación del destino', async () => {
    const e = await api('GET', '/configuracion/correo', null, T.admin);
    assert.equal(e.s, 200);
    assert.equal(typeof e.j.configurado, 'boolean');
    const r = await api('PUT', '/configuracion/avisos_correo_destino', { valor: 'angie@empresa, otro' }, T.admin);
    assert.equal(r.s, 400, 'correo no válido');
    assert.equal((await api('POST', '/configuracion/correo/prueba', {}, T.th)).s, 403, 'solo quien administra la configuración');
  });
});
