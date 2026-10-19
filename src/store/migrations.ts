import type { Database } from "better-sqlite3";

// Types

interface Migration {
    version: number;
    sql: string;
}

// Migrations
// each migration is a version no + SQL to run
// never edit an existing migration, always add a new one

const MIGRATIONS: Migration[] = [
    {
        version: 1,
        sql: `
        -- Tracks which migrations have been applied
            CREATE TABLE IF NOT EXISTS migrations (
                version     INTEGER PRIMARY KEY,
                appliedAt   TEXT NOT NULL
            );
            
        -- One row per CI run
            CREATE TABLE IF NOT EXISTS runs (
                runId       TEXT PRIMARY KEY,
                framework   TEXT NOT NULL,
                branch      TEXT NOT NULL DEFAULT '',
                commitSha   TEXT NOT NULL DEFAULT '',
                createdAt   TEXT NOT NULL
            );
        
        -- One row per test per run
            CREATE TABLE IF NOT EXISTS tests (
                id          TEXT NOT NULL,
                runId       TEXT NOT NULL REFERENCES runs(runId),
                filePath    TEXT NOT NULL,
                titlePath   TEXT NOT NULL,          -- JSON array stored as text
                project     TEXT NOT NULL DEFAULT '',
                finalStatus TEXT NOT NULL,
                flaky       INTEGER NOT NULL DEFAULT 0,     -- 0 or 1 (SQLite has no boolean)
                branch      TEXT NOT NULL DEFAULT '',
                commitSha   TEXT NOT NULL DEFAULT '',
                createdAt   TEXT NOT NULL,
                PRIMARY KEY (id, runId)
            );

        -- One row per attempt per test per run
            CREATE TABLE IF NOT EXISTS attempts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                testId          TEXT NOT NULL,
                runId           TEXT NOT NULL,
                attemptIndex    INTEGER NOT NULL,
                source          TEXT NOT NULL,          -- original | framework_retry | agent_rerun
                status          TEXT NOT NULL,
                errorMessage    TEXT,
                stackTrace      TEXT,
                durationMs      REAL,
                branch          TEXT NOT NULL DEFAULT '',
                commitSha       TEXT NOT NULL DEFAULT '',
                workerIndex     INTEGER,
                shardIndex      INTEGER,
                runnerOs        TEXT,
                nodeVersion     TEXT,
                createdAt       TEXT NOT NULL
            );

        -- Index for fast history lookups by test + branch
            CREATE INDEX IF NOT EXISTS idx_tests_id_branch
                ON tests(id, branch, createdAt);
        
        
        -- Index for fast attempt lookups
            CREATE INDEX IF NOT EXISTS idx_attempts_testid
                ON attempts(testId, branch, createdAt);
        `
    }
]

// Runner
export function runMigrations(db: Database): void {

    let currentVersion = 0;
    try{
        const row = db
            .prepare('SELECT MAX(version) as v FROM migrations')
            .get() as { v: number | null };
        
        currentVersion = row?.v ?? 0;
    }
    catch {
        currentVersion = 0;
    }

    for(const migration of MIGRATIONS) {
        if(migration.version <= currentVersion) continue;

        db.transaction(() => {
            db.exec(migration.sql);
            db
                .prepare('INSERT INTO migrations (version, appliedAt) VALUES (?, ?)')
                .run(migration.version, new Date().toISOString())
        })();

        console.log(`[store] applied migration v${migration.version}`)
    }
}