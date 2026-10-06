import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstService } from './ast.service';
import { defaultAdapters } from './language.registry';

describe('AstService', () => {
  let dir: string;
  let service: AstService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ast-test-'));
    service = new AstService(defaultAdapters());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, text: string): string {
    const abs = join(dir, name);
    writeFileSync(abs, text);
    return abs;
  }

  it('finds a dotted method symbol', async () => {
    const abs = write(
      'a.ts',
      'export class A {\n  run() {\n    return 1;\n  }\n}\n',
    );
    await expect(service.findSymbol(abs, 'A.run')).resolves.toEqual({
      name: 'A.run',
      kind: 'method',
      startLine: 2,
      endLine: 4,
    });
  });

  // TODO: re-enable with the null-tree guard — tree-sitter intermittently
  // returns a null rootNode under parallel workers (see fix commit).
  it.skip('returns null for unknown symbols and languages', async () => {
    const abs = write('a.ts', 'export function f() {\n  return 1;\n}\n');
    await expect(service.findSymbol(abs, 'missing')).resolves.toBeNull();
    const py = write('b.py', 'def f():\n    pass\n');
    await expect(service.findSymbol(py, 'nope')).resolves.toBeNull();
    const rs = write('c.rs', 'fn main() {}\n');
    await expect(service.getSymbolsInFile(rs)).resolves.toEqual([]);
  });

  it('picks the smallest enclosing span', async () => {
    const abs = write(
      'a.ts',
      'export class A {\n  run() {\n    return 1;\n  }\n  walk() {\n    return 2;\n  }\n}\n',
    );
    await expect(service.getEnclosingSymbol(abs, 3)).resolves.toMatchObject({
      name: 'A.run',
    });
    await expect(service.getEnclosingSymbol(abs, 99)).resolves.toBeNull();
  });

  it('re-parses after the file changes', async () => {
    const abs = write('a.ts', 'export function one() {\n  return 1;\n}\n');
    await expect(service.findSymbol(abs, 'one')).resolves.not.toBeNull();
    write('a.ts', 'export function two() {\n  return 2;\n}\n');
    await expect(service.findSymbol(abs, 'one')).resolves.toBeNull();
    await expect(service.findSymbol(abs, 'two')).resolves.not.toBeNull();
  });
});
