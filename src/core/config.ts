import { z } from 'zod';

export const ConfigSchema = z.object({
    version: z.literal(1),
    database: z.object({
        path: z.string().default('flaky-test-analyzer.db'),
    }).default({ path: 'flaky-test-analyzer.db' }),

    storage: z.object({
        mode: z.enum(['local', 'ci']).default('local')
    }).default({ mode: 'local' }),

    github: z.object({
        token: z.string().default(''),
        owner: z.string().default(''),
        repo: z.string().default(''),
        artifactName: z.string().default('test-results'),
        retentionDays: z.number().int().default(30)
    }).default({
        token: '',
        owner: '',
        repo: '',
        artifactName: 'test-results',
        retentionDays: 30
    }),

    llm: z.object({
        provider: z.enum(['openai', 'gemini', 'groq', 'ollama', 'mock']).default('mock'),
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