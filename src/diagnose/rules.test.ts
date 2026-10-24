import { describe, it, expect } from 'vitest';
import { ruleTimeout, ruleMissingAwait, ruleHardCodedSleep, ruleSelectorRace, rulePortConflict, ruleTimeDateDependence } from './rules.js';


describe('ruleTimeout', () => {
    it('positive - matches timeout in error message', () => {
        const result = ruleTimeout('const x = 1', 'Test timed out after 5000ms');
        expect(result).not.toBeNull();
        expect(result?.rule).toBe('timeout');
    })

    it('negative - no timeout keyword', () => {
        const result = ruleTimeout('const x = 1', 'Expected true to be false');
        expect(result).toBeNull();
    });
})

describe('ruleMissingAwait', () => {
    it('positive - unawaited expect call', () => {
        const source = `
        it('test', () => {
            expect(fetchUser())
        });
    `;
    const result = ruleMissingAwait(source, '');
    expect(result).not.toBeNull();
    expect(result?.rule).toBe('missing-await')
    })

    it('negative - awaited call', () => {
        const source = `
        it('test', async () => {
            await expect(fetchUser()).resolves.toBe(true);
        });
        `;
        const result = ruleMissingAwait(source, '');
        expect(result).toBeNull();
    })
})

describe('ruleHardCodedSleep', () => {
    it('positive - setTimeout with numeric literal', () => {
        const source = `
        it('test', async () => {
            setTimeout(done, 2000)
        });
        `;
        const result = ruleHardCodedSleep(source, '');
        expect(result).not.toBeNull();
        expect(result?.rule).toBe('hard-coded-sleep');
        expect(result?.evidence[0]).toContain('2000');
    })

    it('negative - setTimeout with variable', () => {
        const source = `
        it('test', async () => {
            setTimeout(done, delay)
        });
        `;
        const result = ruleHardCodedSleep(source, '');
        expect(result).toBeNull();
    })
});

describe('ruleSelectorRace', () => {
    it('positive - querySelector not awaited', () => {
        const source = `
        it('test', () => {
            const el = querySelector('.button');
            el.click();
        });
        `;

        const result = ruleSelectorRace(source, '');
        expect(result).not.toBeNull();
        expect(result?.rule).toBe('selector-race');
    })

    it('negative - findByText is awaited', () => {
        const source = `
        it('test', async() => {
            const el = await findByText('Submit');
            el.click();
        });
        `;

        const result = ruleSelectorRace(source, '');
        expect(result).toBeNull();
    })
});

describe('rulePortConflict', () => {
    it('positive - EADDRINUSE in error message', () => {
        const result = rulePortConflict('const x = 1;', 'listen EADDRINUSE :::3000');
        expect(result).not.toBeNull();
        expect(result?.rule).toBe('port-conflict');
        expect(result?.confidence).toBe(0.9);
    });

    it('negative - unrelated error message', () => {
        const result = rulePortConflict('const x = 1;', 'Cannot read property of undefined');
        expect(result).toBeNull();
    })
});

describe('ruleTimeDateDependence', () => {
    it('positive - Date.now() in source', () => {
        const source = `
        it('test', () => {
            const ts = Date.now();
            expect(ts).toBeGreaterThan(0);
        });
        `;
        const result = ruleTimeDateDependence(source, '');
        expect(result).not.toBeNull();
    })

    it('negative - no time/date calls', () => {
        const source = `
        it('test', () => {
            expect(1 + 1).toBe(2);
        });
        `;

        const result = ruleTimeDateDependence(source, '');
        expect(result).toBeNull();
    })
});

describe('flaky-test-analyzer-ignore', () => {
    it('sets ignored: true when comment is present', () => {
        const source = `
            // flaky-test-analyzer-ignore
            it('test', () => {
                const ts = Date.now();
            });
        `;

        const result = ruleTimeDateDependence(source, '');
        expect(result).not.toBeNull();
        expect(result?.ignored).toBe(true);
    })
})