import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '@/lib/auth/context';
import type { Me } from '@/lib/api/types';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';

interface RenderOptions {
  /** The signed-in user, or null for a signed-out session. */
  user?: Me | null;
  /** Initial URL, for example /workspace?view=board. */
  route?: string;
  /** Route pattern the screen is mounted on, so useParams works. */
  path?: string;
}

export function authFor(user: Me | null): AuthState {
  return {
    mode: 'local',
    status: user ? 'signed-in' : 'signed-out',
    user,
    signInLocal: vi.fn(() => Promise.resolve()),
    signInCognito: vi.fn(() => Promise.resolve({ kind: 'ok' as const })),
    signOut: vi.fn(),
  };
}

export function renderScreen(ui: ReactElement, { user = null, route = '/', path = '/' }: RenderOptions = {}) {
  const auth = authFor(user);
  const utils = render(
    <ThemeProvider>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={<p>Navigated away</p>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </ThemeProvider>,
  );
  return { ...utils, auth };
}

export const CUSTOMER: Me = { sub: '00000000-0000-4000-8000-000000000201', email: 'sam.okafor@example.test', name: 'Sam Okafor', role: 'Customer' };
export const AGENT: Me = { sub: '00000000-0000-4000-8000-000000000101', email: 'priya.raman@example.test', name: 'Priya Raman', role: 'Agent' };
export const ADMIN: Me = { sub: '00000000-0000-4000-8000-000000000001', email: 'dana.okoye@example.test', name: 'Dana Okoye', role: 'Admin' };
