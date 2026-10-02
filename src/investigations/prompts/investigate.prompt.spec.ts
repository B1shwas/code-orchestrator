import { EvidenceBundle } from '../dto/evidence.dto';
import { buildInvestigationPrompt } from './investigate.prompt';

const bundle: EvidenceBundle = {
  code: [
    {
      file: 'src/pay.ts',
      startLine: 38,
      endLine: 95,
      content: 'async retry() {}',
      symbol: 'Repo.retry',
    },
  ],
  commits: [{ sha: '8a91f2', message: 'fix retries', author: 'a', date: 'd' }],
  diffs: [{ sha: '8a91f2', file: 'src/pay.ts', patch: '@@ loop' }],
  prs: [{ number: 142, title: 'fix', body: 'Fixes #141' }],
  issues: [{ number: 141, title: 'dupes', body: 'provider 503s' }],
  historyNote: null,
};

describe('buildInvestigationPrompt', () => {
  it('includes all sections in order with citations rules', () => {
    const prompt = buildInvestigationPrompt('why retry twice?', bundle);

    for (const section of [
      'QUESTION:',
      '## CODE',
      '## COMMITS',
      '## DIFFS',
      '## PULL REQUESTS',
      '## ISSUES',
    ]) {
      expect(prompt).toContain(section);
    }
    expect(prompt.indexOf('## CODE')).toBeLessThan(
      prompt.indexOf('## COMMITS'),
    );
    expect(prompt).toContain('[commit:<short-sha>]');
    expect(prompt).toContain('why retry twice?');
  });

  it('omits empty sections and surfaces the history note', () => {
    const prompt = buildInvestigationPrompt('q', {
      code: [],
      commits: [],
      diffs: [],
      prs: [],
      issues: [],
      historyNote: 'No relevant commits found in file history.',
    });

    expect(prompt).not.toContain('## CODE');
    expect(prompt).not.toContain('## COMMITS');
    expect(prompt).toContain('HISTORY NOTE');
    expect(prompt).toContain('No relevant commits found');
  });

  it('stays under the char cap', () => {
    const big = buildInvestigationPrompt('q', {
      ...bundle,
      code: [
        {
          file: 'big.ts',
          startLine: 1,
          endLine: 2,
          content: 'x'.repeat(100_000),
          symbol: null,
        },
      ],
    });
    expect(big.length).toBeLessThanOrEqual(30_000);
  });
});
