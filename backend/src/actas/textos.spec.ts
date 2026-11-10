import { fechaLarga, rellenar, siglaDocumento } from './textos.js';

const campos = { sexo: 'F', nombre: 'Ana María Gómez', tipoDoc: 'CC', numeroDoc: '1113654321', cargo: 'Asistente', empresa: 'DRIM DUIT S.A.S.' };

describe('Textos de las actas', () => {
  it('usa el género del colaborador y corrige "a el" por "al"', () => {
    expect(rellenar('entrega a {{EL_SENOR}} {{NOMBRE}}', campos)).toBe('entrega a la señora Ana María Gómez');
    expect(rellenar('entrega a {{EL_SENOR}} {{NOMBRE}}', { ...campos, sexo: 'M', nombre: 'Carlos' })).toBe('entrega al señor Carlos');
    expect(rellenar('{{EL_TRABAJADOR_MAY}} MANIFIESTA QUE:', campos)).toBe('LA TRABAJADORA MANIFIESTA QUE:');
  });

  it('no duplica el punto después de S.A.S. y agrega la frase del traspaso', () => {
    expect(rellenar('para la empresa {{EMPRESA}}{{TRASPASO}}', campos)).toBe('para la empresa DRIM DUIT S.A.S.');
    const conTraspaso = rellenar('para la empresa {{EMPRESA}}{{TRASPASO}}', { ...campos, anterior: { sexo: 'M', nombre: 'Carlos Mosquera', cargo: 'Oficial de obra' } });
    expect(conTraspaso).toBe('para la empresa DRIM DUIT S.A.S. Los elementos se encontraban asignados al señor Carlos Mosquera, Oficial de obra.');
  });

  it('escribe documento y fecha como en las actas', () => {
    expect(rellenar('{{TIPO_DOC}} No. {{NUMERO_DOC}}', campos)).toBe('C.C. No. 1113654321');
    expect(siglaDocumento('PPT')).toBe('PPT');
    expect(fechaLarga('2026-11-09')).toBe('9 de noviembre de 2026');
  });
});

import { fechaCorta, sumarDias } from './textos.js';

describe('Fechas de reposición de EPP', () => {
  it('suma la vida útil sin correrse por la zona horaria, incluso en años bisiestos', () => {
    expect(sumarDias('2026-11-10', 30)).toBe('2026-12-10');
    expect(sumarDias('2027-12-31', 1)).toBe('2028-01-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2025-01-10', 180)).toBe('2025-07-09');
  });

  it('escribe la fecha corta como en la tabla del acta', () => {
    expect(fechaCorta('2027-11-10')).toBe('10/11/2027');
  });
});
