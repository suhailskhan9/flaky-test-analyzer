import type { Run } from './model.ts';

export type ValidationStatus = 'valid' | 'invalid_run' | 'infra';

export interface ValidationResult {
    status: ValidationStatus;
    reason: string;
    details: Record<string, unknown>;
}

const MASS_FAILURE_THRESHOLD = 0.8;

const TEST_COUNT_DROP_THRESHOLD = 0.4;

const HOOK_KEYWORDS = ['before all', 'after all', 'before each', 'after each', 'hooks'];

function isHookFailure(titlePath: string[]): boolean {
    const fullTitle = titlePath.join('').toLowerCase();
    return HOOK_KEYWORDS.some(k => fullTitle.includes(k));
}


export function validateRun(run: Run, baselineTestCount?: number): ValidationResult {
    // empty report
    if(run.totalTests === 0) {
        return {
            status: 'invalid_run',
            reason: 'Report contains no tests -- the run may have crashed before collecting results',
            details: { totalTests: 0}
        }
    }

    // hook/setup failure
    const hookFailures = run.tests.filter(
        t => t.finalStatus === 'failed' && isHookFailure(t.titlePath)
    );

    if(hookFailures.length > 0) {
        return {
            status: 'invalid_run',
            reason: 'Hook or setup failure detected -- test results are unreliable',
            details: {
                hookFailures: hookFailures.map(t => t.titlePath.join(" > "))
            }
        }
    }

    // mass failure -- if 80%+ tests failed, looks like an infra problem
    const failureRate = run.failed / run.totalTests;
    if(failureRate >= MASS_FAILURE_THRESHOLD) {
        return {
            status: 'infra',
            reason: `${Math.round(failureRate * 100)}% of tests failed -- looks like an infra or env problem`,
            details: {
                failed: run.failed,
                totalTests: run.totalTests,
                failureRate: failureRate.toFixed(2)
            }
        }
    }

    //test count drop -- the run probably didn't finish or this report is incomplete
    if(baselineTestCount !== undefined && baselineTestCount > 0) {
        const dropRate = 1 - run.totalTests / baselineTestCount;
        if(dropRate >= TEST_COUNT_DROP_THRESHOLD) {
            return {
                status: 'invalid_run',
                reason: `Test count dropped by ${Math.round(dropRate*100)}% vs baseline (expected - ${baselineTestCount}, got ${run.totalTests})`,
                details: {
                    baselineTestCount,
                    actualTestCount: run.totalTests,
                    dropRate: dropRate.toFixed(2)
                }
            }
        }
    }

    // all chekcs passed
    return {
        status: 'valid',
        reason: 'Run looks healthy',
        details: { totalTests: run.totalTests }
    }

}