import { z } from 'zod';

// Attempt - one execution of a test, A test can have multiple attemps (retries).

export const AttemptSchema = z.object({ 
    attemptIndex: z.number().int().min(0),
    source: z.enum(['original', 'framework_retry', 'agent_rerun']),
    status: z.enum(['passed', 'failed', 'skipped', 'timedOut']),

    durationMs: z.number().nonnegative().optional(),
    errorMessage: z.string().optional(),
    stackTrace: z.string().optional(),

    env: z.object({
        commitSha: z.string().optional(),
        branch: z.string().optional(),
        runnerOs: z.string().optional(),
        nodeVersion: z.string().optional(),
        workerIndex: z.number().int().optional(),
        shardIndex: z.number().int().optional(),
        seed: z.number().int().optional()
    }).default({}),

    metadata: z.record(z.string(), z.unknown()).default({}),
});

export type Attempt = z.infer<typeof AttemptSchema>;

// Test - one test case inside a run. May have multiple attempts
export const TestSchema = z.object({
    id: z.string(),
    filePath: z.string(),
    titlePath: z.array(z.string()),
    project: z.string().default(''),

    attempts: z.array(AttemptSchema).min(1),

    finalStatus: z.enum(['passed', 'failed', 'skipped', 'timedOut']),
    flaky: z.boolean().default(false),

    metadata: z.record(z.string(), z.unknown()).default({})
})

export type Test = z.infer<typeof TestSchema>;

// Run - one full test report (eg: one CI job's JUnit XML output)
export const RunSchema = z.object({
    runId: z.string(),
    framework: z.string(),
    createdAt: z.string(),

    branch: z.string().optional(),
    commitSha: z.string().optional(),

    tests: z.array(TestSchema),

    totalTests: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    timedOut: z.number().int().nonnegative(),

    durationMs: z.number().nonnegative().optional(),

    metadata: z.record(z.string(), z.unknown()).default({}),
})

export type Run = z.infer<typeof RunSchema>;