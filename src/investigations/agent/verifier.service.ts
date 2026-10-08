import { Injectable } from '@nestjs/common';
import type { EvidenceGrade } from '@prisma/client';
import type { ClaimGrade, TerminalStatus } from '../contracts';
import { EvidenceBundle } from '../dto/evidence.dto';

export const MIN_ANSWER_CHARS = 300;
export const MIN_GROUNDED_SOURCES = 2;

const COMMIT_CITE_RE = /\[commit:([0-9a-f]{4,40})\]/gi;
const PR_CITE_RE = /\[PR #(\d+)\]/g;
const FILE_CITE_RE = /\[([^:\]\n]+):\d+\]/g;

const QUOTE_WINDOW = 30;
const QUOTE_STEP = 15;
const MIN_QUOTE_CHARS = 10;

export type KnownRefs = {
  shas: string[];
  files: string[];
  prs: number[];
};

export type Verification = {
  status: TerminalStatus;
  reasons: string[];
};

// Everything the loop has shown the model: SHAs (lowercased), file paths,
// and PR numbers harvested from the bundle. Tool outputs extend this at
// runtime via harvestRefs — a citation the model could not have seen is
// fabrication, not evidence.
export function collectKnownRefs(bundle: EvidenceBundle): KnownRefs {
  const shas = new Set<string>();
  const files = new Set<string>();
  const prs = new Set<number>();
  for (const c of bundle.commits) shas.add(c.sha.toLowerCase());
  for (const d of bundle.diffs) {
    shas.add(d.sha.toLowerCase());
    files.add(d.file);
  }
  for (const p of bundle.prs) prs.add(p.number);
  for (const c of bundle.code) files.add(c.file);
  return { shas: [...shas], files: [...files], prs: [...prs] };
}

export type Citations = {
  shas: string[];
  prs: number[];
  files: string[];
};

export function extractCitations(answer: string): Citations {
  const shas = [...answer.matchAll(COMMIT_CITE_RE)].map((m) =>
    (m[1] ?? '').toLowerCase(),
  );
  const prs = [...answer.matchAll(PR_CITE_RE)]
    .map((m) => parseInt(m[1] ?? '', 10))
    .filter((n) => Number.isSafeInteger(n));
  const stripped = answer.replace(COMMIT_CITE_RE, '').replace(PR_CITE_RE, '');
  const files = [...stripped.matchAll(FILE_CITE_RE)].map((m) =>
    (m[1] ?? '').trim(),
  );
  return { shas, prs, files };
}

// Tool outputs are raw JSON, not citation-shaped — harvest bare identifiers
// so legitimate tool-derived citations verify.
export function harvestRefs(text: string, known: KnownRefs): void {
  for (const m of text.matchAll(/\b[0-9a-f]{40}\b/gi)) {
    const sha = (m[0] ?? '').toLowerCase();
    if (!known.shas.includes(sha)) known.shas.push(sha);
  }
  for (const m of text.matchAll(/"number"\s*:\s*(\d+)/g)) {
    const n = parseInt(m[1] ?? '', 10);
    if (Number.isSafeInteger(n) && !known.prs.includes(n)) known.prs.push(n);
  }
}

export function verifyAnswer(
  answer: string,
  known: KnownRefs,
  shown: string[],
): Verification {
  const reasons: string[] = [];
  const cites = extractCitations(answer);
  const grounded = new Set<string>();
  const loweredShown = shown.map((t) => t.toLowerCase());
  let fabricated = false;

  for (const sha of new Set(cites.shas)) {
    const ok =
      known.shas.some((s) => s.startsWith(sha)) ||
      loweredShown.some((t) => t.includes(sha));
    if (ok) grounded.add(`sha:${sha}`);
    else {
      fabricated = true;
      reasons.push(`unknown commit [commit:${sha}]`);
    }
  }
  for (const n of new Set(cites.prs)) {
    const ok =
      known.prs.includes(n) || loweredShown.some((t) => t.includes(`#${n}`));
    if (ok) grounded.add(`pr:${n}`);
    else {
      fabricated = true;
      reasons.push(`unknown PR [PR #${n}]`);
    }
  }
  for (const f of new Set(cites.files)) {
    const fl = f.toLowerCase();
    const ok =
      known.files.some((k) => k === f || k.toLowerCase() === fl) ||
      loweredShown.some((t) => t.includes(fl));
    if (ok) grounded.add(`file:${fl}`);
    else {
      fabricated = true;
      reasons.push(`unknown file [${f}]`);
    }
  }
  if (grounded.size < MIN_GROUNDED_SOURCES) {
    reasons.push(
      `only ${grounded.size} grounded source(s), need at least ${MIN_GROUNDED_SOURCES} distinct ones`,
    );
  }
  const tooShort = answer.trim().length < MIN_ANSWER_CHARS;
  if (tooShort) {
    reasons.push(
      `answer too short (${answer.trim().length} chars, need ${MIN_ANSWER_CHARS})`,
    );
  }
  // Fabrication, nothing grounded, or stub-length answers are INSUFFICIENT;
  // a substantive answer with gaps is PARTIAL — never a passing grade.
  if (fabricated || grounded.size === 0 || tooShort) {
    return { status: 'INSUFFICIENT', reasons };
  }
  if (reasons.length === 0) return { status: 'COMPLETED', reasons };
  return { status: 'PARTIAL', reasons };
}

