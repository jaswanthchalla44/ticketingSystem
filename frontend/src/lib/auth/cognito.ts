// Cognito user pool sign-in with SRP. The client has no secret, so only the public pool and client IDs are used.
// amazon-cognito-identity-js is pinned to 6.3.22 (npm audit fix for js-cookie). Its v5 types are tagged @deprecated; migrating to Amplify v6 is a separate task.
/* eslint-disable @typescript-eslint/no-deprecated -- SDK v5 typings, see the note above */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { COGNITO_CONFIG } from '@/lib/config';

let pool: CognitoUserPool | null = null;

function getPool(): CognitoUserPool {
  if (!COGNITO_CONFIG.userPoolId || !COGNITO_CONFIG.clientId) {
    throw new Error('Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.');
  }
  pool ??= new CognitoUserPool({
    UserPoolId: COGNITO_CONFIG.userPoolId,
    ClientId: COGNITO_CONFIG.clientId,
  });
  return pool;
}

export type CognitoSignIn =
  | { kind: 'ok'; idToken: string }
  | { kind: 'new-password'; completeNewPassword: (password: string) => Promise<string> };

function sessionIdToken(session: CognitoUserSession): string {
  return session.getIdToken().getJwtToken();
}

export function signInWithSrp(username: string, password: string): Promise<CognitoSignIn> {
  const user = new CognitoUser({ Username: username, Pool: getPool() });
  const details = new AuthenticationDetails({ Username: username, Password: password });

  return new Promise<CognitoSignIn>((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve({ kind: 'ok', idToken: sessionIdToken(session) }),
      onFailure: (error: Error) => reject(error),
      newPasswordRequired: () => {
        resolve({
          kind: 'new-password',
          completeNewPassword: (newPassword: string) =>
            new Promise<string>((done, fail) => {
              user.completeNewPasswordChallenge(newPassword, {}, {
                onSuccess: (session) => done(sessionIdToken(session)),
                onFailure: (error: Error) => fail(error),
              });
            }),
        });
      },
    });
  });
}

/** Returns a current ID token, refreshing it with the refresh token when needed. Null when nobody is signed in. */
export function currentIdToken(): Promise<string | null> {
  const user = getPool().getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      if (error || !session?.isValid()) {
        resolve(null);
        return;
      }
      resolve(sessionIdToken(session));
    });
  });
}

export function signOutCognito(): void {
  getPool().getCurrentUser()?.signOut();
}
