import { Injectable } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { SymbolInfo } from './ast.types';
import { LanguageAdapter } from './language-adapter';
import { adapterFor, defaultAdapters } from './language.registry';

@Injectable()
export class AstService {
  private readonly adapters: LanguageAdapter[];
  private readonly cache = new Map<
    string,
    { mtimeMs: number; symbols: SymbolInfo[] }
  >();

  constructor(adapters: LanguageAdapter[] = defaultAdapters()) {
    this.adapters = adapters;
  }

  async getSymbolsInFile(absPath: string): Promise<SymbolInfo[]> {
    const adapter = adapterFor(this.adapters, absPath);
    if (!adapter) return [];

    const { mtimeMs } = await stat(absPath);
    const hit = this.cache.get(absPath);
    if (hit && hit.mtimeMs === mtimeMs) return hit.symbols;

    const text = await readFile(absPath, 'utf8');
    const symbols = adapter.extractSymbols(text);
    this.cache.set(absPath, { mtimeMs, symbols });
    return symbols;
  }

  async findSymbol(absPath: string, name: string): Promise<SymbolInfo | null> {
    const symbols = await this.getSymbolsInFile(absPath);
    return symbols.find((s) => s.name === name) ?? null;
  }

  async getEnclosingSymbol(
    absPath: string,
    line: number,
  ): Promise<SymbolInfo | null> {
    const symbols = await this.getSymbolsInFile(absPath);
    const containing = symbols.filter(
      (s) => s.startLine <= line && line <= s.endLine,
    );
    if (containing.length === 0) return null;
    containing.sort(
      (a, b) => a.endLine - a.startLine - (b.endLine - b.startLine),
    );
    return containing[0] ?? null;
  }
}