// Grade capping: the LLM proposes grades on contract claims; the verifier
// only ever downgrades. Quoted + cited = keep confirmed; cited = at most
// supported; uncited factual = never confirmed.
export function capClaimGrade(
  proposed: ClaimGrade,
  cited: boolean,
  quoted: boolean,
): EvidenceGrade {
  if (!cited) return proposed === 'inferred' ? 'inferred' : 'supported';
  if (quoted) return proposed;
  return proposed === 'confirmed' ? 'supported' : proposed;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// True when the answer reproduces a verbatim run of the excerpt — the only
// mechanical signal that a claim grounds in content, not pointers.
export function isQuoted(excerpt: string, answer: string): boolean {
  const hay = collapse(answer);
  const needle = collapse(excerpt);
  if (needle.length < MIN_QUOTE_CHARS) return false;
  if (needle.length <= QUOTE_WINDOW) return hay.includes(needle);
  for (let i = 0; i + QUOTE_WINDOW <= needle.length; i += QUOTE_STEP) {
    if (hay.includes(needle.slice(i, i + QUOTE_WINDOW))) return true;
  }
  return false;
}

export type GradeableItem = {
  kind: string;
  ref: string;
  excerpt: string;
};

// Keeps only items the answer actually cites (an uncited bundle row is not
// a claim), grading quoted ones confirmed and the rest supported.
export function gradeItems<T extends GradeableItem>(
  items: T[],
  answer: string,
): (T & { grade: EvidenceGrade })[] {
  const cites = extractCitations(answer);
  const shaSet = new Set(cites.shas);
  const fileSet = new Set(cites.files.map((f) => f.toLowerCase()));
  const prSet = new Set(cites.prs);
  const out: (T & { grade: EvidenceGrade })[] = [];
  for (const item of items) {
    let cited = false;
    if (item.kind === 'pr' || item.kind === 'issue') {
      const n = parseInt(item.ref.replace(/^#/, ''), 10);
      cited = Number.isSafeInteger(n) && prSet.has(n);
    } else if (item.kind === 'commit') {
      const sha = item.ref.toLowerCase();
      cited = [...shaSet].some((s) => s === sha || sha.startsWith(s));
    } else {
      // code refs look like "path:line", diff refs "sha:path" — a cited
      // file or sha prefix grounds both
      const lower = item.ref.toLowerCase();
      const lineMatch = /^(.+?):\d+$/.exec(lower);
      const filePart = lineMatch?.[1] ?? lower;
      const afterFirst = lower.includes(':')
        ? lower.slice(lower.indexOf(':') + 1)
        : lower;
      const shaPart = lower.includes(':')
        ? lower.slice(0, lower.indexOf(':'))
        : lower;
      cited =
        fileSet.has(filePart) ||
        fileSet.has(afterFirst) ||
        [...shaSet].some((s) => shaPart === s || shaPart.startsWith(s));
    }
    if (!cited) continue;
    out.push({
      ...item,
      grade: isQuoted(item.excerpt, answer) ? 'confirmed' : 'supported',
    });
  }
  return out;
}

@Injectable()
export class VerifierService {
  collectKnownRefs(bundle: EvidenceBundle): KnownRefs {
    return collectKnownRefs(bundle);
  }

  verify(answer: string, known: KnownRefs, shown: string[]): Verification {
    return verifyAnswer(answer, known, shown);
  }

  harvestRefs(text: string, known: KnownRefs): void {
    harvestRefs(text, known);
  }

  capClaimGrade(
    proposed: ClaimGrade,
    cited: boolean,
    quoted: boolean,
  ): EvidenceGrade {
    return capClaimGrade(proposed, cited, quoted);
  }

  gradeItems<T extends GradeableItem>(
    items: T[],
    answer: string,
  ): (T & { grade: EvidenceGrade })[] {
    return gradeItems(items, answer);
  }
}
