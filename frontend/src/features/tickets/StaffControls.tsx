import { useEffect, useState } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { CATEGORIES, PRIORITIES, STATUSES, type Agent, type Category, type Priority, type Status, type Ticket, type TicketPatch } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/toast-context';
import { useAuth } from '@/lib/auth/context';

interface StaffControlsProps {
  ticket: Ticket;
  onChanged: () => void;
}

type Field = keyof TicketPatch;

export function StaffControls({ ticket, onChanged }: StaffControlsProps) {
  const toast = useToast();
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Field | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listAgents()
      .then((response) => !cancelled && setAgents(response.items))
      .catch(() => !cancelled && setAgentError('Staff list could not be loaded. Assignment is unavailable.'));
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(field: Field, patch: TicketPatch, label: string) {
    setBusy(field);
    try {
      await api.updateTicket(ticket.id, patch);
      toast.notify({ tone: 'success', title: label });
      onChanged();
    } catch (cause) {
      toast.notify({
        tone: 'error',
        title: 'The change was not saved',
        description: cause instanceof ApiError ? cause.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  const assigneeOptions = agents ?? [];
  const currentAssigneeListed = ticket.assignee_id === undefined || assigneeOptions.some((agent) => agent.user_id === ticket.assignee_id);

  return (
    <Card title="Manage" description="Changes save straight away and show in the activity list.">
      <div className="flex flex-col gap-4">
        <SelectField
          label="Status"
          value={ticket.status}
          disabled={busy === 'status'}
          onChange={(event) => void change('status', { status: event.target.value as Status }, 'Status updated')}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Priority"
          value={ticket.priority}
          disabled={busy === 'priority'}
          onChange={(event) => void change('priority', { priority: event.target.value as Priority }, 'Priority updated')}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Category"
          value={ticket.category}
          disabled={busy === 'category'}
          onChange={(event) => void change('category', { category: event.target.value as Category }, 'Category updated')}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-2">
          <SelectField
            label="Assignee"
            value={ticket.assignee_id ?? ''}
            disabled={busy === 'assignee_id' || agents === null || agentError !== null}
            hint={agentError ?? undefined}
            onChange={(event) => {
              const next = event.target.value === '' ? null : event.target.value;
              void change('assignee_id', { assignee_id: next }, next ? 'Assigned' : 'Unassigned');
            }}
          >
            <option value="">Unassigned</option>
            {!currentAssigneeListed && ticket.assignee_id && (
              <option value={ticket.assignee_id}>{ticket.assignee_name ?? 'Current assignee'}</option>
            )}
            {assigneeOptions.map((agent) => (
              <option key={agent.user_id} value={agent.user_id}>
                {agent.name}
              </option>
            ))}
          </SelectField>
          {user && ticket.assignee_id !== user.sub && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              busy={busy === 'assignee_id'}
              onClick={() => void change('assignee_id', { assignee_id: user.sub }, 'Assigned to you')}
            >
              Assign to me
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
