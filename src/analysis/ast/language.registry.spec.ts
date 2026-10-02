import { adapterFor, defaultAdapters } from './language.registry';

describe('language registry', () => {
  const adapters = defaultAdapters();

  it('routes by extension, unknown falls through', () => {
    expect(adapterFor(adapters, 'a.ts')?.id).toBe('typescript');
    expect(adapterFor(adapters, 'a.py')?.id).toBe('python');
    expect(adapterFor(adapters, 'a.java')?.id).toBe('java');
    expect(adapterFor(adapters, 'a.go')?.id).toBe('go');
    expect(adapterFor(adapters, 'a.dart')).toBeNull();
    expect(adapterFor(adapters, 'a.rs')).toBeNull();
  });

  it('extracts python class with dotted method', () => {
    const adapter = adapterFor(adapters, 'x.py');
    const symbols = adapter!.extractSymbols(
      'class Repo:\n    def connect(self):\n        pass\n\ndef top():\n    pass\n',
    );
    expect(symbols).toEqual([
      { name: 'Repo', kind: 'class', startLine: 1, endLine: 3 },
      { name: 'Repo.connect', kind: 'method', startLine: 2, endLine: 3 },
      { name: 'top', kind: 'function', startLine: 5, endLine: 6 },
    ]);
  });

  it('extracts java class, method and interface', () => {
    const adapter = adapterFor(adapters, 'A.java');
    const symbols = adapter!.extractSymbols(
      'class A {\n  void f() {}\n}\ninterface I {\n  void m();\n}\n',
    );
    expect(symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'class:A',
      'method:A.f',
      'interface:I',
      'method:m',
    ]);
  });

  it('extracts go functions with receiver-qualified methods', () => {
    const adapter = adapterFor(adapters, 'x.go');
    const symbols = adapter!.extractSymbols(
      'package p\n\nfunc Add(a int) int {\n  return a\n}\n\ntype S struct{}\n\nfunc (s S) Get() int {\n  return 0\n}\n',
    );
    expect(symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'function:Add',
      'method:S.Get',
    ]);
  });
});
