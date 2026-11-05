import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { api } from '@/lib/api/endpoints';
import type { Dashboard } from '@/lib/api/types';
import { renderScreen, ADMIN } from '@/test/render';
import { DashboardPage } from './DashboardPage';

vi.mock('@/lib/api/endpoints', () => ({
  api: { dashboard: vi.fn() },
}));

const DATA: Dashboard = {
  total: 25,
  open: 20,
  resolved: 5,
  by_status: { New: 6, 'In Progress': 8, Waiting: 6, Resolved: 5 },
  by_category: { 'Login/Access': 4, Email: 3, Hardware: 4, Network: 4, Software: 4, Billing: 3, Other: 3 },
  by_agent: [{ agent_id: 'p', agent_name: 'Priya Raman', assigned: 7, open: 5 }],
  unassigned: 3,
  avg_first_response_seconds: 4500,
  first_response_sample: 18,
  generated_at: '2026-11-05T09:00:00.000000Z',
  truncated: false,
  row_limit: 5000,
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(api.dashboard).mockReset();
  });

  it('shows the headline numbers and the average first response', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(DATA);
    renderScreen(<DashboardPage />, { user: ADMIN, route: '/dashboard', path: '/dashboard' });

    const tiles = await screen.findByRole('region', { name: 'Key numbers' });
    expect(tiles).toHaveTextContent('Open');
    expect(tiles).toHaveTextContent('20');
    expect(tiles).toHaveTextContent('1 h 15 min');
    expect(tiles).toHaveTextContent('From 18 answered tickets');
  });

  it('offers a table twin for every bar chart and names the agents', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(DATA);
    renderScreen(<DashboardPage />, { user: ADMIN, route: '/dashboard', path: '/dashboard' });

    expect(await screen.findByRole('cell', { name: 'Priya Raman' })).toBeInTheDocument();
    expect(screen.getAllByText('View as table')).toHaveLength(2);
  });

  it('warns when the figures only cover the first 5000 tickets', async () => {
    vi.mocked(api.dashboard).mockResolvedValue({ ...DATA, truncated: true });
    renderScreen(<DashboardPage />, { user: ADMIN, route: '/dashboard', path: '/dashboard' });

    expect(await screen.findByText(/first 5,000 tickets/)).toBeInTheDocument();
  });

  it('shows "None yet" when no ticket has a public reply', async () => {
    vi.mocked(api.dashboard).mockResolvedValue({ ...DATA, avg_first_response_seconds: null, first_response_sample: 0 });
    renderScreen(<DashboardPage />, { user: ADMIN, route: '/dashboard', path: '/dashboard' });

    expect(await screen.findByText('None yet')).toBeInTheDocument();
  });
});
