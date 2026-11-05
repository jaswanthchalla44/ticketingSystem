// Which colour each status, priority and triage state gets. Every badge also shows its text.
import type { BadgeTone } from '@/components/ui/styles';
import type { Priority, Status } from '@/lib/api/types';

export const STATUS_TONE: Record<Status, BadgeTone> = {
  New: 'brand',
  'In Progress': 'neutral',
  Waiting: 'warning',
  Resolved: 'good',
};

export const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  Urgent: 'critical',
  High: 'serious',
  Medium: 'neutral',
  Low: 'neutral',
};
