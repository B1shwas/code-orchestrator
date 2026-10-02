import { TsMorphAdapter } from './ts-morph.adapter';

describe('TsMorphAdapter', () => {
  const adapter = new TsMorphAdapter();

  it('handles .ts/.tsx, rejects the rest', () => {
    expect(adapter.canHandle('src/a.ts')).toBe(true);
    expect(adapter.canHandle('src/a.tsx')).toBe(true);
    expect(adapter.canHandle('src/a.py')).toBe(false);
    expect(adapter.canHandle('src/a.go')).toBe(false);
  });

  it('extracts classes with dotted methods', () => {
    const symbols = adapter.extractSymbols(
      'export class AuthService {\n  async login() {\n    return 1;\n  }\n}\n',
    );
    expect(symbols).toEqual([
      { name: 'AuthService', kind: 'class', startLine: 1, endLine: 5 },
      {
        name: 'AuthService.login',
        kind: 'method',
        startLine: 2,
        endLine: 4,
      },
    ]);
  });

  it('extracts interfaces, functions and enums', () => {
    const symbols = adapter.extractSymbols(
      'export interface Box {\n  size: number;\n}\nexport function open(box: Box) {\n  return box.size;\n}\nexport enum Role {\n  Admin,\n}\n',
    );
    expect(symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'interface:Box',
      'function:open',
      'enum:Role',
    ]);
  });

  it('returns partial results for broken syntax', () => {
    const symbols = adapter.extractSymbols(
      'export class Good {\n  run() {}\n}\nexport class Broken {\n  oops(\n',
    );
    expect(symbols.map((s) => s.name)).toContain('Good');
  });
});
