import { createLimiter } from './p-limit.util';

describe('createLimiter', () => {
  it('caps concurrent executions', async () => {
    const limit = createLimiter(2);
    let live = 0;
    let peak = 0;
    const work = () =>
      limit(async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 10));
        live -= 1;
        return live;
      });
    await Promise.all([work(), work(), work(), work(), work()]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);
  });

  it('propagates rejections without stalling the queue', async () => {
    const limit = createLimiter(1);
    const failing = limit(() => Promise.reject(new Error('boom')));
    const ok = limit(() => Promise.resolve('fine'));
    await expect(failing).rejects.toThrow('boom');
    await expect(ok).resolves.toBe('fine');
  });
});
