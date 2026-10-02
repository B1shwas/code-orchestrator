import { BadRequestException } from '@nestjs/common';
import { resolve, sep } from 'node:path';

/* 
checking the path is safe to serve or not 
- base -> allowed dir to search
- path -> the path inside the dir 
but attackers can use path as ../../../etc/pwd to go outside the dir and get the secrets
so, this resolveWithin function scans if the requested path is safe to serve to the user or not
*/
export function resolveWithin(base: string, userPath: string) {
  // trim the user path first to delete whitespaces and starting /
  const trimmed = userPath.trim().replace(/^\/+/, '');
  if (trimmed.includes('\0')) throw new BadRequestException('Invalid path');

  let decoded = trimmed;

  /* so, the url needs to be decoded because %2 , E such format can be converted into . , / . so attacker can use decoded format to access blocked files

  - after decoding as well check /0
  - resolve the base for absolute path 
  - if resolved doesn't starts with baseResolved + sep(seperator /) then throw eror because 
  - baseResolved will be -> /tmp/data/repo/b1shwas/repo something like that 
  - resolved will be baseResolved + decoded that means -> /....../repo/src/auth.ts 
  - so, if path doesn't start with the baseResolved, we throw the error
  */

  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    throw new BadRequestException('Invalid path encoding ');
  }

  if (decoded.includes('\0')) {
    throw new BadRequestException('Invalid path');
  }
  const baseResolved = resolve(base);
  if (decoded === '') return baseResolved;

  const resolved = resolve(baseResolved, decoded);

  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + sep)) {
    throw new BadRequestException('Path escapes repository');
  }
  return resolved;
}

// spliting the url and checking .. (outside) , if it contains , then , return false
export function isSafeRelativePath(userPath: string): boolean {
  const trimmed = userPath.trim();
  if (trimmed.includes('\0')) return false;
  try {
    const decoded = decodeURIComponent(trimmed.replace(/^\/+/, ''));
    if (decoded.includes('\0')) return false;
    const segments = decoded.split('/').filter((s) => s.length > 0);
    return !segments.includes('..');
  } catch {
    return false;
  }
}
