import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/auth/context';
import { AppShell } from '@/components/layout/AppShell';
import { RequireRole } from '@/components/layout/RequireRole';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { LoginPage } from '@/features/auth/LoginPage';
import { TicketListPage } from '@/features/tickets/TicketListPage';
import { NewTicketPage } from '@/features/tickets/NewTicketPage';
import { TicketDetailPage } from '@/features/tickets/TicketDetailPage';
import { WorkspacePage } from '@/features/workspace/WorkspacePage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { UsersPage } from '@/features/users/UsersPage';
import { homePathFor, type Role } from '@/lib/roles';

function HomeRedirect() {
  const { user, status } = useAuth();
  if (status === 'loading') return <div className="p-8"><SkeletonRows rows={3} label="Loading your account" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user.role)} replace />;
}

const ANY_ROLE: readonly Role[] = ['Customer', 'Agent', 'Admin'];
const STAFF_ROLES: readonly Role[] = ['Agent', 'Admin'];

function Protected({ allow = ANY_ROLE, children }: { allow?: readonly Role[]; children: ReactNode }) {
  return <RequireRole allow={allow}>{children}</RequireRole>;
}

export function App() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-md p-8">
        <SkeletonRows rows={3} label="Checking your session" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<HomeRedirect />} />
        <Route path="tickets" element={<Protected allow={['Customer']}><TicketListPage /></Protected>} />
        <Route path="tickets/new" element={<Protected><NewTicketPage /></Protected>} />
        <Route path="tickets/:id" element={<Protected><TicketDetailPage /></Protected>} />
        <Route path="workspace" element={<Protected allow={STAFF_ROLES}><WorkspacePage /></Protected>} />
        <Route path="dashboard" element={<Protected allow={['Admin']}><DashboardPage /></Protected>} />
        <Route path="users" element={<Protected allow={['Admin']}><UsersPage /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
