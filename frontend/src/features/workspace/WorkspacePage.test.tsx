import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { renderScreen, AGENT } from '@/test/render';
import { makeTicket } from '@/test/fixtures';
import { WorkspacePage } from './WorkspacePage';

vi.mock('@/lib/api/endpoints', () => ({
  api: { listTickets: vi.fn(), listAgents: vi.fn(), updateTicket: vi.fn() },
}));

const TICKETS = [
  makeTicket({ id: 'a', title: 'VPN drops every 10 minutes', status: 'In Progress' }),
  makeTicket({ id: 'b', title: 'Printer offline', status: 'New', priority: 'Urgent', assignee_id: undefined, assignee_name: undefined }),
];

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.mocked(api.listTickets).mockReset();
    vi.mocked(api.updateTicket).mockReset();
    vi.mocked(api.listAgents).mockResolvedValue({ items: [] });
    vi.mocked(api.listTickets).mockResolvedValue({ items: TICKETS, next_cursor: null });
  });

  it('lists tickets with search, filters and sort, and offers a Board view', async () => {
    renderScreen(<WorkspacePage />, { user: AGENT, route: '/workspace', path: '/workspace' });

    expect(await screen.findByRole('link', { name: 'VPN drops every 10 minutes' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves a card to another column from the Status menu and shows the change at once', async () => {
    vi.mocked(api.updateTicket).mockResolvedValue(makeTicket({ id: 'b', status: 'Waiting' }));
    renderScreen(<WorkspacePage />, { user: AGENT, route: '/workspace?view=board', path: '/workspace' });

    const card = (await screen.findByRole('link', { name: 'Printer offline' })).closest('article');
    if (!card) throw new Error('card not found');
    await userEvent.selectOptions(within(card).getByRole('combobox'), 'Waiting');

    await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith('b', { status: 'Waiting' }));
    const waitingColumn = screen.getByRole('region', { name: 'Waiting' });
    expect(within(waitingColumn).getByRole('link', { name: 'Printer offline' })).toBeInTheDocument();
  });

  it('puts a card back in its column when the save fails', async () => {
    vi.mocked(api.updateTicket).mockRejectedValue(new ApiError(409, 'conflict', 'conflict'));
    renderScreen(<WorkspacePage />, { user: AGENT, route: '/workspace?view=board', path: '/workspace' });

    const card = (await screen.findByRole('link', { name: 'Printer offline' })).closest('article');
    if (!card) throw new Error('card not found');
    await userEvent.selectOptions(within(card).getByRole('combobox'), 'Resolved');

    await waitFor(() => expect(api.updateTicket).toHaveBeenCalled());
    await waitFor(() => {
      const newColumn = screen.getByRole('region', { name: 'New' });
      expect(within(newColumn).getByRole('link', { name: 'Printer offline' })).toBeInTheDocument();
    });
  });
});
