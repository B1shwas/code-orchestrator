import {
  extractJsonObject,
  formatContractErrors,
  validateChange,
  validateWhy,
} from './contracts';

const whyGood = {
  summary: 'The retry cap prevents duplicate payments.',
  causal_chain: [
    {
      claim: 'Unlimited retries duplicated charges on recovery.',
      evidence: ['[commit:8a91f2]', '[PR #142]'],
      grade: 'confirmed',
    },
  ],
  timeline: [{ at: '2024-03-15', event: 'Cap introduced', ref: '[PR #142]' }],
  residual_uncertainty: ['SLA discussion link not found.'],
  status: 'COMPLETED',
};

const changeGood = {
  summary: 'Changing calculateLateFee affects 2 callers.',
  changes: [
    {
      file: 'src/payment.service.ts',
      lineRange: '82-95',
      snippet: 'function calculateLateFee(...) {}',
      why: 'Core function to modify',
    },
  ],
  blast_radius: [{ file: 'src/billing.service.ts', via: 'call', risk: 'high' }],
  tests_to_update: ['src/payment.service.spec.ts'],
  steps: ['Modify signature', 'Update callers'],
  open_questions: ['DI injection sites could not all be resolved.'],
  status: 'PARTIAL',
};

describe('validateWhy', () => {
  it('accepts a complete Why answer', () => {
    const r = validateWhy(whyGood);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('COMPLETED');
  });

  it('rejects empty uncertainty and bad grades with paths', () => {
    const r = validateWhy({
      ...whyGood,
      residual_uncertainty: [],
      causal_chain: [
        { claim: 'x', evidence: ['[commit:abc]'], grade: 'proven' },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = formatContractErrors(r.errors);
      expect(text).toContain('residual_uncertainty');
      expect(text).toContain('causal_chain.0.grade');
    }
  });

  it('rejects missing summary and empty chain', () => {
    const r = validateWhy({ ...whyGood, summary: '', causal_chain: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.errors.map((e) => e.path);
      expect(paths).toContain('summary');
      expect(paths).toContain('causal_chain');
    }
  });
});

describe('validateChange', () => {
  it('accepts a complete Change answer', () => {
    const r = validateChange(changeGood);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.blast_radius).toHaveLength(1);
  });

  it('rejects bad risk and empty steps with paths', () => {
    const r = validateChange({
      ...changeGood,
      blast_radius: [{ file: 'a.ts', via: 'call', risk: 'critical' }],
      steps: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.errors.map((e) => e.path);
      expect(paths).toContain('blast_radius.0.risk');
      expect(paths).toContain('steps');
    }
  });

  it('rejects non-object input at the root', () => {
    const r = validateChange('just prose');
    expect(r.ok).toBe(false);
  });
});

describe('extractJsonObject', () => {
  it('pulls fenced JSON out of prose', () => {
    expect(extractJsonObject('Here:\n```json\n{"a": 1}\n```\ndone')).toEqual({
      a: 1,
    });
  });

  it('pulls a bare object out of surrounding text', () => {
    expect(extractJsonObject('prefix {"a": 1} suffix')).toEqual({ a: 1 });
  });

  it('returns undefined when there is no object', () => {
    expect(extractJsonObject('just prose, no braces')).toBeUndefined();
    expect(extractJsonObject('{"unclosed": true')).toBeUndefined();
  });
});
