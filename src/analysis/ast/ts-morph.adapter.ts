import { Injectable } from '@nestjs/common';
import { Project } from 'ts-morph';
import { SymbolInfo, SymbolKind } from './ast.types';
import { LanguageAdapter } from './language-adapter';

const TS_EXT = /\.(m|c)?tsx?$/;

@Injectable()
export class TsMorphAdapter implements LanguageAdapter {
  readonly id = 'typescript';
  private readonly project = new Project({ useInMemoryFileSystem: true });

  canHandle(filePath: string): boolean {
    return TS_EXT.test(filePath);
  }

  extractSymbols(text: string): SymbolInfo[] {
    const source = this.project.createSourceFile('snippet.ts', text, {
      overwrite: true,
    });
    const out: SymbolInfo[] = [];
    for (const cls of source.getClasses()) {
      const name = cls.getName();
      if (!name) continue;
      out.push(this.at(name, 'class', cls));
      for (const method of cls.getMethods()) {
        const methodName = method.getName();
        if (!methodName) continue;
        out.push({
          name: `${name}.${methodName}`,
          kind: 'method',
          startLine: method.getStartLineNumber(),
          endLine: method.getEndLineNumber(),
        });
      }
    }
    for (const iface of source.getInterfaces()) {
      const name = iface.getName();
      if (name) out.push(this.at(name, 'interface', iface));
    }
    for (const fn of source.getFunctions()) {
      const name = fn.getName();
      if (name) out.push(this.at(name, 'function', fn));
    }
    for (const en of source.getEnums()) {
      const name = en.getName();
      if (name) out.push(this.at(name, 'enum', en));
    }
    return out;
  }

  private at(
    name: string,
    kind: SymbolKind,
    node: { getStartLineNumber(): number; getEndLineNumber(): number },
  ): SymbolInfo {
    return {
      name,
      kind,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
    };
  }
}
