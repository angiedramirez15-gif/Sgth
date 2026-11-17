import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avisosServidor } from './estado-servidor.js';

describe('avisosServidor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sgth-'));
  const estado = join(dir, 'ultimo.json');
  const ahora = new Date('2026-11-20T15:00:00Z');
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.RESPALDO_ESTADO = estado;
    process.env.HTTPS_PFX = 'x.pfx';
    delete process.env.HTTPS_CERT;
  });
  afterAll(() => { process.env.NODE_ENV = 'test'; delete process.env.HTTPS_PFX; });

  it('sin avisos en desarrollo', () => {
    process.env.NODE_ENV = 'development';
    expect(avisosServidor(ahora)).toEqual([]);
  });
  it('respaldo reciente y correcto: sin avisos', () => {
    writeFileSync(estado, JSON.stringify({ ok: true, fecha: '2026-11-20T17:30:00Z' }));
    expect(avisosServidor(new Date('2026-11-21T15:00:00Z'))).toEqual([]);
  });
  it('respaldo con error', () => {
    writeFileSync(estado, JSON.stringify({ ok: false, fecha: '2026-11-20T17:30:00Z', error: 'sin conexión' }));
    expect(avisosServidor(ahora)[0]).toMatch(/falló: sin conexión/);
  });
  it('respaldo atrasado', () => {
    writeFileSync(estado, JSON.stringify({ ok: true, fecha: '2026-11-15T17:30:00Z' }));
    expect(avisosServidor(ahora)[0]).toMatch(/hace 4 días/);
  });
  it('sin HTTPS', () => {
    writeFileSync(estado, JSON.stringify({ ok: true, fecha: '2026-11-20T14:00:00Z' }));
    delete process.env.HTTPS_PFX;
    expect(avisosServidor(ahora)).toEqual([expect.stringMatching(/sin HTTPS/)]);
  });
});
