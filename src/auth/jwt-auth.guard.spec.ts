import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'test-secret-32-plus-chars-long-enough!';

const fakeConfig = {
  getOrThrow: () => SECRET,
} as unknown as ConfigService;

function ctxWith(auth?: string): ExecutionContext {
  const req = { headers: auth ? { authorization: auth } : {} };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET });
  const guard = new JwtAuthGuard(jwt, fakeConfig);

  it('allows valid Bearer access token and attaches user', async () => {
    const token = await jwt.signAsync({ sub: 'user-1', typ: 'access' });
    const ctx = ctxWith(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest<{ user?: { id: string } }>();
    expect(req.user).toEqual({ id: 'user-1' });
  });

  it('rejects missing token', async () => {
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects wrong typ', async () => {
    const token = await jwt.signAsync({ sub: 'user-1', typ: 'other' });
    await expect(
      guard.canActivate(ctxWith(`Bearer ${token}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
