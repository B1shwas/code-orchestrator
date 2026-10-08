import { Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import type { TerminalStatus } from '../contracts';
import { describeTools, executeTool } from './tools';
import { AgentTool, ToolContext } from './tool.types';
import { harvestRefs, KnownRefs, verifyAnswer } from './verifier.service';

export const MAX_AGENT_ITERATIONS = 6;
const MAX_TOOL_OUTPUT_CHARS = 4_000;

const TOOL_CALL_RE = /^TOOL:\s*([a-z_]+)\s*(\{[\s\S]*\})?\s*$/m;

const logger = new Logger('AgentRunner');

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
  known: KnownRefs,
): Promise<{
  answer: string;
  status: TerminalStatus;
  iterations: number;
}> {
  let prompt =
    `${basePrompt}\n\nYou may call one tool per reply with a line like:\n` +
    `TOOL: <name> {"arg": "value"}\n\nTOOLS:\n${describeTools(tools)}\n\n` +
    `If the evidence above already answers the question, answer directly with citations instead.`;
  const shown: string[] = [basePrompt];
  let reminded = false;

  for (let i = 1; i <= MAX_AGENT_ITERATIONS; i++) {
    const reply = await llm.complete(prompt);
    const call = reply.match(TOOL_CALL_RE);

    if (!call) {
      const check = verifyAnswer(reply, known, shown);
      if (check.status === 'COMPLETED') {
        logger.warn(`agent done iterations=${i} status=COMPLETED`);
        return { answer: reply, status: 'COMPLETED', iterations: i };
      }
      if (reminded || i === MAX_AGENT_ITERATIONS) {
        logger.warn(
          `agent done iterations=${i} status=${check.status} reasons="${check.reasons.join('; ')}"`,
        );
        return { answer: reply, status: check.status, iterations: i };
      }
      reminded = true;
      prompt +=
        `\n\nYour answer needs work: ${check.reasons.join('; ')}. ` +
        `Revise with the required structure and only grounded citations, or call a tool for more evidence.`;
      continue;
    }

    if (i === MAX_AGENT_ITERATIONS) {
      logger.warn(`agent done iterations=${i} status=INSUFFICIENT`);
      return { answer: reply, status: 'INSUFFICIENT', iterations: i };
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
    const clipped = clip(output);
    shown.push(clipped);
    harvestRefs(clipped, known);
    prompt += `\n\nTOOL RESULT (${name}):\n${clipped}\n\nContinue: call another tool or answer with citations.`;
  }

  throw new Error('agent loop exhausted without returning');
}
