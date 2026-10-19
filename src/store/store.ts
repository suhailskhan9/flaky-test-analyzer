import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";
import type { Run, Test, Attempt } from "../core/model.js";

// Types

export interface TestHistoryRow {
    commitSha: string;
    branch: string;
    finalStatus: string;
    flaky: boolean;
    createdAt: string;
    errorMessage: string | null;
}

export interface TestHistory {
    testId: string;
    rows: TestHistoryRow[];
    distinctCommits: number;
    failedCommits: number;
}

// Store
export class Store {
    private db: Database.Database;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);

        this.db.pragma('journal_mode = WAL');

        runMigrations(this.db);
    }

    // Writes

    // saves a full Run (runs + tests + attempts) in one transaction
    // idempotent: if runId already exists, the whole is skipped

    saveRun(run: Run): void {
        // check if this run already saved
        const existing = this.db.prepare('SELECT runId FROM runs WHERE runId = ?').get(run.runId);

        if(existing) return;

        this.db.transaction(() => {

            // save the run
            this.db.prepare(
                `INSERT INTO runs (runId, framework, branch, commitSha, createdAt)
                VALUES (?, ?, ?, ?, ?)
                `
            )
            .run(
                run.runId,
                run.framework,
                run.branch ?? '',
                run.commitSha ?? '',
                run.createdAt,
            )
            // save each test + its attempts
            for(const test of run.tests) {
                this.saveTest(test, run)
            }
        })();
    }

    private saveTest(test: Test, run: Run): void {
        this.db.prepare(
            `
                INSERT OR IGNORE INTO tests
                    (id, runId, filePath, titlePath, project, finalStatus, flaky, branch, commitSha, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
                test.id,
                run.runId,
                test.filePath,
                JSON.stringify(test.titlePath),
                test.project,
                test.finalStatus,
                test.flaky ? 1 : 0,
                run.branch ?? '',
                run.commitSha ?? '',
                run.createdAt,
            );

            for(const attempt of test.attempts) {
                this.saveAttempt(attempt, test.id, run);
            }
    }

    private saveAttempt(attempt: Attempt, testId: string, run: Run): void {
        this.db.prepare(
            `
                INSERT INTO attempts
                    (testId, runId, attemptIndex, source, status, errorMessage, stackTrace, durationMs, branch, commitSha,
                    workerIndex, shardIndex, runnerOs, nodeVersion, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
        )
        .run(
            testId,
            run.runId,
            attempt.attemptIndex,
            attempt.source,
            attempt.status,
            attempt.errorMessage ?? null,
            attempt.stackTrace ?? null,
            attempt.durationMs ?? null,
            run.branch ?? '',
            run.commitSha ?? '',
            attempt.env.workerIndex ?? null,
            attempt.env.shardIndex ?? null,
            attempt.env.runnerOs ?? null,
            attempt.env.nodeVersion ?? null,
            run.createdAt,
        )
    }

    // Reads
    // Gets the last 30 days of history for a test on a specific branch
    // only returns original attempts (not framework_retry or agent_rerun)
    // so retries dont inflate failure counts


    getTestHistory(testId: string, branch: string): TestHistory {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const rows = this.db.prepare(
            `
                SELECT t.commitSha, t.branch, t.finalStatus, t.flaky, t.createdAt, a.errorMessage FROM tests t
                LEFT JOIN attempts a
                ON a.testId = t.id AND a.runId = t.runId AND a.source = 'original' AND a.attemptIndex = 0
                WHERE t.id = ? AND t.branch = ? AND t.createdAt >= ?
                ORDER BY t.createdAt DESC
            `)
            .all(testId, branch, cutoff.toISOString()) as Array<{
                commitSha: string;
                branch: string;
                finalStatus: string;
                flaky: number;
                createdAt: string;
                errorMessage: string | null;
            }>;

            // Count distinct commits (not raw rows)
            const commitSet = new Set(rows.map(r => r.commitSha).filter(Boolean));
            const failedCommitSet = new Set(
                rows
                    .filter(r => r.finalStatus === 'failed')
                    .map(r => r.commitSha)
                    .filter(Boolean)
            );
            return {
                testId,
                rows: rows.map(r => ({
                    ...r,
                    flaky: r.flaky === 1,
                })),
                distinctCommits: commitSet.size,
                failedCommits: failedCommitSet.size
            };
    }

    getRecentTestCount(branch: string): number {
        const row = this.db.prepare(
            `
                SELECT COUNT(DISTINCT t.id) as count
                FROM tests t
                JOIN runs r ON r.runId = t.runId
                WHERE r.branch = ?
                ORDER BY r.createdAt DESC
                LIMIT 1
            `)
            .get(branch) as { count: number } | undefined;
        
        return row?.count ?? 0;
    }

    // cleanup
    close(): void {
        this.db.close();
    }
}