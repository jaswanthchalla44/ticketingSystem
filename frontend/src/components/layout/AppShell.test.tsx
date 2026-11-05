import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthState } from '@/lib/auth/context';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from './AppShell';
import { authFor, CUSTOMER } from '@/test/render';

function PathProbe() {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

function app(auth: AuthState, route: string): ReactElement {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AppShell />}>
                <Route index element={<p>Home screen</p>} />
                <Route path="tickets" element={<p>Ticket list</p>} />
              </Route>
            </Routes>
            <PathProbe />
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('AppShell', () => {
  it('redirects a signed-out visitor at the index route to /login', async () => {
    render(app(authFor(null), '/'));
    expect(await screen.findByRole('heading', { name: 'Sign in to the local preview' })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('after sign-in, returns a signed-out visitor to the page they came from', () => {
    const { rerender } = render(app(authFor(null), '/tickets'));
    expect(screen.getByTestId('path')).toHaveTextContent('/login');

    rerender(app(authFor(CUSTOMER), '/login'));
    expect(screen.getByTestId('path')).toHaveTextContent('/tickets');
    expect(screen.getByText('Ticket list')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('renders the shell and the page for a signed-in user', () => {
    render(app(authFor(CUSTOMER), '/'));
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });
});
