import type { EvidenceGrade } from '@prisma/client';
import type { ClaimGrade } from '../contracts';
import { EvidenceBundle } from '../dto/evidence.dto';
import {
  capClaimGrade,
  collectKnownRefs,
  extractCitations,
  gradeItems,
  harvestRefs,
  isQuoted,
  KnownRefs,
  verifyAnswer,
} from './verifier.service';

const FULL_SHA = '8a91f2'.padEnd(40, '0');
const KNOWN: KnownRefs = {
  shas: [FULL_SHA],
  files: ['src/pay.ts'],
  prs: [142],
};

function padded(text: string): string {
  return `${text} ${'grounding detail. '.repeat(20)}`;
}

const GOLDEN = padded(
  'Summary: retries are capped. How it works: the loop at [src/pay.ts:38] stops after two tries, introduced in [commit:8a91f2]. Evidence mapping: code shows the cap, the commit message records the motive. Limits: unknown whether backoff applies.',
);

describe('collectKnownRefs', () => {
  it('indexes shas, files, and PR numbers from the bundle', () => {
    const bundle: EvidenceBundle = {
      code: [
        {
          file: 'src/pay.ts',
          startLine: 38,
          endLine: 95,
          content: 'x',
          symbol: null,
        },
      ],
      commits: [{ sha: FULL_SHA, message: 'm', author: null, date: null }],
      diffs: [{ sha: FULL_SHA, file: 'src/pay.ts', patch: '@@' }],
      prs: [{ number: 142, title: 't', body: null }],
      issues: [],
      historyNote: null,
    };
    expect(collectKnownRefs(bundle)).toEqual({
      shas: [FULL_SHA],
      files: ['src/pay.ts'],
      prs: [142],
    });
  });
});

describe('extractCitations', () => {
  it('separates commit, PR, and file citations', () => {
    expect(
      extractCitations('did [commit:8a91f2] via [PR #142] at [src/pay.ts:38]'),
    ).toEqual({ shas: ['8a91f2'], prs: [142], files: ['src/pay.ts'] });
  });
});

describe('verifyAnswer', () => {
  it('completes a long answer grounded in two known sources', () => {
    const check = verifyAnswer(GOLDEN, KNOWN, ['Q']);
    expect(check.status).toBe('COMPLETED');
    expect(check.reasons).toEqual([]);
  });

  it('fails fabricated commit SHAs even beside real citations', () => {
    const check = verifyAnswer(
      padded(
        'It was done in [commit:034ad6f] as seen at [src/pay.ts:38] with more text here.',
      ),
      KNOWN,
      ['Q'],
    );
    expect(check.status).toBe('INSUFFICIENT');
    expect(check.reasons.some((r) => r.includes('unknown commit'))).toBe(true);
  });

  it('fails thin single-source answers', () => {
    const check = verifyAnswer('fixed [commit:8a91f2]', KNOWN, ['Q']);
    expect(check.status).toBe('INSUFFICIENT');
    expect(check.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('partials a long single-source answer', () => {
    const check = verifyAnswer(
      padded('Everything lives at [src/pay.ts:38] and nowhere else at all.'),
      KNOWN,
      ['Q'],
    );
    expect(check.status).toBe('PARTIAL');
  });

  it('accepts short SHAs that prefix-match known commits', () => {
    const check = verifyAnswer(
      padded(
        'Capped at [src/pay.ts:38] per [commit:8a91f20000] with further explanation attached.',
      ),
      KNOWN,
      ['Q'],
    );
    expect(check.status).toBe('COMPLETED');
  });
});

describe('harvestRefs', () => {
  it('loads tool-output identifiers into known refs', () => {
    const known: KnownRefs = { shas: [], files: [], prs: [] };
    harvestRefs(
      JSON.stringify({ history: [{ sha: FULL_SHA }], found: { number: 7 } }),
      known,
    );
    expect(known.shas).toEqual([FULL_SHA]);
    expect(known.prs).toEqual([7]);
  });
});

describe('capClaimGrade', () => {
  it.each<[ClaimGrade, boolean, boolean, EvidenceGrade]>([
    ['confirmed', true, true, 'confirmed'],
    ['confirmed', true, false, 'supported'],
    ['supported', true, false, 'supported'],
    ['confirmed', false, false, 'supported'],
    ['inferred', false, false, 'inferred'],
    ['inferred', true, true, 'inferred'],
  ])(
    'proposed=%s cited=%s quoted=%s -> %s',
    (proposed, cited, quoted, expected) => {
      expect(capClaimGrade(proposed, cited, quoted)).toBe(expected);
    },
  );
});

describe('isQuoted', () => {
  it('detects verbatim runs and rejects pointers', () => {
    expect(
      isQuoted(
        'async retryPayment() { return 2; }',
        `code: async retryPayment() { return 2; } end`,
      ),
    ).toBe(true);
    expect(
      isQuoted('async retryPayment() { return 2; }', 'see [src/pay.ts:38]'),
    ).toBe(false);
    expect(isQuoted('@@', 'contains @@ here')).toBe(false);
  });
});

describe('gradeItems', () => {
  const items = [
    {
      kind: 'code',
      ref: 'src/pay.ts:38',
      excerpt: 'async retryPayment() { return 2; }',
    },
    { kind: 'commit', ref: FULL_SHA, excerpt: 'fix: cap retries at 2' },
    { kind: 'diff', ref: `${FULL_SHA}:src/pay.ts`, excerpt: '@@ -1,4 +1,4 @@' },
    { kind: 'pr', ref: '#142', excerpt: 'Retry cap' },
    { kind: 'issue', ref: '#99', excerpt: 'outage report' },
  ];

  it('keeps cited items, confirms quoted ones, drops the rest', () => {
    const answer = padded(
      'The loop async retryPayment() { return 2; } came from fix: cap retries at 2, see [src/pay.ts:38] and [commit:8a91f2] plus patch @@ -1,4 +1,4 @@ applied.',
    );
    const graded = gradeItems(items, answer);
    expect(graded.map((g) => g.ref)).toEqual([
      'src/pay.ts:38',
      FULL_SHA,
      `${FULL_SHA}:src/pay.ts`,
    ]);
    expect(graded.every((g) => g.grade === 'confirmed')).toBe(true);
  });

  it('marks cited-but-unquoted items supported', () => {
    const answer = padded('It lives at [src/pay.ts:38] per [commit:8a91f2].');
    const graded = gradeItems(items, answer);
    expect(graded.map((g) => g.grade)).toEqual([
      'supported',
      'supported',
      'supported',
    ]);
  });
});
