import { Badge } from '@/components/ui/Badge';
import type { Priority, Status } from '@/lib/api/types';
import { PRIORITY_TONE, STATUS_TONE } from './tones';
import { triageBadge, triageView, type TriageLike } from './triage';

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{`${priority} priority`}</Badge>;
}

/** Says where the category, priority and summary came from. Staff get the reason in the tooltip too. */
export function TriageBadge({ ticket, showReason }: { ticket: TriageLike; showReason: boolean }) {
  const badge = triageBadge(triageView(ticket));
  const title = showReason && badge.reason ? `AI unavailable, rules used: ${badge.reason}` : undefined;
  return (
    <Badge tone={badge.tone} title={title}>
      {badge.label}
    </Badge>
  );
}
