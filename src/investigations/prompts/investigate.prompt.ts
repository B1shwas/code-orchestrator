import { EvidenceBundle } from '../dto/evidence.dto';

const MAX_PROMPT_CHARS = 30_000;

function section(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

export function buildInvestigationPrompt(
  question: string,
  bundle: EvidenceBundle,
): string {
  const parts: string[] = [
    'You are a code analyst. Answer the user question using ONLY the evidence below.',
    'Rules:',
    '- Every factual claim must cite its source as [commit:<short-sha>], [PR #<n>], or [<file>:<line>].',
    '- If the evidence does not establish something, say so plainly and mark the rest as inference.',
    '- Never invent commits, PRs, issues, or discussions not present in the evidence.',
    '',
    `QUESTION:\n${question}`,
  ];

  if (bundle.code.length > 0) {
    parts.push(
      section(
        'CODE',
        bundle.code
          .map(
            (c) =>
              `--- ${c.file}:${c.startLine}-${c.endLine}${c.symbol ? ` (${c.symbol})` : ''} ---\n${c.content}`,
          )
          .join('\n\n'),
      ),
    );
  }
  if (bundle.commits.length > 0) {
    parts.push(
      section(
        'COMMITS',
        bundle.commits
          .map(
            (c) =>
              `${c.sha} | ${c.message} | ${c.author ?? 'unknown'} | ${c.date ?? 'unknown date'}`,
          )
          .join('\n'),
      ),
    );
  }
  if (bundle.diffs.length > 0) {
    parts.push(
      section(
        'DIFFS',
        bundle.diffs
          .map((d) => `--- ${d.sha} ${d.file} ---\n${d.patch}`)
          .join('\n\n'),
      ),
    );
  }
  if (bundle.prs.length > 0) {
    parts.push(
      section(
        'PULL REQUESTS',
        bundle.prs
          .map((p) => `#${p.number} ${p.title}\n${p.body ?? ''}`)
          .join('\n\n'),
      ),
    );
  }
  if (bundle.issues.length > 0) {
    parts.push(
      section(
        'ISSUES',
        bundle.issues
          .map((i) => `#${i.number} ${i.title}\n${i.body ?? ''}`)
          .join('\n\n'),
      ),
    );
  }
  if (bundle.historyNote) {
    parts.push(
      section(
        'HISTORY NOTE',
        `${bundle.historyNote} Answer from the code alone and mark inference explicitly.`,
      ),
    );
  }

  parts.push(
    'Answer with citations. End with an "Evidence" list mapping each citation to its source.',
  );
  const prompt = parts.join('\n\n');
  return prompt.length > MAX_PROMPT_CHARS
    ? prompt.slice(0, MAX_PROMPT_CHARS)
    : prompt;
}
