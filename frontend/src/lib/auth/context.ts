import { createContext, useContext } from 'react';
import type { Me } from '@/lib/api/types';
import type { AuthMode } from '@/lib/config';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export type SignInResult = { kind: 'ok' } | { kind: 'new-password'; completeNewPassword: (password: string) => Promise<void> };

export interface AuthState {
  mode: AuthMode;
  status: AuthStatus;
  user: Me | null;
  /** Local mode: sign in as a seeded demo user. Cognito mode: sign in with username and password. */
  signInLocal: (email: string) => Promise<void>;
  signInCognito: (username: string, password: string) => Promise<SignInResult>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
