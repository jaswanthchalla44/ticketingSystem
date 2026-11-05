import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TicketDetail } from '@/lib/api/types';
import { TriageBadge } from './TicketBadges';
import { isTriagePending } from './triage';

interface TriagePanelProps {
  ticket: TicketDetail;
  isStaff: boolean;
  timedOut: boolean;
  onUseSuggestedReply: (text: string) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function TriagePanel({ ticket, isStaff, timedOut, onUseSuggestedReply }: TriagePanelProps) {
  const pending = isTriagePending(ticket);

  return (
    <Card
      title="Triage"
      description={pending ? undefined : 'How we read this request. Staff can change the category and priority.'}
      actions={<TriageBadge ticket={ticket} showReason={isStaff} />}
    >
      {pending ? (
        <div role="status" className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {timedOut
              ? 'Triage is taking longer than usual. Refresh the page. If it stays pending, tell an admin.'
              : 'We are reading your request. Category, priority and a summary appear here in a few seconds.'}
          </p>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">{ticket.category}</Field>
          <Field label="Priority">{ticket.priority}</Field>
          <Field label="Sentiment">{ticket.sentiment ?? 'Not set'}</Field>
          {ticket.summary && (
            <div className="sm:col-span-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-2">Summary</dt>
              <dd className="mt-0.5 text-sm text-ink">{ticket.summary}</dd>
            </div>
          )}
          {isStaff && ticket.category_requested !== ticket.category && (
            <p className="text-sm text-ink-2 sm:col-span-3">
              The requester chose <span className="font-medium text-ink">{ticket.category_requested}</span>.
            </p>
          )}
        </dl>
      )}

      {isStaff && !pending && ticket.triage_source === 'rules' && ticket.triage_error && (
        <p className="mt-4 text-sm text-ink-2">
          AI triage did not finish, so rules were applied. Reason: <code className="text-xs">{ticket.triage_error}</code>
        </p>
      )}

      {isStaff && ticket.suggested_reply && (
        <div className="mt-5 rounded-lg border border-line bg-page p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-2">Suggested reply</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{ticket.suggested_reply}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => onUseSuggestedReply(ticket.suggested_reply ?? '')}>
              Use this reply
            </Button>
            <span className="text-xs text-ink-2">Fills the reply box. Nothing is sent until you press Send.</span>
          </div>
        </div>
      )}
    </Card>
  );
}
