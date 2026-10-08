import { LlmService } from '../../llm/llm.service';
import { runAgentLoop } from './runner';
import { AgentTool, ToolContext } from './tool.types';
import { KnownRefs } from './verifier.service';

const ctx: ToolContext = { userId: 'u1', repositoryId: 'r1' };
const tools: AgentTool[] = [
  {
    name: 'search_code',
    description: 'search',
    parameters: { query: { type: 'string', required: true, description: 'q' } },
    execute: (_ctx, args) => Promise.resolve([`hit for ${String(args.query)}`]),
  },
];

function fakeLlm(replies: string[]): {
  service: LlmService;
  complete: jest.Mock<Promise<string>, [string]>;
} {
  const complete = jest.fn<Promise<string>, [string]>(() =>
    Promise.resolve(replies.shift() ?? ''),
  );
  return { service: { complete }, complete };
}

const FULL_SHA = '8a91f2'.padEnd(40, '0');
const KNOWN: KnownRefs = {
  shas: [FULL_SHA],
  files: ['src/pay.ts'],
  prs: [142],
};
const EMPTY_KNOWN: KnownRefs = { shas: [], files: [], prs: [] };

function padded(text: string): string {
  return `${text} ${'grounding detail. '.repeat(20)}`;
}

const GOLDEN = padded(
  'Summary: retries are capped. How it works: the loop at [src/pay.ts:38] stops after two tries, introduced in [commit:8a91f2]. Evidence mapping: code shows the cap, the commit message records the motive. Limits: unknown whether backoff applies.',
);

describe('runAgentLoop', () => {
  it('returns a verified answer immediately', async () => {
    const { service } = fakeLlm([GOLDEN]);
    const r = await runAgentLoop(service, tools, ctx, 'Q', KNOWN);
    expect(r).toMatchObject({ status: 'COMPLETED', iterations: 1 });
  });

  it('executes a requested tool then answers', async () => {
    const { service, complete } = fakeLlm([
      'TOOL: search_code {"query": "retry"}',
      GOLDEN,
    ]);
    const r = await runAgentLoop(service, tools, ctx, 'Q', KNOWN);
    expect(r.iterations).toBe(2);
    expect(r.status).toBe('COMPLETED');
    expect(complete).toHaveBeenCalledTimes(2);
    const secondPrompt = String(complete.mock.calls[1]?.[0] ?? '');
    expect(secondPrompt).toContain('hit for retry');
  });

  it('exhausts budget instead of looping forever', async () => {
    const { service, complete } = fakeLlm(
      Array<string>(10).fill('TOOL: search_code {"query": "x"}'),
    );
    const r = await runAgentLoop(service, tools, ctx, 'Q', EMPTY_KNOWN);
    expect(r).toMatchObject({ status: 'INSUFFICIENT', iterations: 6 });
    expect(complete).toHaveBeenCalledTimes(6);
  });

  it('re-prompts once on a thin answer', async () => {
    const { service } = fakeLlm(['maybe the retry logic', GOLDEN]);
    const r = await runAgentLoop(service, tools, ctx, 'Q', KNOWN);
    expect(r).toMatchObject({ status: 'COMPLETED', iterations: 2 });
  });

  it('gives up after one reminder instead of burning the budget', async () => {
    const { service, complete } = fakeLlm([
      'maybe the retry logic',
      'still vague, no citations here',
    ]);
    const r = await runAgentLoop(service, tools, ctx, 'Q', KNOWN);
    expect(r).toMatchObject({ status: 'INSUFFICIENT', iterations: 2 });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
