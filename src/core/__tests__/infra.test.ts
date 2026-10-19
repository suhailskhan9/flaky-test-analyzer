import { describe, it, expect } from "vitest";
import { classifyInfra, classifyTestsInfra } from "../infra.js";
import type { Run } from '../model.js';

describe('classifyInfra', () => {
    it('detects ECONNREFUSED as network', () => {
        const result = classifyInfra('connect ECONNREFUSED 127.0.0.1:3000', undefined);
        expect(result.label).toBe('network')
    })

    it('detects heap out of memory as oom', () => {
        const result = classifyInfra('FATAL ERROR: JavaScript heap out of memory', undefined);
        expect(result.label).toBe('oom')
    })

    it('detects getaddrinfo as dns', () => {
        const result = classifyInfra('getaddrinfo ENOTFOUND api.example.com', undefined);
        expect(result.label).toBe('dns')
    })

    it('detects browser crash', () => {
        const result = classifyInfra('Browser closed unexpectedly', undefined);
        expect(result.label).toBe('browser_crash')
    })

    it('detects runner lost', () => {
        const result = classifyInfra('The operation was canceled', undefined);
        expect(result.label).toBe('runner_lost')
    })

    it('detects EADDRINUSE as app_start', () => {
        const result = classifyInfra('Error: listen EADDRINUSE: address already in use ::::3000', undefined);
        expect(result.label).toBe('app_start')
    })

    it('returns none for a normal assertion error', () => {
        const result = classifyInfra('Expected 3 but got 2', undefined);
        expect(result.label).toBe('none')
    })

    it('returns none for empty input', () => {
        const result = classifyInfra(undefined, undefined);
        expect(result.label).toBe('none')
    })

    it('matches pattern in stack trace too', () => {
        const result = classifyInfra('Test failed', 'Error: connect ECONNREFUSED 127.0.0.1:3000\n at Socket.connect');
        expect(result.label).toBe('network')
    })
    
})

describe('classifyTestsInfra', () => {
    it('returns only failed tests with infra patterns', () => {
        const run: Run = {
            runId: 'r1',
            framework: 'vitest',
            createdAt: new Date().toISOString(),
            totalTests: 3,
            passed: 1,
            failed: 2,
            skipped: 0,
            timedOut: 0,
            metadata: {},
            tests: [
                {
                    id: 'src/a.test.ts::passes',
                    filePath: 'src/a.test.ts',
                    titlePath: ['passes'],
                    project: '',
                    finalStatus: 'passed',
                    flaky: false,
                    metadata: {},
                    attempts: [{
                        attemptIndex: 0, source: 'original', status: 'passed',
                        env: {}, metadata: {}
                    }]
                },
                {
                    id: 'src/b.test.ts::network fail',
                    filePath: 'src/b.test.ts',
                    titlePath: ['network fail'],
                    project: '',
                    finalStatus: 'failed',
                    flaky: false,
                    metadata: {},
                    attempts: [{
                        attemptIndex: 0, source: 'original', status: 'failed',
                        errorMessage: 'connect ECONNREFUSED 127.0.0.1:3000',
                        env: {}, metadata: {}
                    }]
                },
                {
                    id: 'src/c.test.ts::real failure',
                    filePath: 'src/c.test.ts',
                    titlePath: ['real failure'],
                    project: '',
                    finalStatus: 'failed',
                    flaky: false,
                    metadata: {},
                    attempts: [{
                        attemptIndex: 0, source: 'original', status: 'failed',
                        errorMessage: 'Expected true but got false',
                        env: {}, metadata: {}
                    }]
                },
            ]
        };
    
        const results = classifyTestsInfra(run);
        expect(results).toHaveLength(1)
        expect(results[0]?.infra.label).toBe('network');
        expect(results[0]?.test.titlePath).toEqual(['network fail'])
    })
})