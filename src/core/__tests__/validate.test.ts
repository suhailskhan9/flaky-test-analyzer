import { describe, it, expect } from 'vitest';
import { validateRun } from '../validate.js';
import type { Run } from '../model.js';

function makeRun(overrides: Partial<Run>): Run {
    return {
        runId: 'test-run-1',
        framework: 'vitest',
        createdAt: new Date().toISOString(),
        tests: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        timedOut: 0,
        metadata: {},
        ...overrides,
    }
}

describe('validateRun', () => {

    it('returns valid for a healthy run', () => {
        const run = makeRun({ totalTests: 10, passed: 8, failed: 2, skipped: 0})
        const result = validateRun(run);
        expect(result.status).toBe('valid');
    })

    it('returns invalid_run for an empty report', () => {
        const run = makeRun({ totalTests: 0});
        const result = validateRun(run)

        expect(result.status).toBe('invalid_run');
        expect(result.reason).toMatch(/no tests/i);
    })

    it('returns infra for mass failure (80%+ failed)', () => {
        const run = makeRun({ totalTests: 10, passed: 1, failed: 9})
        const result = validateRun(run);
        expect(result.status).toBe('infra');
        expect(result.reason).toMatch(/infra/i)
    })

    it('returns valid when failure rate is just below threshold', () => {
        const run = makeRun({ totalTests: 10, passed: 3, failed: 7})
        const result = validateRun(run);
        expect(result.status).toBe('valid');
    })

it('returns invalid_run for hook/setup failure', () => {
    const run = makeRun({ totalTests: 3, passed: 0, failed: 3, 
        tests: [
                {
                    id: 'src/api.test.ts::before all::setup',
                    filePath: 'src/api.test.ts',
                    titlePath: ['before all', 'setup'],
                    project: '',
                    attempts: [{
                        attemptIndex: 0,
                        source: 'original',
                        status: 'failed',
                        errorMessage: 'Database connection failed',
                        env: {},
                        metadata: {}
                    }],
                    finalStatus: 'failed',
                    flaky: false,
                    metadata: {},
                }
            ]
        })

    const result = validateRun(run);
    expect(result.status).toBe('invalid_run');
    expect(result.reason).toMatch(/hook/i)

    })

    it('returns invalid_run when test count drops 40%+ vs baseline', () => {
        const run = makeRun({ totalTests: 5, passed: 4, failed: 1});
        const result = validateRun(run, 10)
        expect(result.status).toBe('invalid_run')
        expect(result.reason).toMatch(/dropped/i);
    })

    it('returns valid when test count drop is below threshold', () => {
        const run = makeRun({ totalTests: 8, passed: 7, failed: 1})
        const result = validateRun(run, 10);
        expect(result.status).toBe('valid');
    })
})
