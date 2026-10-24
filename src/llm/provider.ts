import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { Config } from '../core/config.js';

function getApiKey(envName: string): string {
    const apiKey = process.env[envName];

    if (!apiKey) {
        throw new Error(`Missing required environment variable: ${envName}`);
    }

    return apiKey;
}

export function getLLMProvider(config: Config) {
    const apiKey = getApiKey(config.llm.apiKeyEnv);

    switch(config.llm.provider) {
        case 'openai':
            return createOpenAI({
                apiKey,
            })(config.llm.model);

        case 'gemini':
            return createGoogleGenerativeAI({
                apiKey,
            })(config.llm.model)

        case 'groq':
            return createOpenAI({
                apiKey,
                baseURL: 'https://api.groq.com/openai/v1',
            })(config.llm.model);

        case 'ollama':
            return createOpenAI({
                apiKey: 'ollama',
                baseURL: config.llm.baseUrl ?? 'http://localhost:11434/v1',
            })(config.llm.model);
        
        case 'mock':
            throw new Error(
                "mock provider must be handled via createMockProvider -- do not call getLLMProvider with mock"
            );

        default:
            throw new Error(`Unknown LLM provider: ${(config.llm as { provider: string }).provider}`)
    }
}