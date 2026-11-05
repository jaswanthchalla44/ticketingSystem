import { describe, expect, it } from 'vitest';
import { userFromIdToken } from './tokens';

function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

describe('userFromIdToken', () => {
  it('reads the user and the highest Cognito group', () => {
    const token = fakeJwt({ sub: 'abc', email: 'priya@example.test', name: 'Priya Raman', 'cognito:groups': ['Customer', 'Agent'] });
    expect(userFromIdToken(token)).toEqual({ sub: 'abc', email: 'priya@example.test', name: 'Priya Raman', role: 'Agent' });
  });

  it('falls back to the email as the name, and to Customer with no groups', () => {
    const token = fakeJwt({ sub: 'new-user', email: 'new@example.test' });
    expect(userFromIdToken(token)).toEqual({ sub: 'new-user', email: 'new@example.test', name: 'new@example.test', role: 'Customer' });
  });

  it('returns null for anything that is not a readable ID token', () => {
    expect(userFromIdToken('not-a-token')).toBeNull();
    expect(userFromIdToken('a.!!!.c')).toBeNull();
    expect(userFromIdToken(fakeJwt({ email: 'no-sub@example.test' }))).toBeNull();
  });
});
