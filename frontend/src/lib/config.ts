// Build-time configuration. Only public values belong here; the browser can read all of them.

export type AuthMode = 'local' | 'cognito';

// Fails closed: only an explicit VITE_AUTH_MODE=local enables the dev sign-in. Anything else (unset, typo) is Cognito.
export const AUTH_MODE: AuthMode = import.meta.env.VITE_AUTH_MODE === 'local' ? 'local' : 'cognito';

/** Base URL for API calls. Empty means same origin, which is how CloudFront and the Vite proxy serve /api. */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const COGNITO_CONFIG = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  region: import.meta.env.VITE_COGNITO_REGION ?? '',
};

export const THEME_STORAGE_KEY = 'helpdesk.theme';
export const DEV_USER_STORAGE_KEY = 'helpdesk.devUser';
