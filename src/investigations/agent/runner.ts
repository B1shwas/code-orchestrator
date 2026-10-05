import { Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { describeTools, executeTool } from './tools';
import { AgentTool, ToolContext } from './tool.types';

export const MAX_AGENT_ITERATIONS = 6;
const MAX_TOOL_OUTPUT_CHARS = 4_000;

const CITATION_RE = /\[(commit:[0-9a-f]{4,40}|PR #\d+|[^[\]]+:\d+)\]/;
const TOOL_CALL_RE = /^TOOL:\s*([a-z_]+)\s*(\{[\s\S]*\})?\s*$/m;

export type AgentVerdict = 'SUFFICIENT' | 'INSUFFICIENT';

const logger = new Logger('AgentRunner');

export function judgeAnswer(answer: string): AgentVerdict {
  return CITATION_RE.test(answer) ? 'SUFFICIENT' : 'INSUFFICIENT';
}

function clip(output: unknown): string {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  return text.length > MAX_TOOL_OUTPUT_CHARS
    ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n…[truncated]`
    : text;
}

export async function runAgentLoop(
  llm: LlmService,
  tools: AgentTool[],
  ctx: ToolContext,
  basePrompt: string,
): Promise<{ answer: string; verdict: AgentVerdict; iterations: number }> {
  let prompt =
    `${basePrompt}\n\nYou may call one tool per reply with a line like:\n` +
    `TOOL: <name> {"arg": "value"}\n\nTOOLS:\n${describeTools(tools)}\n\n` +
    `If the evidence above already answers the question, answer directly with citations instead.`;

  for (let i = 1; i <= MAX_AGENT_ITERATIONS; i++) {
    const reply = await llm.complete(prompt);
    const call = reply.match(TOOL_CALL_RE);

    if (!call) {
      const verdict = judgeAnswer(reply);
      if (verdict === 'SUFFICIENT' || i === MAX_AGENT_ITERATIONS) {
        logger.warn(`agent done iterations=${i} verdict=${verdict}`);
        return { answer: reply, verdict, iterations: i };
      }
      prompt +=
        '\n\nReminder: every factual claim needs a citation as ' +
        '[commit:<sha>], [PR #<n>], or [<file>:<line>]. Answer again with citations.';
      continue;
    }

    if (i === MAX_AGENT_ITERATIONS) {
      logger.warn(`agent done iterations=${i} verdict=INSUFFICIENT`);
      return { answer: reply, verdict: 'INSUFFICIENT', iterations: i };
    }

    const name = call[1] ?? '';
    let args: Record<string, unknown> = {};
    try {
      args = call[2] ? (JSON.parse(call[2]) as Record<string, unknown>) : {};
    } catch {
      prompt += `\n\nThat TOOL line had invalid JSON. Retry with valid JSON or answer directly.`;
      continue;
    }
    const output = await executeTool(tools, ctx, name, args);
    logger.warn(`agent tool name="${name}" iteration=${i}`);
    prompt += `\n\nTOOL RESULT (${name}):\n${clip(output)}\n\nContinue: call another tool or answer with citations.`;
  }

  throw new Error('agent loop exhausted without returning');
}
