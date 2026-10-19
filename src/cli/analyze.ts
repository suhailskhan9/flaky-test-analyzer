import { readFileSync } from "node:fs";
import { parseJUnit } from "../adapters/junit.js";
import type { Test } from '../core/model.ts';

function statusIcon(status: Test['finalStatus']): string {
    switch (status) {
        case 'passed': return '✓';
        case 'failed': return '✗';
        case 'skipped': return '⏭';
        case 'timedOut': return '⌛';
    }
}

function formatDuration(ms: number | undefined): string {
    if(ms === undefined) return '';
    if(ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`
}


function main() {
    const filePath = process.argv[2];

    if(!filePath) {
        console.error("Usage: analyze <path-to-junit-report.xml>");
        process.exit(1);
    }

    // read the file
    let xml: string;
    try {
        xml = readFileSync(filePath, 'utf-8');
    }
    catch {
        console.error(`Error: could not read file "${filePath}`);
        process.exit(1)
    }

    // parse the xml
    let run;
    try {
        run = parseJUnit(xml);
    } catch (err) {
        console.error(`Error: failed to parse JUnit XML - ${(err as Error).message}`);
        process.exit(1)
    }


    //print summary
    console.log('');
    console.log(`Framework: ${run.framework}`);
    console.log(
        `Tests:     ${run.totalTests} total | ` + 
        `${run.passed} passed  |  ` +
        `${run.failed} failed  |  ` +
        `${run.skipped} skipped   `
    )

    if(run.durationMs !== undefined) {
        console.log(`Duration:      ${formatDuration(run.durationMs)}`)
    }

    // print each test
    console.log('');
    console.log('Results:')
    for (const test of run.tests) {
        const icon = statusIcon(test.finalStatus);
        const title = test.titlePath.join(' > ');
        console.log(`   ${icon}     ${test.filePath}   ->   ${title}`)

        // print error message for failed tests
        if(test.finalStatus === 'failed') {
            const errorMsg = test.attempts[0]?.errorMessage;
            if(errorMsg) {
                console.log(`           ${errorMsg}`)
            }
        }

        // flag flaky tests (passed on retry)

        if(test.flaky) {
            console.log(`       ⚠️ passed on retry`)
        }
    }

    console.log('');

    // Exit with code 1 if any tests failed
    if(run.failed > 0) process.exit(1);
}

main();