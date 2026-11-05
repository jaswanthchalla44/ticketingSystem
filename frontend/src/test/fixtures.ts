import type { Comment, Ticket, TicketDetail, TimelineEntry } from '@/lib/api/types';

const NOW = '2026-11-05T09:00:00.000000Z';

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'VPN drops every 10 minutes',
    description: 'The VPN disconnects roughly every ten minutes when I work from home.',
    category: 'Network',
    category_requested: 'Network',
    status: 'In Progress',
    priority: 'High',
    sentiment: 'Negative',
    summary: 'VPN disconnects repeatedly for a remote user.',
    suggested_reply: 'Thanks for the details. We are checking the VPN gateway logs.',
    triage_source: 'ai',
    triage_model: 'claude-haiku-5-5',
    requester_sub: '00000000-0000-4000-8000-000000000201',
    requester_email: 'sam.okafor@example.test',
    requester_name: 'Sam Okafor',
    assignee_id: '00000000-0000-4000-8000-000000000101',
    assignee_name: 'Priya Raman',
    attachments: [],
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  const comments: Comment[] = [
    {
      id: 'c-1',
      visibility: 'public',
      body: 'We are looking into the VPN logs now.',
      author_name: 'Priya Raman',
      author_role: 'Agent',
      created_at: '2026-11-05T08:30:00.000000Z',
    },
  ];
  const timeline: TimelineEntry[] = [
    {
      id: 'e-1',
      event_type: 'ticket_created',
      text: 'Ticket created',
      visibility: 'public',
      actor_name: 'Sam Okafor',
      created_at: '2026-11-05T08:00:00.000000Z',
    },
  ];
  return { ...makeTicket(), comments, timeline, ...overrides };
}
