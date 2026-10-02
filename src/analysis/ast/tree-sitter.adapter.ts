import Parser, { Language, Query, SyntaxNode } from 'tree-sitter';
import { SymbolInfo, SymbolKind } from './ast.types';
import { LanguageAdapter } from './language-adapter';

export type TreeSitterLangConfig = {
  id: string;
  extensions: RegExp;
  language: Language;
  queries: string;
  methodName?: (node: SyntaxNode, name: string) => string;
};

export class TreeSitterAdapter implements LanguageAdapter {
  readonly id: string;
  private readonly extensions: RegExp;
  private readonly parser: Parser;
  private readonly query: Query;
  private readonly methodName?: (node: SyntaxNode, name: string) => string;

  constructor(config: TreeSitterLangConfig) {
    this.id = config.id;
    this.extensions = config.extensions;
    this.methodName = config.methodName;
    this.parser = new Parser();
    this.parser.setLanguage(config.language);
    // compiled once here — query compilation is the slow part
    this.query = new Parser.Query(config.language, config.queries);
  }

  canHandle(filePath: string): boolean {
    return this.extensions.test(filePath);
  }

  extractSymbols(text: string): SymbolInfo[] {
    const tree = this.parser.parse(text);
    const out: SymbolInfo[] = [];
    for (const capture of this.query.captures(tree.rootNode)) {
      // queries capture the node only (@class/@method/...); the name
      // is read from the `name` field below, extra captures are skipped.
      if (
        !['class', 'method', 'function', 'interface'].includes(capture.name)
      ) {
        continue;
      }
      const info = this.toSymbol(capture.node, capture.name as SymbolKind);
      if (info) out.push(info);
    }
    return out;
  }

  private toSymbol(node: SyntaxNode, capture: SymbolKind): SymbolInfo | null {
    const name = node.childForFieldName('name')?.text;
    if (!name) return null;
    // tree-sitter rows are 0-based; our contract is 1-based
    const lines = {
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
    if (capture === 'method') {
      return { name: this.resolveMethod(node, name), kind: 'method', ...lines };
    }
    if (capture === 'function') {
      // grammars without a method node (e.g. Python) nest defs in classes —
      // a def with an enclosing class IS a method.
      const dotted = this.resolveMethod(node, name);
      if (dotted !== name) return { name: dotted, kind: 'method', ...lines };
    }
    return { name, kind: capture, ...lines };
  }

  private resolveMethod(node: SyntaxNode, name: string): string {
    if (this.methodName) return this.methodName(node, name);
    let parent: SyntaxNode | null = node.parent;
    while (parent) {
      if (
        parent.type === 'class_definition' ||
        parent.type === 'class_declaration'
      ) {
        const className = parent.childForFieldName('name')?.text;
        if (className) return `${className}.${name}`;
      }
      parent = parent.parent;
    }
    return name;
  }
}
