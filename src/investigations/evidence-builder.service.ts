import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GithubService } from '../auth/github.service';
import { extractIssueRefs } from '../auth/utils/github-refs.util';
import { UsersService } from '../users/users.service';
import { AnalysisService } from '../analysis/analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { createLimiter } from './utils/p-limit.util';

// bursts stay capped so one investigation (and later, one agent
// iteration) never hammers the API or the DB pool.
const MAX_CONCURRENT = 5;

async function settleAll<T>(
  limit: <U>(fn: () => Promise<U>) => Promise<U>,
  fns: (() => Promise<T>)[],
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(fns.map((fn) => limit(fn)));
}

function reasonOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return 'unknown error';
}
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
  private readonly logger = new Logger(EvidenceBuilderService.name);

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
    const started = Date.now();
    const terms = tokenizeQuestion(question);
    const code = await this.gatherCode(userId, repositoryId, terms, hints);
    const { commits, diffs, prs, issues, historyNote } =
      await this.gatherHistory(userId, repositoryId, terms, code);
    this.logger.warn(
      `evidence done files=${code.length} commits=${commits.length} prs=${prs.length} issues=${issues.length} totalMs=${Date.now() - started}`,
    );
    return { code, commits, diffs, prs, issues, historyNote };
  }

  private async gatherCode(
    userId: string,
    repositoryId: string,
    terms: string[],
    hints: { targetFile?: string; targetSymbol?: string } = {},
  ): Promise<CodeEvidence[]> {
    // ranking files by grep hit count across the top terms
    const hits = new Map<string, number>();
    const settled = await Promise.allSettled(
      terms.slice(0, MAX_SEARCH_TERMS).map((term) =>
        this.analysis.searchFiles(userId, repositoryId, term, 20).then(
          (matches) => ({ term, ok: true as const, matches, reason: null }),
          (reason: unknown) => ({
            term,
            ok: false as const,
            matches: [],
            reason,
          }),
        ),
      ),
    );

    for (const result of settled) {
      if (result.status !== 'fulfilled') {
        this.logger.warn(
          `search batch failed reason="${reasonOf(result.reason)}"`,
        );
        continue;
      }
      if (!result.value.ok) {
        this.logger.warn(
          `search skipped term="${result.value.term}" reason="${reasonOf(result.value.reason)}"`,
        );
        continue;
      }

      for (const m of result.value.matches)
        hits.set(m.file, (hits.get(m.file) ?? 0) + 1);
    }
    const ranked = [...hits.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([file]) => file);

    // explicit hints win over search: a named file always leads so history
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

    // a named symbol is read directly first so it leads the bundle even
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
      } catch (err) {
        this.logger.warn(
          `hint miss file="${hintFile}" symbol="${hintSymbol}" reason="${reasonOf(err)}"`,
        );
        // fall through to the search-driven flow below
      }
    }

    // an explicitly named file is always read: the user pointed at it, so
    // its content leads the bundle even when no query term matches anything
    // in it (typos, prose questions, symbol-less files).
    if (hintFile && ![...seen].some((key) => key.startsWith(`${hintFile}:`))) {
      try {
        const file = await this.analysis.readFile(
          userId,
          repositoryId,
          hintFile,
        );
        if (file.content != null) {
          push({
            file: hintFile,
            startLine: 1,
            endLine: file.content.split('\n').length,
            content: file.content,
            symbol: hintSymbol || null,
          });
        }
      } catch (err) {
        this.logger.warn(
          `hint miss file="${hintFile}" symbol="${hintSymbol}" reason="${reasonOf(err)}"`,
        );
      }
    }

    const limit = createLimiter(MAX_CONCURRENT);
    const symbolLists = await settleAll(
      limit,
      files.map(
        (file) => () =>
          this.analysis
            .listSymbols(userId, repositoryId, file)
            .then((symbols) => ({ file, symbols })),
      ),
    );
    type ReadTask = {
      file: string;
      hit: { name: string; startLine: number; endLine: number };
    };
    const tasks: ReadTask[] = [];
    for (const result of symbolLists) {
      if (result.status !== 'fulfilled') {
        this.logger.warn(`symbols skipped reason="${reasonOf(result.reason)}"`);
        continue;
      }
      const { file, symbols } = result.value;
      for (const term of terms) {
        const hit = symbols.find((s) => fuzzyMatch(term, s.name));
        if (hit) tasks.push({ file, hit });
      }
    }
    const reads = await settleAll(
      limit,
      tasks.map(
        ({ file, hit }) =>
          () =>
            this.analysis
              .readSymbol(userId, repositoryId, file, hit.name)
              .then((content) => ({ file, hit, content: content.content })),
      ),
    );
    for (const result of reads) {
      if (result.status !== 'fulfilled') {
        this.logger.warn(
          `symbol read skipped reason="${reasonOf(result.reason)}"`,
        );
        continue;
      }
      if (result.value.content == null) continue;
      const { file, hit, content } = result.value;
      push({
        file,
        startLine: hit.startLine,
        endLine: hit.endLine,
        content,
        symbol: hit.name,
      });
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
    // owner/name come from the canonical repository row; the two lookups
    // are independent so they run together.
    const [link, repo] = await Promise.all([
      this.prisma.userRepository
        .findUnique({
          where: { userId_repositoryId: { userId, repositoryId } },
        })
        .catch(() => null),
      this.prisma.repository
        .findUnique({ where: { id: repositoryId } })
        .catch(() => null),
    ]);
    if (!link || !repo) throw new NotFoundException('Repository not found');

    let token: string;
    try {
      token = await this.users.getDecryptedGithubToken(userId);
    } catch (err) {
      this.logger.warn(
        `history skipped: github token unavailable (${reasonOf(err)})`,
      );
      return empty;
    }

    const files = [...new Set(code.map((c) => c.file))].slice(
      0,
      MAX_HISTORY_FILES,
    );
    if (files.length === 0) return empty;
    const candidates = new Map<string, RankedCommit>();
    const settled = await Promise.allSettled(
      files.map((file) =>
        this.github
          .getFileHistory(token, repo.owner, repo.name, file, 5)
          .then((history) => ({ file, history })),
      ),
    );
    for (const result of settled) {
      if (result.status !== 'fulfilled') {
        this.logger.warn(`history skipped reason="${reasonOf(result.reason)}"`);
        continue;
      }
      for (const c of result.value.history) {
        const score = this.scoreCommit(c.message, terms);
        const prev = candidates.get(c.sha);
        if (!prev || score > prev.score) candidates.set(c.sha, { ...c, score });
      }
    }
    const ranked = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_COMMITS);
    if (ranked.length === 0) return empty;

    // verifying by diff: keep commits whose patch touches our evidence files
    // first, then the rest by score.
    const limit = createLimiter(MAX_CONCURRENT);
    const withDiffs: {
      commit: RankedCommit;
      touches: boolean;
      files: { path: string; patch: string }[];
    }[] = [];
    const details = await settleAll(
      limit,
      ranked.map(
        (commit) => () =>
          this.github
            .getCommitDetail(token, repo.owner, repo.name, commit.sha)
            .then((detail) => ({ commit, detail })),
      ),
    );
    for (const result of details) {
      if (result.status !== 'fulfilled') {
        // detail fetch failed: commit stays ranked but contributes no diff
        this.logger.warn(
          `commit detail skipped reason="${reasonOf(result.reason)}"`,
        );
        continue;
      }
      const { commit, detail } = result.value;
      const touches = detail.files.some((f) =>
        files.some((ef) => f.path === ef || f.path.endsWith('/' + ef)),
      );
      withDiffs.push({ commit, touches, files: detail.files });
    }
    // Commits whose detail fetch failed keep their score position.
    for (const commit of ranked) {
      if (!withDiffs.some((w) => w.commit.sha === commit.sha)) {
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
    const prResults = await settleAll(
      limit,
      kept.slice(0, MAX_PRS).map(
        (k) => () =>
          this.github
            .getCommitPRs(token, repo.owner, repo.name, k.commit.sha)
            .then(
              (found) => ({ sha: k.commit.sha, ok: true as const, found }),
              (reason: unknown) => ({
                sha: k.commit.sha,
                ok: false as const,
                found: [],
                reason,
              }),
            ),
      ),
    );
    for (const result of prResults) {
      if (result.status !== 'fulfilled') {
        this.logger.warn(
          `pr lookup batch failed reason="${reasonOf(result.reason)}"`,
        );
        continue;
      }
      if (!result.value.ok) {
        this.logger.warn(
          `pr lookup skipped sha="${result.value.sha}" reason="${reasonOf(result.value.reason)}"`,
        );
        continue;
      }
      for (const pr of result.value.found) {
        if (seenPRs.has(pr.number)) continue;
        seenPRs.add(pr.number);
        prs.push(pr);
        if (prs.length >= MAX_PRS) break;
      }
      if (prs.length >= MAX_PRS) break;
    }

    const issues: IssueEvidence[] = [];
    const seenIssues = new Set<number>();
    const wanted: number[] = [];
    for (const pr of prs) {
      for (const n of extractIssueRefs(pr.body ?? '')) {
        if (seenIssues.has(n)) continue;
        seenIssues.add(n);
        wanted.push(n);
        if (wanted.length >= MAX_ISSUES) break;
      }
      if (wanted.length >= MAX_ISSUES) break;
    }
    const issueResults = await settleAll(
      limit,
      wanted.map(
        (n) => () =>
          this.github.getIssue(token, repo.owner, repo.name, n).then(
            (issue) => ({ n, ok: true as const, issue }),
            (reason: unknown) => ({
              n,
              ok: false as const,
              issue: null,
              reason,
            }),
          ),
      ),
    );
    for (const result of issueResults) {
      if (result.status !== 'fulfilled') {
        this.logger.warn(
          `issue fetch batch failed reason="${reasonOf(result.reason)}"`,
        );
        continue;
      }
      if (!result.value.ok || !result.value.issue) {
        this.logger.warn(
          `issue fetch skipped issue=${result.value.n} reason="${reasonOf(result.value.reason)}"`,
        );
        continue;
      }
      issues.push(result.value.issue);
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
