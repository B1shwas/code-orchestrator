export type InvestigationMode = 'why' | 'change';

const WHY_SHAPE = `{"summary": string, "causal_chain": [{"claim": string, "evidence": ["[commit:<sha] | [PR #<n>]"], "grade": "confirmed|supported|inferred"}], "timeline": [{"at": string, "event": string, "ref": citation}], "residual_uncertainty": [string, ...at least one], "status": "COMPLETED|PARTIAL|INSUFFICIENT"}`;

const CHANGE_SHAPE = `{"summary": string, "changes": [{"file": string, "lineRange": "a-b", "snippet": string, "why": string}], "blast_radius": [{"file": string, "via": string, "risk": "high|medium|low"}], "tests_to_update": [string], "steps": [string, ...at least one], "open_questions": [string], "status": "COMPLETED|PARTIAL|INSUFFICIENT"}`;

// Appended to the evidence prompt. Tool calls still use the TOOL: line —
// this contract applies only when the model answers.
export function formatInstructions(mode: InvestigationMode): string {
  const shape = mode === 'why' ? WHY_SHAPE : CHANGE_SHAPE;
  return [
    'When you answer (not when calling a tool with a TOOL: line), reply with exactly one JSON object and no other text, matching this shape:',
    shape,
    'Rules: every factual claim carries citations that resolve against the evidence above; grade honestly (confirmed only with quoted content, otherwise supported, guesses marked inferred); residual_uncertainty / open_questions must name what is unknown, never empty claims of certainty.',
  ].join('\n');
}
