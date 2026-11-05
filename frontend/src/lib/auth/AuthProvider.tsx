import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/endpoints';
import { configureApiAuth } from '@/lib/api/client';
import { AUTH_MODE, DEV_USER_STORAGE_KEY } from '@/lib/config';
import type { Me } from '@/lib/api/types';
import { AuthContext, type AuthState, type AuthStatus, type SignInResult } from './context';
import { currentIdToken, signInWithSrp, signOutCognito } from './cognito';
import { userFromIdToken } from './tokens';

function storedDevUser(): string | null {
  return localStorage.getItem(DEV_USER_STORAGE_KEY);
}

async function authHeaders(): Promise<Record<string, string>> {
  if (AUTH_MODE === 'local') {
    const email = storedDevUser();
    return email ? { 'X-Dev-User': email } : {};
  }
  const token = await currentIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<Me | null>(null);

  const signedOut = useCallback(() => {
    localStorage.removeItem(DEV_USER_STORAGE_KEY);
    if (AUTH_MODE === 'cognito') signOutCognito();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const signedIn = useCallback((me: Me) => {
    setUser(me);
    setStatus('signed-in');
  }, []);

  // Runs before any child effect that calls the API, and before children mount (the status starts as 'loading').
  useEffect(() => {
    configureApiAuth(authHeaders, () => {
      if (status === 'signed-in') signedOut();
    });
  }, [status, signedOut]);

  // Restore the previous session on load.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        if (AUTH_MODE === 'local') {
          if (!storedDevUser()) {
            setStatus('signed-out');
            return;
          }
          const me = await api.me();
          if (!cancelled) signedIn(me);
          return;
        }
        const token = await currentIdToken();
        const me = token ? userFromIdToken(token) : null;
        if (cancelled) return;
        if (me) signedIn(me);
        else setStatus('signed-out');
      } catch {
        if (!cancelled) signedOut();
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [signedIn, signedOut]);

  const signInLocal = useCallback(
    async (email: string) => {
      localStorage.setItem(DEV_USER_STORAGE_KEY, email);
      try {
        signedIn(await api.me());
      } catch (error) {
        localStorage.removeItem(DEV_USER_STORAGE_KEY);
        throw error;
      }
    },
    [signedIn],
  );

  const signInCognito = useCallback(
    async (username: string, password: string): Promise<SignInResult> => {
      const result = await signInWithSrp(username, password);
      const finish = (idToken: string) => {
        const me = userFromIdToken(idToken);
        if (!me) throw new Error('Sign-in worked, but the account details could not be read. Contact an admin.');
        signedIn(me);
      };
      if (result.kind === 'ok') {
        finish(result.idToken);
        return { kind: 'ok' };
      }
      return {
        kind: 'new-password',
        completeNewPassword: async (password: string) => finish(await result.completeNewPassword(password)),
      };
    },
    [signedIn],
  );

  const value = useMemo<AuthState>(
    () => ({ mode: AUTH_MODE, status, user, signInLocal, signInCognito, signOut: signedOut }),
    [status, user, signInLocal, signInCognito, signedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
