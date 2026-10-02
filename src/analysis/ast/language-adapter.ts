import { SymbolInfo } from './ast.types';

export interface LanguageAdapter {
  readonly id: string;
  canHandle(filePath: string): boolean;
  extractSymbols(text: string): SymbolInfo[];
}
