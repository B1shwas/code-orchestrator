export type SymbolKind = 'class' | 'interface' | 'function' | 'method' | 'enum';

export type SymbolInfo = {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
};
