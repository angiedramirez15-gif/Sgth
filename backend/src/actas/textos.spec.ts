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
