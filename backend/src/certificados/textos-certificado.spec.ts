import { describe, expect, it } from 'vitest';
import { pesosEnLetras, rellenarCertificado, salarioEnTexto, type DatosCertificado } from './textos-certificado.js';

describe('pesosEnLetras', () => {
  it.each([
    [1, 'UN PESOS M/CTE'],
    [21, 'VEINTIÚN PESOS M/CTE'],
    [100, 'CIEN PESOS M/CTE'],
    [1000, 'MIL PESOS M/CTE'],
    [21_000, 'VEINTIÚN MIL PESOS M/CTE'],
    [31_500, 'TREINTA Y UN MIL QUINIENTOS PESOS M/CTE'],
    [1_000_000, 'UN MILLÓN DE PESOS M/CTE'],
    [1_750_905, 'UN MILLÓN SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO PESOS M/CTE'],
    [2_500_000, 'DOS MILLONES QUINIENTOS MIL PESOS M/CTE'],
    [12_000_000, 'DOCE MILLONES DE PESOS M/CTE'],
    [101_116_000, 'CIENTO UN MILLONES CIENTO DIECISÉIS MIL PESOS M/CTE'],
  ])('%i → %s', (n, texto) => expect(pesosEnLetras(n)).toBe(texto));

  it('salario con puntos de miles y letras', () => {
    expect(salarioEnTexto(2_500_000)).toBe('$2.500.000 (DOS MILLONES QUINIENTOS MIL PESOS M/CTE)');
  });
});

describe('rellenarCertificado', () => {
  const base: DatosCertificado = {
    sexo: 'M', nombre: 'Pedro Luis Caicedo Rojas', tipoDoc: 'CC', numeroDoc: '94000111', cargo: 'Oficial de obra',
    tipoContrato: 'FIJO', fechaIngreso: '2025-02-03', fechaFinContrato: '2026-12-01', fechaRetiro: null, salario: 1_750_905,
  };
  const ctx = { empresa: 'DRIM DUIT S.A.S.', nit: '900.1-1', ciudad: 'Palmira', fechaExpedicion: '2026-11-11', cargoFirmante: 'Directora Financiera' };
  const textos = ['{{EL_SENOR_CAP}} {{NOMBRE}} {{LABORA}} {{PERIODO_LABORAL}}, {{TIPO_CONTRATO}}.', 'Salario: {{SALARIO}}.'];

  it('activo con término fijo', () => {
    const [a, b] = rellenarCertificado(textos, base, ctx);
    expect(a).toBe('El señor Pedro Luis Caicedo Rojas labora desde el 3 de febrero de 2025, mediante contrato de trabajo a término fijo hasta el 1 de diciembre de 2026.');
    expect(b).toContain('$1.750.905');
  });

  it('retirado y sin salario: quita el párrafo del salario', () => {
    const r = rellenarCertificado(textos, { ...base, sexo: 'F', fechaRetiro: '2026-06-30', salario: null }, ctx);
    expect(r).toHaveLength(1);
    expect(r[0]).toBe('La señora Pedro Luis Caicedo Rojas laboró desde el 3 de febrero de 2025 hasta el 30 de junio de 2026, mediante contrato de trabajo a término fijo.');
  });
});
