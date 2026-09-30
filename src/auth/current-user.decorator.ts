import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (data: 'id' | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!req.user) return undefined;
    return data === 'id' ? req.user.id : req.user;
  },
);
