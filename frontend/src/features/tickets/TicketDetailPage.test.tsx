import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { renderScreen, AGENT, CUSTOMER } from '@/test/render';
import { makeDetail } from '@/test/fixtures';
import { TicketDetailPage } from './TicketDetailPage';

vi.mock('@/lib/api/endpoints', () => ({
  api: { getTicket: vi.fn(), listAgents: vi.fn(), updateTicket: vi.fn(), addComment: vi.fn(), attachmentLink: vi.fn() },
}));

const ROUTE = '/tickets/11111111-1111-4111-8111-111111111111';

describe('TicketDetailPage', () => {
  beforeEach(() => {
    vi.mocked(api.getTicket).mockReset();
    vi.mocked(api.listAgents).mockResolvedValue({ items: [{ user_id: '00000000-0000-4000-8000-000000000101', name: 'Priya Raman', email: 'priya.raman@example.test', role: 'Agent' }] });
  });

  it('shows a customer the thread and triage, without staff controls or the suggested reply', async () => {
    vi.mocked(api.getTicket).mockResolvedValue(makeDetail());
    renderScreen(<TicketDetailPage />, { user: CUSTOMER, route: ROUTE, path: '/tickets/:id' });

    expect(await screen.findByRole('heading', { level: 1, name: 'VPN drops every 10 minutes' })).toBeInTheDocument();
    expect(screen.getByText('We are looking into the VPN logs now.')).toBeInTheDocument();
    expect(screen.getByText('AI · claude-haiku-5-5')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Manage' })).not.toBeInTheDocument();
    expect(screen.queryByText('Suggested reply')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Internal note/ })).not.toBeInTheDocument();
  });

  it('shows an agent the manage panel, the suggested reply and the reason for rules triage', async () => {
    vi.mocked(api.getTicket).mockResolvedValue(makeDetail({ triage_source: 'rules', triage_model: null, triage_error: 'timeout' }));
    renderScreen(<TicketDetailPage />, { user: AGENT, route: ROUTE, path: '/tickets/:id' });

    expect(await screen.findByRole('heading', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.getByText('Suggested reply')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Internal note/ })).toBeInTheDocument();
  });

  it('says so when the ticket cannot be found', async () => {
    vi.mocked(api.getTicket).mockRejectedValue(new ApiError(404, 'not_found', 'not found'));
    renderScreen(<TicketDetailPage />, { user: CUSTOMER, route: ROUTE, path: '/tickets/:id' });

    expect(await screen.findByRole('heading', { name: 'We could not find that ticket' })).toBeInTheDocument();
  });
});
