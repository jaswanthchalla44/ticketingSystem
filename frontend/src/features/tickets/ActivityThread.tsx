// Comments and timeline events in one list, oldest first. The API already hides what each role may not see.
import { Badge } from '@/components/ui/Badge';
import { formatDateTime, parseTimestamp } from '@/features/common/format';
import type { Comment, TicketDetail, TimelineEntry } from '@/lib/api/types';

type Entry = { kind: 'comment'; at: string; comment: Comment } | { kind: 'event'; at: string; event: TimelineEntry };

function millis(iso: string): number {
  return parseTimestamp(iso)?.getTime() ?? 0;
}

function CommentItem({ comment }: { comment: Comment }) {
  const internal = comment.visibility === 'internal';
  return (
    <li className={`rounded-xl border p-4 ${internal ? 'border-warning/60 bg-warning/10' : 'border-line bg-surface'}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">{comment.author_name}</span>
        <span className="text-ink-2">{comment.author_role}</span>
        {internal && <Badge>Internal note</Badge>}
        <time className="ml-auto text-xs text-ink-2" dateTime={comment.created_at}>
          {formatDateTime(comment.created_at)}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
    </li>
  );
}

function EventItem({ event }: { event: TimelineEntry }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 text-sm text-ink-2">
      <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-ink-3" />
      <span className="text-ink">{event.text}</span>
      <span className="text-xs">
        {event.actor_name} · <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
      </span>
      {event.visibility === 'internal' && <Badge>Staff only</Badge>}
    </li>
  );
}

export function ActivityThread({ ticket }: { ticket: TicketDetail }) {
  const entries: Entry[] = [
    ...ticket.comments.map((comment): Entry => ({ kind: 'comment', at: comment.created_at, comment })),
    ...ticket.timeline.map((event): Entry => ({ kind: 'event', at: event.created_at, event })),
  ].sort((a, b) => millis(a.at) - millis(b.at));

  if (entries.length === 0) {
    return <p className="text-sm text-ink-2">No replies yet. We will post updates here.</p>;
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Conversation and activity">
      {entries.map((entry) =>
        entry.kind === 'comment' ? (
          <CommentItem key={`c-${entry.comment.id}`} comment={entry.comment} />
        ) : (
          <EventItem key={`e-${entry.event.id}`} event={entry.event} />
        ),
      )}
    </ol>
  );
}
