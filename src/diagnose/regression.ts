import type { Store } from '../store/store.js';
import type { Config } from '../core/config.js';

const GITHUB_API = 'https://api.github.com';

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export interface RegressionCorrelation {
  lastPassingCommit: { sha: string; date: string };
  firstFailingCommit: { sha: string; date: string };
  changedFiles: string[];
  suspectFiles: string[];
}

interface CommitPoint {
  sha: string;
  date: string;
}

function findLastPassingAndFirstFailing(
  rows: Array<{
    commitSha: string;
    createdAt: string;
    finalStatus: string;
  }>
): {
  lastPassing: CommitPoint | null;
  firstFailing: CommitPoint | null;
} {
  // rows are appended append-only, so sort ascending by date to reason chronologically
  const sorted = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let lastPassing: CommitPoint | null = null;
  let firstFailing: CommitPoint | null = null;

  for (const row of sorted) {
    if (row.finalStatus === 'passed') {
      lastPassing = { sha: row.commitSha, date: row.createdAt };
    } else if (row.finalStatus === 'failed' && firstFailing === null) {
      firstFailing = { sha: row.commitSha, date: row.createdAt };
    }
  }

  // only meaningful if the last pass came before the first fail
  if (
    lastPassing &&
    firstFailing &&
    new Date(lastPassing.date) >= new Date(firstFailing.date)
  ) {
    return { lastPassing: null, firstFailing: null };
  }

  return { lastPassing, firstFailing };
}

async function fetchChangedFiles(
  owner: string,
  repo: string,
  token: string,
  baseSha: string,
  headSha: string
): Promise<string[] | null> {
  const url =
    `${GITHUB_API}/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: githubHeaders(token) });
  } catch {
    return null;
  }

  if (!res.ok) {
    console.log(
      `[regression] GitHub compare API responded ${res.status} — skipping`
    );
    return null;
  }

  const data = await res.json() as { files?: Array<{ filename: string }> };

  return (data.files ?? []).map((f) => f.filename);
}

function findSuspectFiles( changedFiles: string[], testFilePath: string): string[] {
  const testBasename = testFilePath.split('/').at(-1) ?? testFilePath;

  return changedFiles.filter((changed) => {
    const changedBasename = changed.split('/').at(-1) ?? changed;

    // the test file itself was changed
    if (changed === testFilePath) return true;

    // basenames overlap (e.g. Button.tsx changed, Button.test.tsx is the test)
    if (
      testBasename.includes(changedBasename.replace(/\.[^.]+$/, '')) ||
      changedBasename.includes(testBasename.replace(/\.[^.]+$/, ''))
    ) {
      return true;
    }

    return false;
  });
}

export async function correlateRegression(
  testId: string,
  testFilePath: string,
  store: Store,
  config: Config
): Promise<RegressionCorrelation | null> {
  const branch = config.branch.main;
  const history = store.getTestHistory(testId, branch);

  if (history.rows.length === 0) {
    console.log(
      `[regression] No history found for test ${testId}`
    );
    return null;
  }

  const { lastPassing, firstFailing } = findLastPassingAndFirstFailing(history.rows);

  if (!lastPassing || !firstFailing) {
    console.log(
      `[regression] Could not find a clean pass→fail boundary for ${testId}`
    );
    return null;
  }

  const { owner, repo, token } = config.github;

  const changedFiles = await fetchChangedFiles(
    owner,
    repo,
    token,
    lastPassing.sha,
    firstFailing.sha
  );

  if (changedFiles === null) {
    console.log(
      `[regression] GitHub unavailable — returning null for ${testId}`
    );
    return null;
  }

  const suspectFiles = findSuspectFiles(
    changedFiles,
    testFilePath
  );

  return {
    lastPassingCommit: lastPassing,
    firstFailingCommit: firstFailing,
    changedFiles,
    suspectFiles,
  };
}