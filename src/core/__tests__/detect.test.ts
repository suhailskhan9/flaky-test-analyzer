import { describe, it, expect } from "vitest";
import { detectTest } from "../detect.js";
import type { Test } from "../model.js";
import type { TestHistory } from "../../store/store.js";


function makeTest(overrides: Partial<Test> = {}): Test {
    return {
        id: 'src/math.test.ts::adds numbers::',
        filePath: 'src/math.test.ts',
        titlePath: ['adds numbers'],
        project: '',
        finalStatus: 'failed',
        flaky: false,
        metadata: {},
        attempts: [
            {
                attemptIndex: 0,
                source: 'original',
                status: 'failed',
                errorMessage: 'Expected 3 but got 2',
                env: {},
                metadata: {},
            },
        ],
        ...overrides,
    }
}

function makeHistory(overrides: Partial<TestHistory> = {}): TestHistory {
    return {
        testId: 'src/math.test.ts::adds numbers::',
        rows: [],
        distinctCommits: 0,
        failedCommits: 0,
        ...overrides
    }
}


describe('detectTest', () => {
    it('labels infra when error matches infra pattern', () => {
        const test = makeTest({
            attempts: [{
                attemptIndex: 0, source: 'original', status: 'failed',
                errorMessage: 'connect ECONNREFUSED 127.0.0.1:3000',
                env: {}, metadata: {}
            }]
        });

        const result = detectTest(test, makeHistory());
        expect(result.label).toBe('infra');
        expect(result.confidence).toBeGreaterThan(0.5);
    })


    it('labels infra when test passed on retry in same run', () => {
        const test = makeTest({
            finalStatus: 'passed',
            flaky: true,
            attempts: [
                { attemptIndex: 0, source: 'original', status: 'failed', env: {}, metadata: {} },
                { attemptIndex: 1, source: 'framework_retry', status: 'passed', env: {}, metadata: {}}
            ]
        });

        const result = detectTest(test, makeHistory());
        expect(result.label).toBe('flaky');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    })

    it('returns unknown when not enough history', () => {
        const test = makeTest();
        const history = makeHistory({ distinctCommits: 3, failedCommits: 2});
        const result = detectTest(test, history);

        expect(result.label).toBe('unknown');
        expect(result.reason).toMatch(/not enough history/i);
    })

    it('labels regression when Wilson score is high', () => {
        const test = makeTest();
        const history = makeHistory({ distinctCommits: 100, failedCommits: 90});
        const result = detectTest(test, history);

        expect(result.label).toBe('regression');
    })

    it('labels flaky when Wilson score is in flaky range', () => {
        const test = makeTest();
        const history = makeHistory({ distinctCommits: 100, failedCommits: 30});
        const result = detectTest(test, history);

        expect(result.label).toBe('flaky');
    })

    it('returns unknown for a currently failing test with clean history', () => {
        const test = makeTest({ finalStatus: 'failed'});
        const history = makeHistory({ distinctCommits: 100, failedCommits: 1});
        
        const result = detectTest(test, history);
        expect(result.label).toBe('unknown');
        expect(result.reason).toMatch(/new regression/i);
    })

    it('sets watchlist true for passing test with past failures', () => {
        const test = makeTest({
            finalStatus: 'passed',
            flaky: false,
            attempts: [{
                attemptIndex: 0,
                source: 'original',
                status: 'passed',
                env: {},
                metadata: {}
            }]
        });
        const history = makeHistory({ distinctCommits: 100, failedCommits: 20});
        const result = detectTest(test, history);

        expect(result.watchlist).toBe(true);
    })

    it('infra check takes priority over retry signal', () => {
        const test = makeTest({
            finalStatus: 'passed',
            flaky: true,
            attempts: [
                {
                    attemptIndex: 0, source: 'original', status: 'failed',
                    errorMessage: 'connect ECONNREFUSED 127.0.0.1:3000',
                    env: {}, metadata: {}
                },
                { attemptIndex: 1, source: 'framework_retry', status: 'passed', env: {}, metadata: {}}
            ]
        });

        const result = detectTest(test, makeHistory());
        expect(result.label).toBe('infra');
    })
})