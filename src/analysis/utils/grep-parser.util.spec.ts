import { parseGrepLine, parseGrepOutput } from './grep-parser.util';

describe('parseGrepLine', () => {
  it('parses file:line:column:preview', () => {
    expect(
      parseGrepLine('src/auth/auth.service.ts:42:10:  async login('),
    ).toEqual({
      file: 'src/auth/auth.service.ts',
      line: 42,
      column: 10,
      preview: '  async login(',
    });
  });

  it('keeps colons inside the preview', () => {
    expect(parseGrepLine('src/a.ts:1:5:const x = "a:b:c";')).toEqual({
      file: 'src/a.ts',
      line: 1,
      column: 5,
      preview: 'const x = "a:b:c";',
    });
  });

  it('returns null for malformed lines', () => {
    expect(parseGrepLine('')).toBeNull();
    expect(parseGrepLine('no-colons-here')).toBeNull();
    expect(parseGrepLine('file.ts:12')).toBeNull();
    expect(parseGrepLine('file.ts:x:y:preview')).toBeNull();
    expect(parseGrepLine(':1:2:preview')).toBeNull();
  });
});

describe('parseGrepOutput', () => {
  it('skips blank and malformed lines', () => {
    const out = 'a.ts:1:1:foo\n\ngarbage\nb.ts:2:3:bar\n';
    expect(parseGrepOutput(out, 10)).toEqual([
      { file: 'a.ts', line: 1, column: 1, preview: 'foo' },
      { file: 'b.ts', line: 2, column: 3, preview: 'bar' },
    ]);
  });

  it('stops at the limit', () => {
    const out = 'a.ts:1:1:x\nb.ts:2:2:y\nc.ts:3:3:z\n';
    const result = parseGrepOutput(out, 2);
    expect(result).toHaveLength(2);
    expect(result[1]?.file).toBe('b.ts');
  });
});
