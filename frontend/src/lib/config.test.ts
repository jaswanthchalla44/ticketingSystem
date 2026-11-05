import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAuthMode(value: string): Promise<string> {
  vi.resetModules();
  vi.stubEnv('VITE_AUTH_MODE', value);
  const { AUTH_MODE } = await import('./config');
  return AUTH_MODE;
}

describe('AUTH_MODE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is local only for the exact value local', async () => {
    expect(await loadAuthMode('local')).toBe('local');
  });

  it('fails closed to cognito when the variable is unset, empty, misspelt or cognito', async () => {
    expect(await loadAuthMode('')).toBe('cognito');
    expect(await loadAuthMode('Local')).toBe('cognito');
    expect(await loadAuthMode('locla')).toBe('cognito');
    expect(await loadAuthMode('cognito')).toBe('cognito');
  });
});
