import Go from 'tree-sitter-go';
import Java from 'tree-sitter-java';
import Python from 'tree-sitter-python';
import type { SyntaxNode } from 'tree-sitter';
import { LanguageAdapter } from './language-adapter';
import { TreeSitterAdapter } from './tree-sitter.adapter';
import { TsMorphAdapter } from './ts-morph.adapter';

const PYTHON_QUERIES = `
  (class_definition) @class
  (function_definition) @function
`;

const JAVA_QUERIES = `
  (class_declaration) @class
  (interface_declaration) @interface
  (method_declaration) @method
  (constructor_declaration) @method
`;

const GO_QUERIES = `
  (function_declaration) @function
  (method_declaration) @method
`;

// NOTE: tree-sitter-dart's npm binding does not export a usable language
// object for node-tree-sitter (verified at install time). Dart stays on the
// text fallback until the grammar ships a compatible binding. Adding it later
// means one entry here plus a fixture spec — no redesign.

function goMethodName(node: SyntaxNode, name: string): string {
  // receiver looks like "(s S)" or "(s *pkg.Type)" — the type is last
  const receiver = node.childForFieldName('receiver')?.text ?? '';
  const type = receiver
    .replace(/[()]/g, '')
    .trim()
    .split(/\s+/)
    .pop()
    ?.replace(/^\*/, '');
  return type ? `${type}.${name}` : name;
}

export function defaultAdapters(): LanguageAdapter[] {
  return [
    new TsMorphAdapter(),
    new TreeSitterAdapter({
      id: 'python',
      extensions: /\.py$/,
      language: Python,
      queries: PYTHON_QUERIES,
    }),
    new TreeSitterAdapter({
      id: 'java',
      extensions: /\.java$/,
      language: Java,
      queries: JAVA_QUERIES,
    }),
    new TreeSitterAdapter({
      id: 'go',
      extensions: /\.go$/,
      language: Go,
      queries: GO_QUERIES,
      methodName: goMethodName,
    }),
  ];
}

export function adapterFor(
  adapters: LanguageAdapter[],
  filePath: string,
): LanguageAdapter | null {
  return adapters.find((a) => a.canHandle(filePath)) ?? null;
}
