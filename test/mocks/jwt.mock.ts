/**
 * Jest-only stub for ESM-only `@nestjs/jwt`.
 * Maps via package.json jest.moduleNameMapper so unit tests (ts-jest/CJS)
 * don't try to parse the ESM dist. Runtime builds use the real package.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jwtLib = require('jsonwebtoken');

export class JwtService {
  constructor(private readonly opts?: { secret?: string }) {}

  signAsync(
    payload: string | object,

    options?: any,
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secret: string =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      options?.secret ?? this.opts?.secret ?? 'test-secret';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return Promise.resolve(jwtLib.sign(payload as object, secret, options));
  }

  verifyAsync<T = unknown>(
    token: string,

    options?: any,
  ): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secret: string =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      options?.secret ?? this.opts?.secret ?? 'test-secret';
    return Promise.resolve(jwtLib.verify(token, secret) as T);
  }
}
