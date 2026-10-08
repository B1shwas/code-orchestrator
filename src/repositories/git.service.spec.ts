import { execFile } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitService } from './git.service';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

const execFileMock = execFile as unknown as jest.Mock;

type ExecDone = (err: Error | null, out: unknown, errOut: unknown) => void;

function lastCallback(args: unknown[]): ExecDone {
  return args[args.length - 1] as ExecDone;
}

// NOTE: the mock lacks child_process' custom promisify (which resolves
// { stdout, stderr }), so default promisify resolves the first success
// value — pass it as the { stdout } object the service destructures.
function succeed(stdout = ''): void {
  execFileMock.mockImplementation((...args: unknown[]) => {
    lastCallback(args)(null, { stdout }, '');
  });
}

function failWith(err: Error): void {
  execFileMock.mockImplementation((...args: unknown[]) => {
    lastCallback(args)(err, '', '');
  });
}

describe('GitService', () => {
  const configGet = jest.fn((key: string): unknown => {
    void key;
    return undefined;
  });
  const config = { get: configGet } as unknown as ConfigService;
  const service = new GitService(config);
  const url = 'https://x-access-token:tok@github.com/octocat/hello.git';

  beforeEach(() => {
    execFileMock.mockReset();
    configGet.mockReset();
    configGet.mockReturnValue(undefined);
  });

  it('clones partial with branch and default timeout', async () => {
    succeed();

    await service.clone(url, '/tmp/x', 'main');

    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      [
        'clone',
        '--single-branch',
        '--filter=blob:none',
        '--branch',
        'main',
        url,
        '/tmp/x',
      ],
      { timeout: 600000 },
      expect.any(Function),
    );
  });

  it('omits --branch when none is given', async () => {
    succeed();

    await service.clone(url, '/tmp/x');

    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['clone', '--single-branch', '--filter=blob:none', url, '/tmp/x'],
      { timeout: 600000 },
      expect.any(Function),
    );
  });

  it('redacts the token on clone failure', async () => {
    failWith(new Error('exit 128 x-access-token:secret123@github.com'));

    let caught: unknown;
    try {
      await service.clone(url, '/tmp/x', 'main');
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('x-access-token:<redacted>@');
    expect((caught as Error).message).not.toContain('secret123');
  });

  it('skips unshallow when the clone is not shallow', async () => {
    succeed('false\n');

    await service.unshallow('/tmp/x');

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--is-shallow-repository'],
      { cwd: '/tmp/x' },
      expect.any(Function),
    );
  });

  it('fetches unshallow when the clone is shallow', async () => {
    execFileMock
      .mockImplementationOnce((...args: unknown[]) => {
        lastCallback(args)(null, { stdout: 'true\n' }, '');
      })
      .mockImplementationOnce((...args: unknown[]) => {
        lastCallback(args)(null, { stdout: '' }, '');
      });

    await service.unshallow('/tmp/x');

    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['fetch', '--unshallow'],
      { cwd: '/tmp/x', timeout: 600000 },
      expect.any(Function),
    );
  });

  it('returns the measured size when under quota', async () => {
    succeed('8\t/tmp/x\n');

    await expect(service.measureAndEnforceSize('/tmp/x')).resolves.toBe(
      8 * 1024,
    );
  });

  it('returns null when the size cannot be measured', async () => {
    failWith(new Error('du boom'));

    await expect(service.measureAndEnforceSize('/tmp/x')).resolves.toBeNull();
  });

  it('removes the clone and throws when over quota', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-test-'));
    await writeFile(join(dir, 'f.txt'), 'x');
    configGet.mockImplementation((key: string): unknown =>
      key === 'repos.maxBytes' ? 1 : undefined,
    );
    succeed('8\t/tmp/x\n');

    let caught: unknown;
    try {
      await service.measureAndEnforceSize(dir);
    } catch (err: unknown) {
      caught = err;
    }

    expect((caught as Error).message).toContain('exceeds size limit');
    await expect(access(dir)).rejects.toBeDefined();
  });

  it('removes a local clone from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rm-test-'));
    await writeFile(join(dir, 'f.txt'), 'x');

    await service.removeClone(dir);

    await expect(access(dir)).rejects.toBeDefined();
    await rm(dir, { recursive: true, force: true });
  });
});
