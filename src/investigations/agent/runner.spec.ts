import { LlmService } from '../../llm/llm.service';
import { judgeAnswer, runAgentLoop } from './runner';
import { AgentTool, ToolContext } from './tool.types';

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

describe('judgeAnswer', () => {
  it('accepts each citation shape', () => {
    expect(judgeAnswer('fixed in [commit:abc1234]')).toBe('SUFFICIENT');
    expect(judgeAnswer('see [PR #42]')).toBe('SUFFICIENT');
    expect(judgeAnswer('at [src/pay.ts:38]')).toBe('SUFFICIENT');
    expect(judgeAnswer('probably the retry logic')).toBe('INSUFFICIENT');
  });
});

describe('runAgentLoop', () => {
  it('returns a cited answer immediately', async () => {
    const { service } = fakeLlm(['done in [commit:abc1234]']);
    const r = await runAgentLoop(service, tools, ctx, 'Q');
    expect(r).toMatchObject({ verdict: 'SUFFICIENT', iterations: 1 });
  });

  it('executes a requested tool then answers', async () => {
    const { service, complete } = fakeLlm([
      'TOOL: search_code {"query": "retry"}',
      'found it in [src/pay.ts:38]',
    ]);
    const r = await runAgentLoop(service, tools, ctx, 'Q');
    expect(r.iterations).toBe(2);
    expect(complete).toHaveBeenCalledTimes(2);
    const secondPrompt = String(complete.mock.calls[1]?.[0] ?? '');
    expect(secondPrompt).toContain('hit for retry');
  });

  it('exhausts budget instead of looping forever', async () => {
    const { service, complete } = fakeLlm(
      Array<string>(10).fill('TOOL: search_code {"query": "x"}'),
    );
    const r = await runAgentLoop(service, tools, ctx, 'Q');
    expect(r).toMatchObject({ verdict: 'INSUFFICIENT', iterations: 6 });
    expect(complete).toHaveBeenCalledTimes(6);
  });

  it('re-prompts once on an uncited answer', async () => {
    const { service } = fakeLlm([
      'maybe the retry logic',
      'it is retry in [src/pay.ts:38]',
    ]);
    const r = await runAgentLoop(service, tools, ctx, 'Q');
    expect(r).toMatchObject({ verdict: 'SUFFICIENT', iterations: 2 });
  });
});
