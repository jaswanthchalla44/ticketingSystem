import { lazy, Suspense, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/context';
import { ApiError } from '@/lib/api/client';
import { homePathFor } from '@/lib/roles';
import type { SignInResult } from '@/lib/auth/context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Skeleton';

// Chosen at build time. Only VITE_AUTH_MODE=local enables it; in every other build this is a constant false, so the local sign-in module, its demo users and its copy are never bundled.
const LOCAL_SIGN_IN = import.meta.env.VITE_AUTH_MODE === 'local';
const LocalSignIn = LOCAL_SIGN_IN ? lazy(() => import('./LocalSignIn')) : null;

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Sign-in failed. Check your details and try again.';
}

function fromState(state: unknown): string | undefined {
  if (typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string') return state.from;
  return undefined;
}

function CognitoSignIn() {
  const { signInCognito } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState<null | ((value: string) => Promise<void>)>(null);
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (newPassword) {
        await newPassword(replacement);
      } else {
        const result: SignInResult = await signInCognito(username.trim(), password);
        if (result.kind === 'new-password') setNewPassword(() => result.completeNewPassword);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  if (newPassword) {
    return (
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <p className="text-sm text-ink-2">Your account needs a new password before you can continue.</p>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          required
        />
        {error && <p role="alert" className="text-sm text-critical-text">{error}</p>}
        <Button type="submit" busy={busy}>
          Set password and sign in
        </Button>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        required
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-critical-text">
          {error}
        </p>
      )}
      <Button type="submit" busy={busy} disabled={!username.trim() || !password}>
        Sign in
      </Button>
    </form>
  );
}

export function LoginPage() {
  const { status, mode, user } = useAuth();
  const location = useLocation();
  const from = fromState(location.state);

  if (status === 'signed-in' && user) return <Navigate to={from ?? homePathFor(user.role)} replace />;

  return (
    <div className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-ink">Helpdesk Pro</h1>
          <p className="mt-1 text-sm text-ink-2">Submit a request and follow it until it is solved.</p>
        </div>
        <Card title={LOCAL_SIGN_IN && mode === 'local' ? 'Sign in to the local preview' : 'Sign in'}>
          {mode === 'local' && LocalSignIn ? (
            <Suspense fallback={<SkeletonRows rows={3} label="Loading demo accounts" />}>
              <LocalSignIn />
            </Suspense>
          ) : (
            <CognitoSignIn />
          )}
        </Card>
      </div>
    </div>
  );
}
