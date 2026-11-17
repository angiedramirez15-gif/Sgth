import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { api, descargar, esPdf, T } from './ayudante.mjs';
import { ana, cargoId, crearColaborador, opciones } from './datos.mjs';

describe('Colaboradores y certificados', () => {
  test('validaciones al crear', async () => {
    const base = { tipoDocumentoId: ana.tipoDocumentoId, nombres: 'X', apellidos: 'Y', sexo: 'F', cargoId, areaId: opciones.cargos[0].areaId, fechaIngreso: '2024-01-15', tipoContrato: 'INDEFINIDO' };
    let r = await api('POST', '/colaboradores', { ...base, numeroDocumento: ana.numeroDocumento }, T.admin);
    assert.equal(r.s, 409, 'documento repetido');
    r = await api('POST', '/colaboradores', { ...base, numeroDocumento: '123', correo: 'no-es-correo' }, T.admin);
    assert.equal(r.s, 400, 'correo no válido');
    r = await api('POST', '/colaboradores', { ...base, numeroDocumento: '124', sexo: 'Z' }, T.admin);
    assert.equal(r.s, 400, 'valor fuera de la lista');
  });

  test('el salario solo lo ve quien tiene permiso', async () => {
    assert.equal((await api('GET', `/colaboradores/${ana.id}`, null, T.admin)).j.salario, 2_500_000);
    assert.equal((await api('GET', `/colaboradores/${ana.id}`, null, T.th)).j.salario, 2_500_000);
    const sst = await api('GET', `/colaboradores/${ana.id}`, null, T.sst);
    assert.equal(sst.s, 200);
    assert.equal(sst.j.salario, undefined);
    assert.equal(sst.j.numeroCuenta, undefined);
  });

  test('certificado laboral con salario, con consecutivo CER', async (t) => {
    const r = await api('POST', `/colaboradores/${ana.id}/certificados`, { conSalario: true, dirigidoA: 'Banco de prueba' }, T.th);
    if (r.s === 400 && /Configuración/.test(r.j.message)) {
      t.skip('falta configurar el certificado en la base de pruebas: ' + r.j.message);
      return;
    }
    assert.equal(r.s, 201, r.j.message);
    assert.match(r.j.consecutivo, /^CER-\d{4}-\d{4}$/);
    const pdf = await descargar(`/certificados/${r.j.id}/pdf`, T.th);
    assert.equal(pdf.s, 200);
    assert.ok(esPdf(pdf.b));
    const lista = await api('GET', `/colaboradores/${ana.id}/certificados`, null, T.th);
    assert.ok(lista.j.some((c) => c.id === r.j.id));
  });

  test('SST no genera certificados', async () => {
    assert.equal((await api('POST', `/colaboradores/${ana.id}/certificados`, { conSalario: false }, T.sst)).s, 403);
  });

  test('retiro y reactivación', async () => {
    const c = await crearColaborador('Retirada');
    let r = await api('POST', `/colaboradores/${c.id}/retiro`, { fechaRetiro: '2023-12-31', motivoRetiro: 'RENUNCIA' }, T.admin);
    assert.equal(r.s, 400, 'retiro antes del ingreso');
    r = await api('POST', `/colaboradores/${c.id}/retiro`, { fechaRetiro: '2025-06-30', motivoRetiro: 'RENUNCIA' }, T.admin);
    assert.ok([200, 201].includes(r.s), r.j.message);
    assert.equal((await api('GET', `/colaboradores/${c.id}`, null, T.admin)).j.estado, 'RETIRADO');
    r = await api('POST', `/colaboradores/${c.id}/reactivar`, {}, T.admin);
    assert.ok([200, 201].includes(r.s), r.j.message);
    assert.equal((await api('GET', `/colaboradores/${c.id}`, null, T.admin)).j.estado, 'ACTIVO');
  });
});
