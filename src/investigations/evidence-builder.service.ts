import { Injectable, NotFoundException } from '@nestjs/common';
import { GithubService } from '../auth/github.service';
import { extractIssueRefs } from '../auth/utils/github-refs.util';
import { UsersService } from '../users/users.service';
import { AnalysisService } from '../analysis/analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CodeEvidence,
  CommitEvidence,
  DiffEvidence,
  EvidenceBundle,
  IssueEvidence,
  PREvidence,
} from './dto/evidence.dto';

const STOPWORDS = new Set(
  'a,an,the,why,what,how,when,where,which,who,does,do,is,are,was,were,be,been,to,of,in,on,for,with,and,or,not,no,s,this,that,it,its,as,at,by,from,into,about,like,just,only,so,but,if,then,there,here,i,you,we,they,my,our,your,his,her,can,could,should,would,will,did,has,have,had,doesn,t,re,ve,ll'.split(
    ',',
  ),
);

const MAX_SEARCH_TERMS = 3;
const MAX_FILES = 5;
const MAX_EVIDENCE_CHARS = 12_000;
const MAX_HISTORY_FILES = 3;
const MAX_COMMITS = 3;
const MAX_PRS = 3;
const MAX_ISSUES = 3;

export function tokenizeQuestion(question: string): string[] {
  const seen = new Set<string>();
  for (const raw of (question ?? '').toLowerCase().split(/[^a-z0-9_]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  const at = (arr: number[], idx: number): number => arr[idx] ?? 0;
  for (let i = 1; i <= a.length; i++) {
    let diag = at(prev, 0);
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = at(prev, j);
      prev[j] = Math.min(
        at(prev, j) + 1,
        at(prev, j - 1) + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = next;
    }
  }
  return at(prev, b.length);
}

export function fuzzyMatch(token: string, name: string): boolean {
  const simple = name.split('.').pop()?.toLowerCase() ?? '';
  const t = token.toLowerCase();
  if (!simple || !t) return false;
  if (simple.includes(t) || t.includes(simple)) return true;
  const allowed = Math.max(2, Math.floor(simple.length / 3));
  return levenshtein(t, simple) <= allowed;
}

type RankedCommit = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  score: number;
};

@Injectable()
export class EvidenceBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly github: GithubService,
    private readonly analysis: AnalysisService,
  ) {}

  async buildEvidence(
    userId: string,
    repositoryId: string,
    question: string,
    hints: { targetFile?: string; targetSymbol?: string } = {},
  ): Promise<EvidenceBundle> {
    const terms = tokenizeQuestion(question);
    const code = await this.gatherCode(userId, repositoryId, terms, hints);
    const { commits, diffs, prs, issues, historyNote } =
      await this.gatherHistory(userId, repositoryId, terms, code);
    return { code, commits, diffs, prs, issues, historyNote };
  }

  private async gatherCode(
    userId: string,
    repositoryId: string,
    terms: string[],
    hints: { targetFile?: string; targetSymbol?: string } = {},
  ): Promise<CodeEvidence[]> {
    // Rank files by grep hit count across the top terms.
    const hits = new Map<string, number>();
    for (const term of terms.slice(0, MAX_SEARCH_TERMS)) {
      try {
        const matches = await this.analysis.searchFiles(
          userId,
          repositoryId,
          term,
          20,
        );
        for (const m of matches) hits.set(m.file, (hits.get(m.file) ?? 0) + 1);
      } catch {
        continue;
      }
    }
    const ranked = [...hits.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([file]) => file);

    // Explicit hints win over search: a named file always leads so history
    // covers it, capped back to MAX_FILES afterwards.
    const hintFile = hints.targetFile?.trim() ?? '';
    const hintSymbol = hints.targetSymbol?.trim() ?? '';
    const files = (
      hintFile && !ranked.includes(hintFile) ? [hintFile, ...ranked] : ranked
    ).slice(0, MAX_FILES);

    const out: CodeEvidence[] = [];
    const seen = new Set<string>();
    let chars = 0;
    const push = (e: CodeEvidence): void => {
      if (chars + e.content.length > MAX_EVIDENCE_CHARS) return;
      const key = `${e.file}:${e.startLine}`;
      if (seen.has(key)) return;
      seen.add(key);
      chars += e.content.length;
      out.push(e);
    };

    // A named symbol is read directly first so it leads the bundle even
    // when grep ranks its file lower.
    if (hintFile && hintSymbol) {
      try {
        const symbols = await this.analysis.listSymbols(
          userId,
          repositoryId,
          hintFile,
        );
        const exact = symbols.find((s) => s.name === hintSymbol);
        if (exact) {
          const content = await this.analysis.readSymbol(
            userId,
            repositoryId,
            hintFile,
            exact.name,
          );
          if (content.content != null) {
            push({
              file: hintFile,
              startLine: exact.startLine,
              endLine: exact.endLine,
              content: content.content,
              symbol: exact.name,
            });
          }
        }
      } catch {
        // fall through to the search-driven flow below
      }
    }

    for (const file of files) {
      let symbols: { name: string; startLine: number; endLine: number }[] = [];
      try {
        symbols = await this.analysis.listSymbols(userId, repositoryId, file);
      } catch {
        continue;
      }
      for (const term of terms) {
        const hit = symbols.find((s) => fuzzyMatch(term, s.name));
        if (!hit) continue;
        try {
          const content = await this.analysis.readSymbol(
            userId,
            repositoryId,
            file,
            hit.name,
          );
          if (content.content == null) continue;
          push({
            file,
            startLine: hit.startLine,
            endLine: hit.endLine,
            content: content.content,
            symbol: hit.name,
          });
        } catch {
          continue;
        }
      }
    }
    return out;
  }

  private async gatherHistory(
    userId: string,
    repositoryId: string,
    terms: string[],
    code: CodeEvidence[],
  ): Promise<{
    commits: CommitEvidence[];
    diffs: DiffEvidence[];
    prs: PREvidence[];
    issues: IssueEvidence[];
    historyNote: string | null;
  }> {
    const empty = {
      commits: [] as CommitEvidence[],
      diffs: [] as DiffEvidence[],
      prs: [] as PREvidence[],
      issues: [] as IssueEvidence[],
      historyNote: 'No relevant commits found in file history.' as
        string | null,
    };
    const link = await this.prisma.userRepository
      .findUnique({
        where: { userId_repositoryId: { userId, repositoryId } },
      })
      .catch(() => null);
    // Owner/name come from the canonical repository row.
    const repo = await this.prisma.repository
      .findUnique({ where: { id: repositoryId } })
      .catch(() => null);
    if (!link || !repo) throw new NotFoundException('Repository not found');

    let token: string;
    try {
      token = await this.users.getDecryptedGithubToken(userId);
    } catch {
      return empty;
    }

    const files = [...new Set(code.map((c) => c.file))].slice(
      0,
      MAX_HISTORY_FILES,
    );
    if (files.length === 0) return empty;
    const candidates = new Map<string, RankedCommit>();
    for (const file of files) {
      let history: Awaited<ReturnType<GithubService['getFileHistory']>> = [];
      try {
        history = await this.github.getFileHistory(
          token,
          repo.owner,
          repo.name,
          file,
          5,
        );
      } catch {
        continue;
      }
      for (const c of history) {
        const score = this.scoreCommit(c.message, terms);
        const prev = candidates.get(c.sha);
        if (!prev || score > prev.score) {
          candidates.set(c.sha, { ...c, score });
        }
      }
    }
    const ranked = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_COMMITS);
    if (ranked.length === 0) return empty;

    // Verify by diff: keep commits whose patch touches our evidence files
    // first, then the rest by score.
    const withDiffs: {
      commit: RankedCommit;
      touches: boolean;
      files: { path: string; patch: string }[];
    }[] = [];
    for (const commit of ranked) {
      try {
        const detail = await this.github.getCommitDetail(
          token,
          repo.owner,
          repo.name,
          commit.sha,
        );
        const touches = detail.files.some((f) =>
          files.some((ef) => f.path === ef || f.path.endsWith('/' + ef)),
        );
        withDiffs.push({ commit, touches, files: detail.files });
      } catch {
        withDiffs.push({ commit, touches: false, files: [] });
      }
    }
    withDiffs.sort((a, b) => Number(b.touches) - Number(a.touches));
    const kept = withDiffs.slice(0, MAX_COMMITS);

    const commits: CommitEvidence[] = kept.map((k) => ({
      sha: k.commit.sha,
      message: k.commit.message,
      author: k.commit.author,
      date: k.commit.date,
    }));
    const diffs: DiffEvidence[] = kept.flatMap((k) =>
      k.files.map((f) => ({ sha: k.commit.sha, file: f.path, patch: f.patch })),
    );

    const prs: PREvidence[] = [];
    const seenPRs = new Set<number>();
    for (const k of kept.slice(0, MAX_PRS)) {
      let found: Awaited<ReturnType<GithubService['getCommitPRs']>> = [];
      try {
        found = await this.github.getCommitPRs(
          token,
          repo.owner,
          repo.name,
          k.commit.sha,
        );
      } catch {
        continue;
      }
      for (const pr of found) {
        if (seenPRs.has(pr.number)) continue;
        seenPRs.add(pr.number);
        prs.push(pr);
        if (prs.length >= MAX_PRS) break;
      }
      if (prs.length >= MAX_PRS) break;
    }

    const issues: IssueEvidence[] = [];
    const seenIssues = new Set<number>();
    for (const pr of prs) {
      for (const n of extractIssueRefs(pr.body ?? '')) {
        if (seenIssues.has(n) || issues.length >= MAX_ISSUES) continue;
        seenIssues.add(n);
        try {
          const issue = await this.github.getIssue(
            token,
            repo.owner,
            repo.name,
            n,
          );
          issues.push(issue);
        } catch {
          continue;
        }
      }
      if (issues.length >= MAX_ISSUES) break;
    }

    return { commits, diffs, prs, issues, historyNote: null };
  }

  private scoreCommit(message: string, terms: string[]): number {
    const words = new Set(message.toLowerCase().split(/[^a-z0-9_]+/));
    let score = 0;
    for (const t of terms) {
      if (words.has(t)) score += 2;
      else if ([...words].some((w) => w.includes(t) || t.includes(w))) {
        score += 1;
      }
    }
    return score;
  }
}
