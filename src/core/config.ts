import { z } from 'zod';

export const ConfigSchema = z.object({
    version: z.literal(1),
    database: z.object({
        path: z.string().default('flaky-test-analyzer.db'),
    }).default({ path: 'flaky-test-analyzer.db' }),

    rerun: z.object({
        maxRerunsPerTest: z.number().int().min(1).max(20).default(5),
        maxRerunsPerRun: z.number().int().min(1).max(100).default(30),
        dryRun: z.boolean().default(false),
    }).default({maxRerunsPerTest: 5, maxRerunsPerRun: 30, dryRun: false }),

    llm: z.object({
        provider: z.enum(['openai-compatible', 'mock']).default('mock'),
        model: z.string().default(''),
        apiKeyEnv: z.string().default('LLM_API_KEY'),
        baseUrl: z.string().optional(),
    }).default({ provider: 'mock', model: '', apiKeyEnv: 'LLM_API_KEY' }),

    dataPolicy: z.enum(['send-logs-and-code', 'rules-only']).default('rules-only'),

    branch: z.object({
        main: z.string().default('main'),
    }).default({main: 'main'})
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
    return ConfigSchema.parse(raw);
}

export function defaultConfig(): Config {
    return ConfigSchema.parse({ version: 1 });
}