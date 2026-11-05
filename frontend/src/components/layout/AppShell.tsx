import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/context';
import { canManageUsers, canSeeDashboard, canUseWorkspace, homePathFor, ROLE_LABELS, isStaff, type Role } from '@/lib/roles';
import { THEME_PREFERENCES, useTheme, type ThemePreference } from '@/lib/theme/context';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FIELD_CONTROL } from '@/components/ui/styles';

interface NavItem {
  to: string;
  label: string;
  show: (role: Role) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/tickets', label: 'My tickets', show: (role) => !isStaff(role) },
  { to: '/tickets/new', label: 'New ticket', show: () => true },
  { to: '/workspace', label: 'Workspace', show: canUseWorkspace },
  { to: '/dashboard', label: 'Dashboard', show: canSeeDashboard },
  { to: '/users', label: 'Users', show: canManageUsers },
];

const THEME_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span className="hidden sm:inline">Theme</span>
      <select
        aria-label="Theme"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
        className={`${FIELD_CONTROL} w-auto max-w-full py-1.5 text-sm`}
      >
        {THEME_PREFERENCES.map((option) => (
          <option key={option} value={option}>
            {THEME_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppShell() {
  const { user, mode, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer after navigation on small screens.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const items = NAV_ITEMS.filter((item) => item.show(user.role));

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/tickets/new'}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
              isActive ? 'bg-brand/15 text-ink' : 'text-ink-2 hover:bg-page hover:text-ink'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ☰
            </span>
            <span className="sr-only">Menu</span>
          </Button>
          <span className="min-w-0 truncate text-base font-semibold text-ink">Helpdesk Pro</span>
          {mode === 'local' && (
            <span className="hidden md:inline-flex">
              <Badge tone="warning">Local preview</Badge>
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <ThemeSwitch />
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="text-xs text-ink-2">{ROLE_LABELS[user.role]}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {menuOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          id="app-sidebar"
          className={`${menuOpen ? 'fixed inset-y-0 left-0 z-40 mt-[57px] flex' : 'hidden'} w-60 flex-col gap-4 border-r border-line bg-surface p-4 lg:sticky lg:top-[57px] lg:flex lg:h-[calc(100dvh-57px)] lg:shrink-0`}
        >
          {nav}
          <p className="mt-auto text-xs text-ink-3">
            <a className="underline underline-offset-2" href={homePathFor(user.role)}>
              Home
            </a>
          </p>
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
