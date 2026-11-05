import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/lib/api/endpoints';
import { renderScreen, ADMIN } from '@/test/render';
import { UsersPage } from './UsersPage';

vi.mock('@/lib/api/endpoints', () => ({
  api: { listUsers: vi.fn(), updateUserRole: vi.fn() },
}));

const DANA = { user_id: '00000000-0000-4000-8000-000000000001', name: 'Dana Okoye', email: 'dana.okoye@example.test', role: 'Admin' as const, created_at: '2026-10-01T09:00:00.000000Z' };
const PRIYA = { user_id: '00000000-0000-4000-8000-000000000101', name: 'Priya Raman', email: 'priya.raman@example.test', role: 'Agent' as const, created_at: '2026-10-01T09:00:00.000000Z' };
const USERS = [DANA, PRIYA];

describe('UsersPage', () => {
  beforeEach(() => {
    vi.mocked(api.listUsers).mockResolvedValue({ items: USERS });
    vi.mocked(api.updateUserRole).mockReset();
  });

  it('lists users and blocks changing your own role', async () => {
    renderScreen(<UsersPage />, { user: ADMIN, route: '/users', path: '/users' });

    expect(await screen.findByRole('cell', { name: /Priya Raman/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Role for Dana Okoye' })).toBeDisabled();
  });

  it('asks for confirmation before changing a role, then saves it', async () => {
    vi.mocked(api.updateUserRole).mockResolvedValue({ ...PRIYA, role: 'Admin' });
    renderScreen(<UsersPage />, { user: ADMIN, route: '/users', path: '/users' });

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Role for Priya Raman' }), 'Admin');
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Change Priya Raman to Admin?' })).toBeInTheDocument();
    expect(api.updateUserRole).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Change role' }));
    await waitFor(() => expect(api.updateUserRole).toHaveBeenCalledWith(PRIYA.user_id, 'Admin'));
  });

  it('does not change anything when the confirmation is cancelled', async () => {
    renderScreen(<UsersPage />, { user: ADMIN, route: '/users', path: '/users' });

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Role for Priya Raman' }), 'Customer');
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(api.updateUserRole).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
