import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnit } from '../junit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('parseJUnit', () => {
    it('parses basic pass and fail', () => { 
        const run = parseJUnit(fixture('basic.xml'));
        expect(run.totalTests).toBe(2);
        expect(run.passed).toBe(1);
        expect(run.failed).toBe(1);

        const failed = run.tests.find(t => t.finalStatus === 'failed')
        expect(failed?.titlePath).toEqual(['subtracts numbers']);
        expect(failed?.attempts[0]?.errorMessage).toBe('Expected 3 but got 2');
    });
    
    it('parses skipped tests', () => {
        const run = parseJUnit(fixture('skipped.xml'));
        expect(run.totalTests).toBe(2)
        expect(run.skipped).toBe(1);

        const skipped = run.tests.find(t => t.finalStatus === 'skipped');
        expect(skipped?.titlePath).toEqual(['skipped for now'])
    })

    it('merges framework retries into attempts', () => {
        const run = parseJUnit(fixture('retries.xml'));

        expect(run.totalTests).toBe(1);

        const test = run.tests[0];
        expect(test?.attempts).toHaveLength(2);
        expect(test?.attempts[0]?.source).toBe('original');
        expect(test?.attempts[1]?.source).toBe('framework_retry');
        expect(test?.flaky).toBe(true);
    })

    it('treats parameterized tests as separate tests', () => {
        const run = parseJUnit(fixture('parameterized.xml'));
        expect(run.totalTests).toBe(3);
        expect(run.failed).toBe(1);
        expect(run.passed).toBe(2);
    })

    it('throws a clean error on malformed XML', () => {
        expect(() => parseJUnit(fixture('malformed.xml'))).toThrow();
    })

    it('attaches runId and commitSha from options', () => {
        const run = parseJUnit(fixture('basic.xml'),{
            runId: 'run-123',
            commitSha: 'abc123',
            branch: 'main'
        });

        expect(run.runId).toBe('run-123');
        expect(run.commitSha).toBe('abc123');
        expect(run.branch).toBe('main')
    })
})