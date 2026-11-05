import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { api } from '@/lib/api/endpoints';
import { renderScreen, CUSTOMER } from '@/test/render';
import { makeTicket } from '@/test/fixtures';
import { NewTicketPage } from './NewTicketPage';

vi.mock('@/lib/api/endpoints', () => ({
  api: { createTicket: vi.fn(), presignAttachment: vi.fn(), confirmAttachment: vi.fn() },
}));

describe('NewTicketPage', () => {
  beforeEach(() => {
    vi.mocked(api.createTicket).mockReset();
  });

  it('shows field errors and does not call the API when the form is incomplete', async () => {
    renderScreen(<NewTicketPage />, { user: CUSTOMER, route: '/tickets/new', path: '/tickets/new' });
    await userEvent.click(screen.getByRole('button', { name: 'Submit ticket' }));

    expect(await screen.findByText('Title needs at least 3 characters.')).toBeInTheDocument();
    expect(screen.getByText('Describe the problem in at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose the category that fits best.')).toBeInTheDocument();
    expect(api.createTicket).not.toHaveBeenCalled();
  });

  it('sends the trimmed ticket and opens it after it is created', async () => {
    vi.mocked(api.createTicket).mockResolvedValue(makeTicket({ id: 'new-id' }));
    renderScreen(<NewTicketPage />, { user: CUSTOMER, route: '/tickets/new', path: '/tickets/new' });

    await userEvent.type(screen.getByLabelText('Title'), '  Printer offline  ');
    await userEvent.type(screen.getByLabelText('Description'), 'The third floor printer shows offline.');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Hardware');
    await userEvent.click(screen.getByRole('button', { name: 'Submit ticket' }));

    await waitFor(() =>
      expect(api.createTicket).toHaveBeenCalledWith({
        title: 'Printer offline',
        description: 'The third floor printer shows offline.',
        category: 'Hardware',
      }),
    );
  });
});
