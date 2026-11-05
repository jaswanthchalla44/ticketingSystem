import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { ApiError } from '@/lib/api/client';
import type { Role } from '@/lib/roles';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DEMO_USERS } from './demoUsers';

const ROLE_ORDER: readonly Role[] = ['Admin', 'Agent', 'Customer'];

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Sign-in failed. Check your details and try again.';
}

/** Local preview only. LoginPage imports this module only in builds where VITE_AUTH_MODE is exactly local. */
export default function LocalSignIn() {
  const { signInLocal } = useAuth();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(email: string) {
    setBusyEmail(email);
    setError(null);
    try {
      await signInLocal(email);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-2">
        Pick a demo account. This preview runs on your machine against seeded data, so nothing here reaches AWS.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-critical/50 bg-critical/10 p-3 text-sm text-ink">
          {error}
        </p>
      )}
      {ROLE_ORDER.map((role) => (
        <section key={role} aria-labelledby={`demo-${role}`} className="flex flex-col gap-2">
          <h3 id={`demo-${role}`} className="text-xs font-semibold uppercase tracking-wide text-ink-2">
            {role === 'Customer' ? 'Customers' : `${role}s`}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {DEMO_USERS.filter((user) => user.role === role).map((user) => (
              <li key={user.email}>
                <Button
                  variant="secondary"
                  className="w-full justify-between text-left"
                  busy={busyEmail === user.email}
                  disabled={busyEmail !== null}
                  onClick={() => void choose(user.email)}
                >
                  <span className="min-w-0 truncate">
                    {user.name}
                    <span className="block truncate text-xs font-normal text-ink-2">{user.email}</span>
                  </span>
                  <Badge>{user.role}</Badge>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
