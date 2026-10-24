import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export interface RuleResult {
    rule: string;
    category: string;
    confidence: number;
    evidence: string[];
    ignored: boolean;
}

function isIgnored(source: string): boolean {
    return source.includes('// flaky-test-analyzer-ignore');
}

function tryParse(source: string): acorn.Node | null {
    try{
        return acorn.parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: false
        });
    }
    catch {
        return null;
    }
}

function getCalleeName(node: acorn.Node & { callee?: acorn.Node }): string | null {
    const callee = node.callee;
    if(!callee) return null;
    if(callee.type === 'Identifier') {
        return (callee as acorn.Node & { name: string }).name;
    }

    if(callee.type === 'MemberExpression') {
        const prop = (callee as acorn.Node & { property: acorn.Node }).property;
        if(prop.type === 'Identifier') {
            return (prop as acorn.Node & { name: string }).name;
        }
    }

    return null;
}


// rule 1
export function ruleTimeout(source: string, errorMessage: string): RuleResult | null {
    const pattern = /timeout|timed out|exceeded.*ms/i;
    if(!pattern.test(errorMessage)) return null;

    return {
        rule: 'timeout',
        category: 'async',
        confidence: 0.7,
        evidence: [`Error message matched timeout pattern: "${errorMessage}"`],
        ignored: isIgnored(source)
    }
}

// rule 2
export function ruleMissingAwait(source: string, _errorMessage: string): RuleResult | null {
    const ast = tryParse(source);
    if(!ast) return null;

    const evidence: string[] = [];

    walk.simple(ast, {
        ExpressionStatement(node: acorn.Node) {
            const expr = (node as acorn.Node & { expression: acorn.Node }).expression;
            if(expr.type === 'CallExpression') {
                const name = getCalleeName(expr as acorn.Node & { callee: acorn.Node });
                if( name && /^(expect|assert|fetch|request|query|mutate|save|find|get|post|put|delete|patch)/.test(name)) {
                    evidence.push(`Unawaited call: ${name}()`);
                }
            }
        }
    })

    if(evidence.length === 0) return null;

    return {
        rule: 'missing-await',
        category: 'async',
        confidence: 0.6,
        evidence,
        ignored: isIgnored(source)
    }
}

export function ruleHardCodedSleep(source: string, _errorMessage: string): RuleResult | null {
    const ast = tryParse(source)
    if(!ast) return null;

    const evidence: string[] = [];

    walk.simple(ast, {
        CallExpression(node: acorn.Node) {
            const name = getCalleeName(node as acorn.Node & { callee: acorn.Node });
            if( name && /^(setTimeout|sleep|wait|delay)$/.test(name)) {
                const args = (node as acorn.Node & { arguments: acorn.Node[] }).arguments;
                const firstArg = args[0];
                const secondArg = args[1];

                const numericArg = [firstArg, secondArg].find(
                    a => a?.type === 'Literal' && typeof (a as acorn.Node & { value: unknown }).value === 'number'
                );

                if(numericArg) {
                    const val = (numericArg as acorn.Node & { value: unknown }).value;
                    evidence.push(`Hard-coded-sleep: ${name}(${val})`);
                }
            }
        }
    })

    if(evidence.length === 0) return null;

    return{ 
        rule: 'hard-coded-sleep',
        category: 'async',
        confidence: 0.8,
        evidence,
        ignored: isIgnored(source)
    }
}


// rule 4
export function ruleSelectorRace(source: string, _errorMessage: string): RuleResult | null {
    const ast = tryParse(source);
    if(!ast) return null;

    const evidence: string[] = [];

    walk.simple(ast, {
        CallExpression(node: acorn.Node) {
            const name = getCalleeName(node as acorn.Node & { callee: acorn.Node });
            if(name && /^(querySelector|querySelectorAll|\$|findByText|findByRole|getByText|getByRole)$/.test(name)) {
                const start = (node as acorn.Node & { start: number}).start;
                const slice = source.slice(Math.max(0, start - 10), start);
                if(!slice.includes('await')) {
                    evidence.push(`Selector call not awaited: ${name}()`);
                }
            }
        }
    })

    if(evidence.length === 0) return null;

    return {
        rule: 'selector-race',
        category: 'dom',
        confidence: 0.65,
        evidence,
        ignored: isIgnored(source)
    }
}

// rule 5
export function rulePortConflict(source: string, errorMessage: string): RuleResult | null {
    const pattern = /EADDRINUSE|address already in use/i;
    if(!pattern.test(errorMessage)) return null;

    return{
        rule: 'port-conflict',
        category: 'environment',
        confidence: 0.9,
        evidence: [`Error message matched port conflict pattern: "${errorMessage}"`],
        ignored: isIgnored(source)
    }
}

// rule 6
export function ruleTimeDateDependence(source: string, _errorMessage: string): RuleResult | null {
    const ast = tryParse(source);
    if(!ast) return null;

    const evidence: string[] = [];
    
    walk.simple(ast, {
        NewExpression(node: acorn.Node) {
            const callee = (node as acorn.Node & { callee: acorn.Node}).callee;
            if(callee.type === 'Identifier') {
                const name = (callee as acorn.Node & { name: string }).name;
                if(name === 'Date') evidence.push('new Date() call found');
            }
        },
        CallExpression(node: acorn.Node) {
            const callee = (node as acorn.Node & { callee: acorn.Node }).callee;
            if(callee.type === 'MemberExpression') {
                const obj = (callee as acorn.Node & { object: acorn.Node}).object;
                const prop = (callee as acorn.Node & { property: acorn.Node}).property;
                if(obj.type === 'Identifier' && prop.type === 'Identifier') {
                    const objName = (obj as acorn.Node & { name: string }).name;
                    const propName = (prop as acorn.Node & { name: string }).name;

                    if(
                        (objName === 'Date' && propName === 'now') ||
                        (objName === 'Math' && propName === 'random')
                    ) {
                        evidence.push(`${objName}.${propName}() call found`)
                    }
                }
            }
        }
    })

    if(evidence.length === 0) return null;

    return {
        rule: 'time-date-dependence',
        category: 'determinism',
        confidence: 0.75,
        evidence,
        ignored: isIgnored(source)
    }
}

export function classifyWithRules(source: string, errorMessage: string): RuleResult[] {
    const runners = [
        ruleTimeout,
        ruleMissingAwait,
        ruleHardCodedSleep,
        ruleSelectorRace,
        rulePortConflict,
        ruleTimeDateDependence
    ];

    const results: RuleResult[] = [];
    for(const rule of runners) {
        const result = rule(source, errorMessage);
        if(result !== null) results.push(result);
    }

    return results;
}