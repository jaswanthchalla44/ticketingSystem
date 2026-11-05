import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { api } from '@/lib/api/endpoints';
import { renderScreen, CUSTOMER } from '@/test/render';
import { makeTicket } from '@/test/fixtures';
import { TicketListPage } from './TicketListPage';

vi.mock('@/lib/api/endpoints', () => ({
  api: { listTickets: vi.fn() },
}));

describe('TicketListPage (customer)', () => {
  beforeEach(() => {
    vi.mocked(api.listTickets).mockReset();
  });

  it('shows the customer their tickets with status and triage source', async () => {
    vi.mocked(api.listTickets).mockResolvedValue({
      items: [makeTicket({ title: 'VPN drops every 10 minutes', triage_source: 'ai' }), makeTicket({ id: '2', title: 'Printer offline', triage_source: undefined })],
      next_cursor: null,
    });
    renderScreen(<TicketListPage />, { user: CUSTOMER, route: '/tickets', path: '/tickets' });

    expect(await screen.findByRole('link', { name: 'VPN drops every 10 minutes' })).toBeInTheDocument();
    expect(screen.getByText('AI · claude-haiku-5-5')).toBeInTheDocument();
    expect(screen.getByText('Triage in progress')).toBeInTheDocument();
    expect(screen.queryByText(/Internal note/)).not.toBeInTheDocument();
  });

  it('shows a helpful empty state with a way to report a problem', async () => {
    vi.mocked(api.listTickets).mockResolvedValue({ items: [], next_cursor: null });
    renderScreen(<TicketListPage />, { user: CUSTOMER, route: '/tickets', path: '/tickets' });

    expect(await screen.findByRole('heading', { name: 'No tickets yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', '/tickets/new');
  });

  it('shows an error with a retry when the list fails', async () => {
    vi.mocked(api.listTickets).mockRejectedValueOnce(new Error('boom'));
    renderScreen(<TicketListPage />, { user: CUSTOMER, route: '/tickets', path: '/tickets' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
