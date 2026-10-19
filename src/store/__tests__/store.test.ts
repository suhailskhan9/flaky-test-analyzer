import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../store.js";
import type { Run } from "../../core/model.js";

//

// in memory sqlite db for tests
function makeStore(): Store {
    return new Store(':memory:');
}

function makeRun(overrides: Partial<Run> = {}): Run {
    return {
        runId: 'run-1',
        framework: 'vitest',
        createdAt: new Date().toISOString(),
        branch: 'main',
        commitSha: 'abc123',
        totalTests: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        timedOut: 0,
        metadata: {},
        tests: [
            {
                id: 'src/math.test.ts::adds numbers::',
                filePath: 'src/math.test.ts',
                titlePath: ['adds numbers'],
                project: '',
                finalStatus: 'passed',
                flaky: false,
                metadata: {},
                attempts: [
                    {
                        attemptIndex: 0,
                        source: 'original',
                        status: 'passed',
                        durationMs: 12,
                        env: { commitSha: 'abc123', branch: 'main'},
                        metadata: {},
                    }
                ]
            }
        ],
        ...overrides
    };
}


// tests

describe('Store', () => { 
    let store: Store;

    beforeEach(() => {
        store = makeStore();
    });

    afterEach(() => {
        store.close()
    })


    it('saves a run and retrieves its history', () => {
        store.saveRun(makeRun());

        const history = store.getTestHistory(
            'src/math.test.ts::adds numbers::',
            'main'
        );

        expect(history.rows).toHaveLength(1);
        expect(history.rows[0]?.finalStatus).toBe('passed');
        expect(history.distinctCommits).toBe(1);
        expect(history.failedCommits).toBe(0);
    })

    it('is idempotent - saving the same runId twice does not duplicate data', () => {
        store.saveRun(makeRun())
        store.saveRun(makeRun())    // same runId, should be ignored

        const history = store.getTestHistory(
            'src/math.test.ts::adds numbers::',
            'main'
        );

        expect(history.rows).toHaveLength(1);
    })
 
    it('separates history by branch', () => {
        store.saveRun(makeRun({ runId: 'run-1', branch: 'main'}))
        store.saveRun(makeRun({ runId: 'run-2', branch: 'feature/login'}))

        const mainHistory = store.getTestHistory(
            'src/math.test.ts::adds numbers::',
            'main'
        );

        const prHistory = store.getTestHistory(
            'src/math.test.ts::adds numbers::',
            'feature/login'
        );
        expect(mainHistory.rows).toHaveLength(1);
        expect(prHistory.rows).toHaveLength(1);
    })

    it('counts failed commits correctly', () => {
        // two diff commits, both failed

        const failedRun1 = makeRun({
            runId: 'run-1',
            commitSha: 'aaa',
            tests: [
                {
                    id: 'src/math.test.ts::adds numbers::',
                    filePath: 'src/math.test.ts',
                    titlePath: ['adds numbers'],
                    project: '',
                    finalStatus: 'failed',
                    flaky: false,
                    metadata: {},
                    attempts: [{
                            attemptIndex: 0, source: 'original', status: 'failed',
                            errorMessage: 'Expected 3 but got 2',
                            env: {}, metadata: {}
                        }]
                }],
            passed: 0, failed: 1
        });

        const failedRun2 = makeRun({
            runId: 'run-2',
            commitSha: 'bbb',
            tests: [
                {
                    id: 'src/math.test.ts::adds numbers::',
                    filePath: 'src/math.test.ts',
                    titlePath: ['adds numbers'],
                    project: '',
                    finalStatus: 'failed',
                    flaky: false,
                    metadata: {},
                    attempts: [{
                            attemptIndex: 0, source: 'original', status: 'failed',
                            errorMessage: 'Expected 3 but got 2',
                            env: {}, metadata: {}
                        }]
                }],
            passed: 0, failed: 1
        });

        store.saveRun(failedRun1);
        store.saveRun(failedRun2);


        const history = store.getTestHistory(
            'src/math.test.ts::adds numbers::',
            'main'
        )

        expect(history.distinctCommits).toBe(2);
        expect(history.failedCommits).toBe(2);
    });

    it('does not count framework_retry attempts in history', () => {
        const run = makeRun({
            tests: [{
                id: 'src/math.test.ts::adds numbers::',
                filePath: 'src/math.test.ts',
                titlePath: ['adds numbers'],
                project: '',
                finalStatus: 'passed',
                flaky: true,
                metadata: {},
                attempts: [
                    {
                        attemptIndex: 0, source: 'original', status: 'failed',
                        errorMessage: 'Timeout', env: {}, metadata: {}
                    },
                    {
                        attemptIndex: 1, source: 'framework_retry', status: 'passed',
                        env: {}, metadata: {}
                    }
                ]
            }]
        });

        store.saveRun(run);
        const history = store.getTestHistory(
            'src/math.test.ts::adds numbers::',
            'main'
        )

        expect(history.failedCommits).toBe(0);
    })
})