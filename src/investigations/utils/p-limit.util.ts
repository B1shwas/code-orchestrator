export function createLimiter(
  max: number,
): <T>(fn: () => Promise<T>) => Promise<T> {
  const queue: (() => void)[] = [];
  let active = 0;

  const next = (): void => {
    if (active >= max) return;
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(
          (v) => {
            active -= 1;
            next();
            resolve(v);
          },
          (e: unknown) => {
            active -= 1;
            next();
            reject(e instanceof Error ? e : new Error(String(e)));
          },
        );
      });
      next();
    });
}
