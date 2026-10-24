const PATTERNS: Array<{ name: string; pattern: RegExp }> = [

    { name: 'bearer', pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g },
    { name: 'openai-key', pattern: /sk-[A-Za-z0-9]{20,}/g },
    { name: 'github-pat', pattern: /ghp_[A-Za-z0-9]{36}/g},
    { name: 'github-app', pattern: /ghs_[A-Za-z0-9]{36}/g},
    { name: 'google-key', pattern: /AIza[0-9A-Za-z\-_]{35}/g },
    { name: 'aws-key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'stripe-key', pattern: /sk_live_[A-Za-z0-9]{24,}/g },
    { name: 'slack-token', pattern: /xox[baprs]-[A-Za-z0-9\-]{10,}/g },
    { name: 'email', pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
    { name: 'private-ip-10', pattern: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
    { name: 'private-ip-192', pattern: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g},
    { name: 'private-ip-172', pattern: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g}
]

function redactEnvValues(text: string): string {
    let result = text;
    for(const [key, value] of Object.entries(process.env)) {
        if(!value || value.length < 8) continue;
        if(key === 'PATH' || key === 'HOME' || key === 'USER' || key === 'SHELL') continue;
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), '[REDACTED]');
    }
    return result;
}


export function redact(text: string): string {
    let result = text;

    for(const { pattern } of PATTERNS) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, '[REDACTED]');
    }

    result = redactEnvValues(result);
    return result;
}


