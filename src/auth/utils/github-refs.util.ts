const ISSUE_REF =
  /\b(?:fix(?:es|ed)?|clos(?:es|ed)?|resolv(?:es|ed)?)\s+#(\d+)/gi;

export function extractIssueRefs(text: string): number[] {
  if (!text) return [];
  const seen = new Set<number>();
  for (const match of text.matchAll(ISSUE_REF)) {
    const n = Number(match[1]);
    if (Number.isSafeInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}
