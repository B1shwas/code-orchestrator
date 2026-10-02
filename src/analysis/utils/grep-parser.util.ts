import { SearchMatchDto } from '../dto/search-match.dto';

export function parseGrepLine(line: string): SearchMatchDto | null {
  const first = line.indexOf(':');
  if (first === -1) return null;
  const second = line.indexOf(':', first + 1);
  if (second === -1) return null;
  const third = line.indexOf(':', second + 1);
  if (third === -1) return null;

  const file = line.slice(0, first);
  const lineNo = Number(line.slice(first + 1, second));
  const colNo = Number(line.slice(second + 1, third));
  if (!file || !Number.isInteger(lineNo) || !Number.isInteger(colNo)) {
    return null;
  }
  return {
    file,
    line: lineNo,
    column: colNo,
    preview: line.slice(third + 1),
  };
}

export function parseGrepOutput(
  output: string,
  limit: number,
): SearchMatchDto[] {
  const matches: SearchMatchDto[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const match = parseGrepLine(line);
    if (match) matches.push(match);
    if (matches.length >= limit) break;
  }
  return matches;
}
