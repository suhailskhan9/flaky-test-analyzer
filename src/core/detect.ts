import type { Test } from "./model.js";
import { classifyInfra } from "./infra.js";
import type { InfraResult } from "./infra.js";
import type { TestHistory } from "../store/store.js";

// Types

export type DetectionLabel = 'flaky' | 'regression' | 'infra' | 'unknown';

export interface DetectionResult {
    testId: string;
    label: DetectionLabel;
    confidence: number;
    reason: string;
    watchlist: boolean;
    evidence: Evidence;
}

export interface Evidence {
    distinctCommits: number;
    failedCommits: number;
    wilsonScore: number;
    passedOnRetryInThisRun: boolean;
    infraLabel: string | null;
}


// constants

const MIN_SAMPLE_SIZE = 5;

const FLAKY_THRESHOLD = 0.15

const REGRESSION_THRESHOLD = 0.7;

const Z = 1.96;


function wilsonLowerBound(failures: number, total: number): number {
    if(total === 0) return 0;

    const p = failures / total;
    const z2 = Z * Z;

    const numerator = p + z2 / (2 * total) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    const denominator = 1 + z2 / total;
    console.log({ failures, total, p, result: Math.max(0, numerator / denominator )})

    return Math.max(0, numerator / denominator);
}


// detector

export function detectTest (
    test: Test,
    history: TestHistory,
): DetectionResult {
    const testId = test.id;

    const failedAttempt = test.attempts.filter(a => a.status === 'failed');
    const infraResult = failedAttempt.reduce<InfraResult>(
        (found, attempt) => {
            if(found.label !== 'none') return found;
            return classifyInfra(attempt.errorMessage, attempt.stackTrace)
        },
        { label: 'none', matchedPattern: null }
    )

    if(infraResult.label !== "none") {
        return {
            testId,
            label: 'infra',
            confidence: 0.9,
            reason: `Failure looks environmental: ${infraResult.label} pattern matched`,
            watchlist: false,
            evidence: {
                distinctCommits: history.distinctCommits,
                failedCommits: history.failedCommits,
                wilsonScore: 0,
                passedOnRetryInThisRun: false,
                infraLabel: infraResult.label
            }
        }
    }


    const passedOnRetryInThisRun = 
        test.flaky ||
            (test.finalStatus === 'passed' && test.attempts.some(a => a.status === 'failed'))

    const wilsonScore = wilsonLowerBound(
        history.failedCommits,
        history.distinctCommits
    )

    const evidence: Evidence = {
        distinctCommits: history.distinctCommits,
        failedCommits: history.failedCommits,
        wilsonScore: parseFloat(wilsonScore.toFixed(3)),
        passedOnRetryInThisRun,
        infraLabel: null
    }

    if(passedOnRetryInThisRun) {
        return {
            testId,
            label: 'flaky',
            confidence: 0.9,
            reason: 'Test failed then passed on retry within the same run -- classic flaky behaviour',
            watchlist: false,
            evidence
        }
    }

    if(history.distinctCommits < MIN_SAMPLE_SIZE) {
        const watchlist = test.finalStatus === 'passed' && history.failedCommits > 0;

        return {
            testId,
            label: 'unknown',
            confidence: 0,
            reason: `Not enough history to decide (${history.distinctCommits} commits seen, need ${MIN_SAMPLE_SIZE})`,
            watchlist,
            evidence,
        }
    }

    if(wilsonScore >= REGRESSION_THRESHOLD) {
        return {
            testId,
            label: 'regression',
            confidence: parseFloat(wilsonScore.toFixed(3)),
            reason: `Fails consistently - Wilson score ${wilsonScore.toFixed(2)} across ${history.distinctCommits} commits`,
            watchlist: false,
            evidence
        }
    }

    if(wilsonScore >= FLAKY_THRESHOLD) {
        return {
            testId,
            label: 'flaky',
            confidence: parseFloat(wilsonScore.toFixed(3)),
            reason: `Intermittent failures - Wilson score ${wilsonScore.toFixed(2)} across ${history.distinctCommits} commits`,
            watchlist: false,
            evidence
        }
    }

    if(test.finalStatus === 'failed') {
        return {
            testId,
            label: 'unknown',
            confidence: 0.3,
            reason: `Fails now but has a clean history - could be a new regression or one-off flake`,
            watchlist: false,
            evidence
        }
    }

    const watchlist = history.failedCommits > 0;
    return {
        testId,
        label: 'unknown',
        confidence: 0,
        reason: 'Test looks healthy',
        watchlist,
        evidence,
    }
}


export function detectRun(
    tests: Test[],
    getHistory: (testId: string) => TestHistory,
): DetectionResult[] {
    const results: DetectionResult[] = [];

    for(const test of tests) {
        if(test.finalStatus === 'failed' || test.flaky) {
            results.push(detectTest(test, getHistory(test.id)))
        }
        else if(test.finalStatus === 'passed') {
            const history = getHistory(test.id);
            if(history.failedCommits > 0) {
                results.push({
                    testId: test.id,
                    label: 'unknown',
                    confidence: 0,
                    reason: 'Passing now but has failed before - on watchlist',
                    watchlist: true,
                     evidence: {
                        distinctCommits: history.distinctCommits,
                        failedCommits: history.failedCommits,
                        wilsonScore: wilsonLowerBound(history.failedCommits, history.distinctCommits),
                        passedOnRetryInThisRun: false,
                        infraLabel: null
                     }
                })
            }
        }
    }

    return results;
}