import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/context';
import { isStaff } from '@/lib/roles';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/features/common/format';
import { ActivityThread } from './ActivityThread';
import { AttachmentsPanel } from './AttachmentsPanel';
import { PriorityBadge, StatusBadge } from './TicketBadges';
import { ReplyForm } from './ReplyForm';
import { StaffControls } from './StaffControls';
import { TriagePanel } from './TriagePanel';
import { useTicketDetail } from './useTicketDetail';

function shortReference(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const staff = user !== null && isStaff(user.role);
  const detail = useTicketDetail(id);
  const [replyBody, setReplyBody] = useState('');

  if (detail.state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl">
        <Skeleton className="mb-6 h-8 w-2/3" />
        <SkeletonRows rows={4} label="Loading ticket" />
      </div>
    );
  }

  if (detail.state === 'error' || !detail.ticket) {
    const notFound = detail.error?.status === 404;
    return (
      <div className="mx-auto max-w-xl">
        {notFound ? (
          <EmptyState
            title="We could not find that ticket"
            description="It may have been removed, or it belongs to someone else."
            action={
              <Link className="text-sm font-medium text-brand underline underline-offset-2" to={staff ? '/workspace' : '/tickets'}>
                Back to your tickets
              </Link>
            }
          />
        ) : (
          <ErrorState message={detail.error?.message ?? 'The ticket could not be loaded.'} onRetry={detail.refresh} />
        )}
      </div>
    );
  }

  const ticket = detail.ticket;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Link to={staff ? '/workspace' : '/tickets'} className="text-sm font-medium text-brand underline underline-offset-2">
          Back to {staff ? 'workspace' : 'my tickets'}
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span className="font-mono text-xs">{shortReference(ticket.id)}</span>
          <span aria-hidden="true">·</span>
          <span>Opened {formatDateTime(ticket.created_at)}</span>
          {staff && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {ticket.requester_name} ({ticket.requester_email})
              </span>
            </>
          )}
        </div>
        <h1 className="break-words text-2xl font-semibold text-ink">{ticket.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="text-sm text-ink-2">{ticket.category}</span>
          {staff && ticket.assignee_name && <span className="text-sm text-ink-2">Assigned to {ticket.assignee_name}</span>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Your request">
            <p className="whitespace-pre-wrap text-sm text-ink">{ticket.description}</p>
          </Card>

          <TriagePanel
            ticket={ticket}
            isStaff={staff}
            timedOut={detail.triageTimedOut}
            onUseSuggestedReply={(text) => setReplyBody((current) => (current.trim() ? `${current}\n\n${text}` : text))}
          />

          <Card title="Conversation">
            <ActivityThread ticket={ticket} />
          </Card>

          <ReplyForm ticketId={ticket.id} isStaff={staff} body={replyBody} onBodyChange={setReplyBody} onPosted={detail.refresh} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {staff && <StaffControls ticket={ticket} onChanged={detail.refresh} />}
          <AttachmentsPanel ticket={ticket} onAdded={detail.refresh} />
        </aside>
      </div>
    </div>
  );
}
