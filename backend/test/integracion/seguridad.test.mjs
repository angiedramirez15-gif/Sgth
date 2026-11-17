import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { api, B, BASE_URL, CLAVE, db, galleta, T, tokenDe, USUARIOS, valor } from './ayudante.mjs';

describe('Seguridad', () => {
  test('cabeceras de seguridad y la API sin caché', async () => {
    const r = await fetch(B + '/salud');
    assert.ok(r.headers.get('content-security-policy'));
    assert.equal(r.headers.get('strict-transport-security') === null, !BASE_URL.startsWith('https'), 'HSTS solo con HTTPS');
    assert.ok(r.headers.get('x-frame-options'));
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('sin sesión no se consulta nada', async () => {
    assert.equal((await api('GET', '/colaboradores')).s, 401);
    assert.equal((await api('GET', '/colaboradores', null, 'token-inventado')).s, 401);
  });

  test('clave errada y usuario inexistente dan el mismo mensaje', async () => {
    const a = await api('POST', '/auth/login', { usuario: USUARIOS.sst, clave: 'otra clave 123' });
    const b = await api('POST', '/auth/login', { usuario: 'no.existe.nunca', clave: 'otra clave 123' });
    assert.equal(a.s, 401);
    assert.equal(b.s, 401);
    assert.equal(a.j.message, b.j.message);
    await db.query('UPDATE usuarios SET intentos_fallidos = 0 WHERE usuario = ?', [USUARIOS.sst]);
  });

  test('intento de inyección SQL en el ingreso', async () => {
    const r = await api('POST', '/auth/login', { usuario: "' OR '1'='1' -- ", clave: "' OR '1'='1" });
    assert.equal(r.s, 401);
  });

  test('quien ve salarios necesita la doble verificación', async () => {
    const r = await api('POST', '/auth/login', { usuario: USUARIOS.admin, clave: CLAVE });
    assert.equal(r.j.paso, 'CODIGO');
    assert.equal(galleta(r.r, 'sgth_sesion'), undefined, 'con solo la clave no hay sesión');
    const previa = galleta(r.r, 'sgth_previa');
    assert.match(previa, /HttpOnly/i);
    assert.match(previa, /SameSite=Strict/i);
    assert.match(previa, /Path=\/api\/auth/i);
    const cookie = { Cookie: previa.split(';')[0] };
    assert.equal((await api('GET', '/colaboradores', null, null, cookie)).s, 401, 'la cookie previa no abre nada');
    const mal = await api('POST', '/auth/verificacion/codigo', { codigo: '000000' }, null, cookie);
    assert.equal(mal.s, 401, 'código errado');
    await db.query('UPDATE usuarios SET intentos_fallidos = 0 WHERE usuario = ?', [USUARIOS.admin]);
  });

  test('el secreto de la doble verificación se guarda cifrado', async () => {
    const guardado = await valor('SELECT totp_secreto FROM usuarios WHERE usuario = ?', [USUARIOS.admin]);
    assert.ok(guardado && !/^[A-Z2-7]{16,}$/.test(guardado));
  });

  test('cookie de sesión protegida y cabecera contra CSRF', async () => {
    const r = await api('POST', '/auth/login', { usuario: USUARIOS.sst, clave: CLAVE });
    const sesion = galleta(r.r, 'sgth_sesion');
    assert.match(sesion, /HttpOnly/i);
    assert.match(sesion, /SameSite=Strict/i);
    assert.ok(!JSON.stringify(r.j).includes(tokenDe(r.r)), 'el token no viaja en el cuerpo');
    const C = { Cookie: sesion.split(';')[0] };
    assert.equal((await api('GET', '/auth/perfil', null, null, C)).s, 200);
    assert.equal((await api('POST', '/alertas/actualizar', {}, null, C)).s, 403, 'sin X-SGTH se rechaza');
    assert.ok([200, 201].includes((await api('POST', '/alertas/actualizar', {}, null, { ...C, 'X-SGTH': '1' })).s));
  });

  test('campos que no existen se rechazan', async () => {
    const r = await api('POST', '/inventario/elementos', { categoria: 'OTRO', nombre: 'x', unidad: 'Und', esAdmin: true }, T.admin);
    assert.equal(r.s, 400);
  });

  test('clave temporal, política de claves y compromiso de confidencialidad', async () => {
    const nombre = 'auto.consulta';
    const existente = await valor('SELECT id FROM usuarios WHERE usuario = ?', [nombre]);
    if (existente) await db.query('UPDATE usuarios SET activo = 1 WHERE id = ?', [existente]);
    const creado = existente
      ? await api('POST', `/usuarios/${existente}/restablecer-clave`, {}, T.admin)
      : await api('POST', '/usuarios', { usuario: nombre, nombreCompleto: 'Carlos Consulta Mejía', cargo: 'Auxiliar', rol: 'CONSULTA' }, T.admin);
    assert.ok([200, 201].includes(creado.s), creado.j.message);
    const temporal = creado.j.claveTemporal;
    assert.equal(temporal.length, 12);
    await db.query('DELETE h FROM historial_claves h JOIN usuarios u ON u.id = h.usuario_id WHERE u.usuario = ?', [nombre]);

    let x = await api('POST', '/auth/login', { usuario: nombre, clave: temporal });
    assert.equal(x.j.usuario.motivoClave, 'TEMPORAL');
    let t = tokenDe(x.r);
    x = await api('GET', '/colaboradores', null, t);
    assert.equal(x.s, 403, 'no consulta sin cambiar la clave temporal');
    for (const [mala, motivo] of [['corta123', /12/], ['Colombia2026!!', /común/], ['Carlos-2026-xy', /nombre/], ['abcd1234efgh', /secuencias/]]) {
      x = await api('POST', '/auth/cambiar-clave', { claveActual: temporal, claveNueva: mala }, t);
      assert.equal(x.s, 400, `debía rechazar "${mala}"`);
      assert.match(x.j.message, motivo);
    }
    x = await api('POST', '/auth/cambiar-clave', { claveActual: temporal, claveNueva: 'Rio Cauca 9 sol' }, t);
    assert.equal(x.s, 200);
    t = tokenDe(x.r);
    x = await api('GET', '/colaboradores', null, t);
    if (x.s === 403) { // falta el compromiso (si ya lo había aceptado antes, no lo pide)
      assert.match(x.j.message, /compromiso/);
      const c = await api('GET', '/auth/compromiso', null, t);
      t = tokenDe((await api('POST', '/auth/compromiso', { textoId: c.j.id }, t)).r);
      x = await api('GET', '/colaboradores', null, t);
    }
    assert.equal(x.s, 200);
    const id = await valor('SELECT id FROM usuarios WHERE usuario = ?', [nombre]);
    assert.ok(await valor('SELECT COUNT(*) FROM aceptaciones_legales WHERE usuario_id = ?', [id]) >= 1, 'queda registrada la aceptación');

    x = await api('POST', '/auth/cambiar-clave', { claveActual: 'Rio Cauca 9 sol', claveNueva: 'Rio Cauca 9 sol' }, t);
    assert.equal(x.s, 400, 'no repite una clave anterior');

    await db.query('UPDATE usuarios SET clave_cambiada_en = NOW() - INTERVAL 91 DAY WHERE id = ?', [id]);
    x = await api('POST', '/auth/login', { usuario: nombre, clave: 'Rio Cauca 9 sol' });
    assert.equal(x.j.usuario.motivoClave, 'VENCIDA', 'a los 91 días pide cambiar la clave');
    await db.query('UPDATE usuarios SET activo = 0, version_sesion = version_sesion + 1 WHERE id = ?', [id]);
  });

  test('un usuario inactivo no puede ingresar', async () => {
    const id = await valor('SELECT id FROM usuarios WHERE usuario = ?', ['auto.consulta']);
    assert.ok(id);
    const r = await api('POST', '/auth/login', { usuario: 'auto.consulta', clave: 'Rio Cauca 9 sol' });
    assert.equal(r.s, 401, 'inactivo no ingresa');
  });
});
