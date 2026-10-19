import type { Run, Test } from "./model.js";

export type InfraLabel = 
    | 'none'
    | 'network'
    | 'oom'
    | 'dns'
    | 'browser_crash'
    | 'runner_lost'
    | 'app_start';


export interface InfraResult {
    label: InfraLabel;

    matchedPattern: string | null;
}


const INFRA_PATTERNS: Array<{ label: InfraLabel; patterns: RegExp[] }> = [
    {
        label: 'oom',
        patterns: [
            /javascript heap out of memory/i,
            /allocation failed/i,
            /out of memory/i
        ]
    },
    {
        label: 'dns',
        patterns: [
            /getaddrinfo enotfound/i,
            /dns lookup failed/i,
            /enotfound/i
        ]
    },
    {
        label: 'browser_crash',
        patterns: [
            /browser closed unexpectedly/i,
            /target closed/i,
            /page crashed/i,
            /session deleted because of page crash/i
        ]
    },
    {
        label: 'runner_lost',
        patterns: [
            /the operation was canceled/i,
            /runner has stopped/i,
            /job was canceled/i,
            /lost connection to worker/i
        ]
    },
    {
        label: 'app_start',
        patterns: [
            /failed to start/i,
            /eaddrinuse/i,
            /address already in use/i
        ]
    },
    {
        label: 'network',
        patterns: [
            /econnrefused/i,
            /etimedout/i,
            /econnreset/i,
            /network timeout/i,
            /socket hang up/i
        ]
    },
]


export function classifyInfra(
    errorMessage: string | undefined,
    stackTrace: string | undefined,
): InfraResult {
    const text = [errorMessage, stackTrace].filter(Boolean).join('\n');

    if(!text.trim()) {
        return { label: 'none', matchedPattern: null}
    }

    for(const { label, patterns } of INFRA_PATTERNS) {
        for(const pattern of patterns) {
            if(pattern.test(text)) {
                return { label, matchedPattern: pattern.source };
            }
        }
    }

    return { label: 'none', matchedPattern: null};
}

export interface TestInfraResult {
    test: Test;
    infra: InfraResult;
}

export function classifyTestsInfra(run: Run): TestInfraResult[] {
    const results: TestInfraResult[] = [];

    for(const test of run.tests) {
        if(test.finalStatus !== 'failed') continue;

        const lastAttempt = test.attempts[test.attempts.length - 1];
        const infra = classifyInfra(
            lastAttempt?.errorMessage,
            lastAttempt?.stackTrace,
        )

        if(infra.label !== 'none') {
            results.push({ test, infra });
        }
    }

    return results;
}