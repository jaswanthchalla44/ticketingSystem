import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderScreen } from '@/test/render';
import { LoginPage } from './LoginPage';

describe('LoginPage (local preview)', () => {
  it('lists the seeded users grouped by role', async () => {
    renderScreen(<LoginPage />, { route: '/login', path: '/login' });
    expect(screen.getByRole('heading', { name: 'Sign in to the local preview' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Dana Okoye/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sam Okafor/ })).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(3);
  });

  it('signs in as the chosen seeded user', async () => {
    const { auth } = renderScreen(<LoginPage />, { route: '/login', path: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: /Sam Okafor/ }));
    expect(auth.signInLocal).toHaveBeenCalledWith('sam.okafor@example.test');
  });
});
