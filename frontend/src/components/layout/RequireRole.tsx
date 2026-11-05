import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/context';
import { homePathFor, type Role } from '@/lib/roles';
import { ErrorState } from '@/components/ui/ErrorState';

interface RequireRoleProps {
  allow: readonly Role[];
  children: ReactNode;
}

/** UI gate only. Every route is also enforced by the API. */
export function RequireRole({ allow, children }: RequireRoleProps) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allow.includes(user.role)) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <ErrorState title="You do not have access to this page" message={`Your role (${user.role}) cannot open it.`} />
        <p className="mt-4 text-sm">
          <a className="font-medium text-brand underline underline-offset-2" href={homePathFor(user.role)}>
            Go to your home page
          </a>
        </p>
      </div>
    );
  }
  return children;
}
