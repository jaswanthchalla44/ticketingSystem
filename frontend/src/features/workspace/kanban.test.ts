import { describe, expect, it } from 'vitest';
import { applyStatusMove, groupByStatus, isKanbanColumn, planStatusMove } from './kanban';
import { makeTicket } from '@/test/fixtures';

describe('groupByStatus', () => {
  it('puts each ticket in its column and keeps empty columns', () => {
    const groups = groupByStatus([
      makeTicket({ id: 'a', status: 'New' }),
      makeTicket({ id: 'b', status: 'Waiting' }),
      makeTicket({ id: 'c', status: 'New' }),
    ]);
    expect(groups.New.map((ticket) => ticket.id)).toEqual(['a', 'c']);
    expect(groups.Waiting.map((ticket) => ticket.id)).toEqual(['b']);
    expect(groups['In Progress']).toEqual([]);
    expect(groups.Resolved).toEqual([]);
  });
});

describe('planStatusMove', () => {
  it('does nothing when the card is dropped on its own column', () => {
    expect(planStatusMove({ status: 'Waiting' }, 'Waiting')).toEqual({ kind: 'unchanged' });
  });

  it('describes a real move from one column to another', () => {
    expect(planStatusMove({ status: 'New' }, 'Resolved')).toEqual({ kind: 'move', from: 'New', to: 'Resolved' });
  });
});

describe('applyStatusMove', () => {
  it('changes only the moved ticket and does not mutate the input', () => {
    const before = [makeTicket({ id: 'a', status: 'New' }), makeTicket({ id: 'b', status: 'New' })];
    const after = applyStatusMove(before, 'a', 'In Progress');
    expect(after[0]?.status).toBe('In Progress');
    expect(after[1]?.status).toBe('New');
    expect(before[0]?.status).toBe('New');
  });
});

describe('isKanbanColumn', () => {
  it('accepts only the four columns', () => {
    expect(isKanbanColumn('Waiting')).toBe(true);
    expect(isKanbanColumn('Closed')).toBe(false);
  });
});
