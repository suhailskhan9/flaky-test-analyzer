import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { redact } from "./redact.js";

describe('redact - Bearer token', () => {
    it('redacts Bearer token', () => {
        const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';
        expect(redact(input)).toBe('Authorization: [REDACTED]')
    })

    it('leaves text without Bearer token unchanged', () => {
        const input = 'Authorization: Basic dXNlcjpwYXNz';
        expect(redact(input)).not.toContain('[REDACTED]')
    })
})

describe('redact - OpenAI key', () => {
    it('redacts sk- API key', () => {
        const input = 'key=sk-abcdefghijklmnopqrstuvwxyz123456';
        expect(redact(input)).toContain('[REDACTED]');
        expect(redact(input)).not.toContain('sk-');
    })

    it('leaves short sk- prefix unchanged', () => {
        const input = 'error code: sk-12';
        expect(redact(input)).not.toContain('[REDACTED]');
    })
})

describe('redact - GitHub token', () => {
  it('redacts ghp_ token', () => {
    const input = `token=ghp_${'A'.repeat(36)}`;
    expect(redact(input)).toContain('[REDACTED]');
    expect(redact(input)).not.toContain('ghp_');
  });

  it('redacts ghs_ token', () => {
    const input = `token=ghs_${'B'.repeat(36)}`;
    expect(redact(input)).toContain('[REDACTED]');
    expect(redact(input)).not.toContain('ghs_');
  });
});


describe('redact - Google key', () => {
  it('redacts AIza key', () => {
    const input = `apiKey=AIza${'C'.repeat(35)}`;
    expect(redact(input)).toContain('[REDACTED]');
    expect(redact(input)).not.toContain('AIza');
  });

  it('leaves AIza prefix that is too short unchanged', () => {
    const input = 'ref=AIza123';
    expect(redact(input)).not.toContain('[REDACTED]');
  });
});

describe('redact - AWS key', () => {
  it('redacts AKIA key', () => {
    const input = `aws_key=AKIA${'D'.repeat(16)}`;
    expect(redact(input)).toContain('[REDACTED]');
    expect(redact(input)).not.toContain('AKIA');
  });

  it('leaves AKIA prefix that is too short unchanged', () => {
    const input = 'ref=AKIA123';
    expect(redact(input)).not.toContain('[REDACTED]');
  });
});

describe('redact - email', () => {
  it('redacts email address', () => {
    const input = 'contact user@example.com for help';
    expect(redact(input)).toBe('contact [REDACTED] for help');
  });

  it('leaves text without email unchanged', () => {
    const input = 'no sensitive data here';
    expect(redact(input)).not.toContain('[REDACTED]');
  });
});

describe('redact - private IPs', () => {
  it('redacts 10.x address', () => {
    expect(redact('host: 10.0.0.1')).toBe('host: [REDACTED]');
  });

  it('redacts 192.168.x address', () => {
    expect(redact('host: 192.168.1.100')).toBe('host: [REDACTED]');
  });

  it('redacts 172.16-31.x address', () => {
    expect(redact('host: 172.16.0.1')).toBe('host: [REDACTED]');
  });

  it('leaves public IP unchanged', () => {
    expect(redact('host: 8.8.8.8')).not.toContain('[REDACTED]');
  });
});

describe('redact - process.env values', () => {
  beforeEach(() => {
    process.env['TEST_SECRET_KEY'] = 'super-secret-value-123';
  });

  afterEach(() => {
    delete process.env['TEST_SECRET_KEY'];
  });

  it('redacts live env variable value', () => {
    const input = 'connecting with super-secret-value-123 to server';
    expect(redact(input)).toContain('[REDACTED]');
    expect(redact(input)).not.toContain('super-secret-value-123');
  });

  it('leaves text not matching env values unchanged', () => {
    const input = 'no secrets here at all';
    expect(redact(input)).toBe('no secrets here at all');
  });
});