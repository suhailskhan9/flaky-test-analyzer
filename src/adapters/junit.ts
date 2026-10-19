import { XMLParser } from "fast-xml-parser";
import type { Run, Test, Attempt} from '../core/model.ts'
import { randomUUID } from "node:crypto";


export function buildTestId(filePath: string, titlePath: string[], project=''): string {
    return [filePath, ...titlePath, project].join("::");
}

function toArray<T>(val: T | T[] | undefined): T[] {
    if(val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
}

function detectFramework(suites: RawSuite[]): string {
    for (const s of suites) {
        const name = (s['@_name'] ?? '').toLowerCase();
        if(name.includes('vitest')) return 'vitest';
        if(name.includes('jest')) return 'jest';
        if(name.includes('pytest')) return 'pytest';
        if(name.includes('mocha')) return 'mocha';
    }

    return 'unknown';
}
// Raw XML types, what fast-xml-parser gives us
interface RawFailure {
    '#text'?: string;
    '@_message'?: string;
    '@_type'?: string;
}

interface RawTestCase {
    '@_name': string;
    '@_classname'?: string;
    '@_file'?: string;
    '@_time'?: string | number;
    failure?: RawFailure | RawFailure[];
    error?: RawFailure | RawFailure[];
    skipped?: unknown;
    'system-out'?: string;
}

interface RawSuite {
    '@_name'?: string;
    '@_time'?: string | number;
    '@_timestamp'?: string;
    testcase?: RawTestCase | RawTestCase[];
    testsuite?: RawSuite | RawSuite[];
}

interface RawRoot {
    testsuites?: { testsuite?: RawSuite | RawSuite[] };
    testsuite?: RawSuite | RawSuite[];
}

function parseAttempt(tc: RawTestCase, attemptIndex: number): Attempt {
    const failures = toArray(tc.failure).concat(toArray(tc.error));
    const isSkipped = tc.skipped !== undefined;
    const durationMs = tc['@_time'] !== undefined ? Math.round(parseFloat(String(tc['@_time'])) * 1000) : undefined;

    let status: Attempt['status'] = 'passed';
    if(isSkipped) status = 'skipped';
    else if(failures.length > 0) status = 'failed';

    const errorMessage = failures[0]?.['@_message'] ?? failures[0]?.['#text']?.split('\n')[0];
    const stackTrace = failures[0]?.['#text'];

    return {
        attemptIndex,
        source: 'original',
        status,
        durationMs,
        errorMessage,
        stackTrace,
        env: {},
        metadata: {},
    }
}

function parseSuite(suite: RawSuite): Test[] {
    const tests: Test[] = [];

    const nested = toArray(suite.testsuite);
    for(const child of nested) {
        tests.push(...parseSuite(child));
    }

    const suiteName = suite['@_name'] ?? '';
    const cases = toArray(suite.testcase);

    const groups = new Map<string, RawTestCase[]>();
    for(const tc of cases) {
        const filePath = tc['@_file'] ?? tc['@_classname'] ?? suiteName;
        const key = buildTestId(filePath, [tc['@_name']]);
        const group = groups.get(key) ?? [];
        group.push(tc);
        groups.set(key, group);
    }

    for (const [, group] of groups) {
        const first = group[0];
        if(!first) continue;
        const filePath = first['@_file'] ?? first['@_classname'] ?? suiteName;
        const titlePath = [first['@_name']];

        const attempts: Attempt[] = group.map((tc, i) => {
            const attempt = parseAttempt(tc, i);

            if(i > 0) attempt.source = 'framework_retry';
            return attempt;
        })

        const lastAttempt = attempts[attempts.length - 1];
        const finalStatus = lastAttempt?.status ?? 'failed';
        const flaky = attempts.length > 1 && attempts.some(a => a.status === 'failed') && attempts.some(a => a.status === 'passed');

        tests.push({
            id: buildTestId(filePath, titlePath),
            filePath,
            titlePath,
            project: '',
            attempts,
            finalStatus,
            flaky,
            metadata: {},
        });
    }

    return tests;
}

export interface ParseOptions {
    runId?: string;
    branch?: string;
    commitSha?: string;
}

export function parseJUnit(xml: string, options: ParseOptions = {}): Run {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        isArray: (_name, jpath): boolean => {
            if(typeof jpath !== 'string') return false;
            return ['testsuites.testsuite', 'testsuite.testcase', 'testsuite.testsuite'].includes(jpath)
        }
    });

    let root: RawRoot;
    try {
        root = parser.parse(xml) as RawRoot;
    }
    catch (err) {
        throw new Error(`Failed to parse JUnit XML: ${(err as Error).message}`)
    }

    const rawSuites: RawSuite[] = root.testsuites ? toArray(root.testsuites.testsuite) : toArray(root.testsuite as RawSuite | RawSuite[]);

    if(rawSuites.length === 0) {
        throw new Error('No <testsuite> elements found in JUnit XML');
    }

    const tests: Test[] = [];
    for(const suite of rawSuites) {
        tests.push(...parseSuite(suite))
    }

    const passed = tests.filter(t => t.finalStatus === 'passed').length;
    const failed = tests.filter(t => t.finalStatus === 'failed').length;
    const skipped = tests.filter(t => t.finalStatus === 'skipped').length;
    const timedOut = tests.filter(t => t.finalStatus === 'timedOut').length;

    const framework = detectFramework(rawSuites);

    return {
        runId: options.runId ?? randomUUID(),
        framework,
        createdAt: new Date().toISOString(),
        branch: options.branch,
        commitSha: options.commitSha,
        tests,
        totalTests: tests.length,
        passed,
        failed,
        skipped,
        timedOut,
        metadata: {},
    }
}