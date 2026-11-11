import { base32, codigoParaPaso, desdeBase32, verificarCodigo } from './totp.js';
import { cifrar, descifrar } from './cifrado.js';

describe('TOTP (RFC 6238)', () => {
  // Vectores del RFC 6238 (SHA-1, secreto "12345678901234567890"), últimos 6 dígitos
  const secreto = base32(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('t=%i → %s', (t, codigo) => expect(codigoParaPaso(secreto, Math.floor(t / 30))).toBe(codigo));

  it('base32 ida y vuelta', () => {
    expect(desdeBase32(base32(Buffer.from('hola mundo'))).toString()).toBe('hola mundo');
  });

  it('acepta ±30 s y no repite un paso usado', () => {
    const ahora = 1_700_000_000_000;
    const paso = Math.floor(ahora / 30_000);
    const anterior = codigoParaPaso(secreto, paso - 1);
    expect(verificarCodigo(secreto, anterior, null, ahora)).toBe(paso - 1);
    expect(verificarCodigo(secreto, anterior, paso - 1, ahora)).toBeNull();
    expect(verificarCodigo(secreto, codigoParaPaso(secreto, paso - 3), null, ahora)).toBeNull();
    expect(verificarCodigo(secreto, '12a456', null, ahora)).toBeNull();
  });
});

describe('cifrado', () => {
  it('cifra y descifra; con otra llave falla', () => {
    const c = cifrar('JBSWY3DPEHPK3PXP', 'a'.repeat(40));
    expect(c).not.toContain('JBSWY3DPEHPK3PXP');
    expect(descifrar(c, 'a'.repeat(40))).toBe('JBSWY3DPEHPK3PXP');
    expect(() => descifrar(c, 'b'.repeat(40))).toThrow();
  });
});
