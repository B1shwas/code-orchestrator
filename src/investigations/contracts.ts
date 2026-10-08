import { z } from 'zod';

// Answer contracts for the two investigation modes. The LLM must return
// JSON matching one of these shapes; the verifier (Phase 1.4) enforces
// both the shape (here) and the truth of the citations (there).

export const ClaimGradeSchema = z.enum(['confirmed', 'supported', 'inferred']);
export type ClaimGrade = z.infer<typeof ClaimGradeSchema>;

export const TerminalStatusSchema = z.enum([
  'COMPLETED',
  'PARTIAL',
  'INSUFFICIENT',
]);
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>;

const CitationSchema = z
  .string()
  .min(1)
  .describe(
    'A citation like [commit:<sha>], [PR #<n>], or [<file>:<line>] — must resolve against retrieved evidence',
  );

export const CausalClaimSchema = z.object({
  claim: z.string().min(1),
  evidence: z.array(CitationSchema).min(1),
  grade: ClaimGradeSchema,
});

export const TimelineEventSchema = z.object({
  at: z.string().min(1),
  event: z.string().min(1),
  ref: CitationSchema,
});

export const WhyResultSchema = z.object({
  summary: z.string().min(1),
  causal_chain: z.array(CausalClaimSchema).min(1),
  timeline: z.array(TimelineEventSchema),
  residual_uncertainty: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'What the evidence does not establish — claiming zero unknowns is invalid',
    ),
  status: TerminalStatusSchema,
});
export type WhyResult = z.infer<typeof WhyResultSchema>;

export const RiskSchema = z.enum(['high', 'medium', 'low']);

export const BlastEntrySchema = z.object({
  file: z.string().min(1),
  via: z.string().min(1).describe('Edge kind: call, import, config, ...'),
  risk: RiskSchema.describe(
    'Heuristic weight (edge kind x distance), not a measurement',
  ),
});

export const ChangeResultSchema = z.object({
  summary: z.string().min(1),
  changes: z.array(
    z.object({
      file: z.string().min(1),
      lineRange: z.string().min(1),
      snippet: z.string().min(1),
      why: z.string().min(1),
    }),
  ),
  blast_radius: z.array(BlastEntrySchema),
  tests_to_update: z.array(z.string().min(1)),
  steps: z.array(z.string().min(1)).min(1),
  open_questions: z
    .array(z.string().min(1))
    .describe(
      'Unresolved edges (DI, dynamic calls, ...) — required honesty, may only be empty when every edge resolved',
    ),
  status: TerminalStatusSchema,
});
export type ChangeResult = z.infer<typeof ChangeResultSchema>;

export type ContractError = {
  path: string;
  message: string;
};

export type ContractValidation<T> =
  { ok: true; value: T } | { ok: false; errors: ContractError[] };

function flatten<T>(parsed: z.ZodSafeParseResult<T>): ContractValidation<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      // e.g. "causal_chain.2.grade" — quoted verbatim into repair prompts
      path: i.path.map(String).join('.'),
      message: i.message,
    })),
  };
}

export function validateWhy(input: unknown): ContractValidation<WhyResult> {
  return flatten(WhyResultSchema.safeParse(input));
}

export function validateChange(
  input: unknown,
): ContractValidation<ChangeResult> {
  return flatten(ChangeResultSchema.safeParse(input));
}

// One-line rendering of validation errors for the repair re-prompt.
export function formatContractErrors(errors: ContractError[]): string {
  return errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ');
}

// Pulls the first {...} object out of a reply (fences tolerated). Returns
// undefined when there is no balanced-looking object to validate.
export function extractJsonObject(text: string): unknown {
  const unfenced = text
    .replace(/```json\s*/i, '')
    .replace(/```/g, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}
