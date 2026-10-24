export function createMockProvider(responses: Record<string, string> = {}) {
    const DEFAULT_RESPONSE = '{"insufficientEvidence":true}';

    function getResponse(input: string): string {
        for(const [trigger, response] of Object.entries(responses)) {
            if(input.includes(trigger)) return response;
        }
        return DEFAULT_RESPONSE;
    }

    return {
        doGenerate: async (options: {prompt: { text?: string}[] }) => {
            const input = options.prompt.map(p => p.text ?? '').join(' ');
            const text = getResponse(input);
            return {
                text,
                finishReason: 'stop',
                usage: { promptTokens: 0, completionTokens: 0 },
                rawCall: { rawPrompt: null, rawSettings: {} },
            }
        },

        doStream: async (options: { prompt: { text?: string }[] }) => {
            const input = options.prompt.map(p => p.text ?? '').join(' ');
            const text = getResponse(input);
            return {
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({ type: 'text-delta', textDelta: text });
                        controller.enqueue({
                            type: 'finish',
                            finishReason: 'stop',
                            usage: { promptTokens: 0, completionTokens: 0},
                        });
                        controller.close();
                    }
                }),
                rawCall: { rawPrompt: null, rawSettings: {} }
            }
        }
    }
}