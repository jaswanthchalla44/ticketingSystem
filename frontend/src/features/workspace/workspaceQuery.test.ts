import { describe, expect, it } from 'vitest';
import { makeTicket } from '@/test/fixtures';
import { parseWorkspaceFilters, sortTickets, toSearchParams, toTicketQuery } from './workspaceQuery';

describe('parseWorkspaceFilters', () => {
  it('reads valid values from the URL and ignores unknown ones', () => {
    const filters = parseWorkspaceFilters(new URLSearchParams('status=Waiting&priority=Superhigh&mine=true&sort=priority_desc&q=vpn'));
    expect(filters).toEqual({ q: 'vpn', status: 'Waiting', priority: undefined, category: undefined, assignee: undefined, mine: true, sort: 'priority_desc' });
  });

  it('round-trips through the URL', () => {
    const filters = parseWorkspaceFilters(new URLSearchParams('status=New&assignee=abc&sort=created_asc'));
    expect(parseWorkspaceFilters(toSearchParams(filters))).toEqual(filters);
  });
});

describe('toTicketQuery', () => {
  it('drops the assignee when "assigned to me" is on, and trims the search', () => {
    const query = toTicketQuery({ q: '  vpn  ', assignee: 'abc', mine: true, sort: 'updated_desc' });
    expect(query).toMatchObject({ q: 'vpn', mine: true });
    expect(query.assignee).toBeUndefined();
  });
});

describe('sortTickets', () => {
  const low = makeTicket({ id: 'low', priority: 'Low', created_at: '2026-11-01T09:00:00.000000Z' });
  const urgent = makeTicket({ id: 'urgent', priority: 'Urgent', created_at: '2026-11-02T09:00:00.000000Z' });
  const high = makeTicket({ id: 'high', priority: 'High', created_at: '2026-11-03T09:00:00.000000Z' });

  it('puts the most urgent first when sorted by priority', () => {
    expect(sortTickets([low, high, urgent], 'priority_desc').map((ticket) => ticket.id)).toEqual(['urgent', 'high', 'low']);
  });

  it('sorts by creation date in both directions without changing the input', () => {
    const input = [high, low, urgent];
    expect(sortTickets(input, 'created_asc').map((ticket) => ticket.id)).toEqual(['low', 'urgent', 'high']);
    expect(sortTickets(input, 'created_desc').map((ticket) => ticket.id)).toEqual(['high', 'urgent', 'low']);
    expect(input[0]?.id).toBe('high');
  });
});
