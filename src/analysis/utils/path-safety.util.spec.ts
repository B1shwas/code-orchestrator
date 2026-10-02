import { resolve } from 'node:path';
import { isSafeRelativePath, resolveWithin } from './path-safety.util';
import { BadRequestException } from '@nestjs/common';

const BASE = resolve('/tmp/whycode-test/repos/octocat/hello-world');

describe('resolveWithin', () => {
  it('resolves a nested file inside the repo', () => {
    expect(resolveWithin(BASE, 'src/auth/auth.service.ts')).toBe(
      resolve(BASE, 'src/auth/auth.service.ts'),
    );
  });

  it('treats leading slashes as repo-relative', () => {
    expect(resolveWithin(BASE, '/src/auth')).toBe(resolve(BASE, 'src/auth'));
  });

  it('returns the root for empty path', () => {
    expect(resolveWithin(BASE, '')).toBe(BASE);
    expect(resolveWithin(BASE, '   ')).toBe(BASE);
  });

  it('collapses inner dot segments that stay inside', () => {
    expect(resolveWithin(BASE, 'src/../src/auth')).toBe(
      resolve(BASE, 'src/auth'),
    );
  });

  it('rejects parent traversal', () => {
    expect(() => resolveWithin(BASE, '..')).toThrow(BadRequestException);
    expect(() => resolveWithin(BASE, '../other-repo')).toThrow(
      BadRequestException,
    );
    expect(() => resolveWithin(BASE, 'src/../../..')).toThrow(
      BadRequestException,
    );
  });

  it('rejects encoded traversal', () => {
    expect(() => resolveWithin(BASE, '%2e%2e%2fsecret')).toThrow(
      BadRequestException,
    );
    expect(() => resolveWithin(BASE, 'src/%2e%2e/%2e%2e/x')).toThrow(
      BadRequestException,
    );
  });

  it('rejects null bytes plain and encoded', () => {
    expect(() => resolveWithin(BASE, 'a\0b')).toThrow(BadRequestException);
    expect(() => resolveWithin(BASE, 'a%00b')).toThrow(BadRequestException);
  });

  it('rejects sibling-prefix confusion', () => {
    const sibling = BASE + '-evil';
    expect(sibling.startsWith(BASE)).toBe(true);
    expect(() => resolveWithin(BASE, '../hello-world-evil')).toThrow(
      BadRequestException,
    );
  });

  it('does not leak the absolute base in the message', () => {
    try {
      resolveWithin(BASE, '../../secret');
      fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain('/tmp/whycode-test');
    }
  });
});

describe('isSafeRelativePath', () => {
  it('accepts plain relative paths', () => {
    expect(isSafeRelativePath('src/auth')).toBe(true);
  });

  it('rejects dot-dot segments and null bytes', () => {
    expect(isSafeRelativePath('../x')).toBe(false);
    expect(isSafeRelativePath('a/b/../c')).toBe(false);
    expect(isSafeRelativePath('a\0b')).toBe(false);
  });
});
