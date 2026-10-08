import { formatInstructions } from './answer-format.prompt';

describe('formatInstructions', () => {
  it('demands a single JSON object shaped for why mode', () => {
    const text = formatInstructions('why');
    expect(text).toContain('exactly one JSON object');
    expect(text).toContain('causal_chain');
    expect(text).toContain('residual_uncertainty');
  });

  it('demands a single JSON object shaped for change mode', () => {
    const text = formatInstructions('change');
    expect(text).toContain('exactly one JSON object');
    expect(text).toContain('blast_radius');
    expect(text).toContain('open_questions');
  });

  it('keeps tool calls on the TOOL line', () => {
    expect(formatInstructions('why')).toContain('TOOL:');
  });
});
