// Reads the ID token's claims for the UI only. The signature is checked by API Gateway, never here.
import { highestRole, type Role } from '@/lib/roles';
import type { Me } from '@/lib/api/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return JSON.parse(atob(padded)) as unknown;
}

/** Returns the user shown in the header and used for role gating, or null if the token is not readable. */
export function userFromIdToken(jwt: string): Me | null {
  const parts = jwt.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return null;
  let claims: unknown;
  try {
    claims = decodeSegment(parts[1]);
  } catch {
    return null;
  }
  if (!isRecord(claims) || typeof claims.sub !== 'string') return null;

  const groups = Array.isArray(claims['cognito:groups'])
    ? claims['cognito:groups'].filter((group): group is string => typeof group === 'string')
    : [];
  const email = typeof claims.email === 'string' ? claims.email : '';
  const name = typeof claims.name === 'string' && claims.name ? claims.name : email;
  const role: Role = highestRole(groups);
  return { sub: claims.sub, email, name, role };
}
