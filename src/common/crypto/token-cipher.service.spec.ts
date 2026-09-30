import { ConfigService } from '@nestjs/config';
import { TokenCipherService } from './token-cipher.service';

describe('TokenCipherService', () => {
  const key = '0123456789abcdef'.repeat(4); // 64 hex chars

  const makeConfig = (hex: string) =>
    ({
      getOrThrow: () => hex,
    }) as unknown as ConfigService;

  const makeCipher = (hex: string) => {
    const cipher = new TokenCipherService(makeConfig(hex));
    cipher.onModuleInit();
    return cipher;
  };

  it('round-trips encrypt/decrypt', () => {
    const cipher = makeCipher(key);
    const enc = cipher.encrypt('gho_secret-token');
    expect(enc).not.toContain('gho_secret-token');
    expect(cipher.decrypt(enc)).toBe('gho_secret-token');
  });

  it('rejects malformed payloads', () => {
    const cipher = makeCipher(key);
    expect(() => cipher.decrypt('not-a-payload')).toThrow();
  });

  it('rejects invalid key length', () => {
    expect(() => makeCipher('abc')).toThrow();
  });
});
