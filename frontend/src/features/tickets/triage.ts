// Maps a ticket's triage fields to what the UI shows. The API leaves triage_source out while triage is pending.
import type { BadgeTone } from '@/components/ui/styles';
import type { TriageSource } from '@/lib/api/types';

export type TriageView =
  | { state: 'pending' }
  | { state: 'ai'; model?: string }
  | { state: 'rules'; reason?: string };

export interface TriageLike {
  triage_source?: TriageSource | undefined;
  triage_model?: string | null | undefined;
  triage_error?: string | undefined;
}

export function triageView(ticket: TriageLike): TriageView {
  if (ticket.triage_source === undefined) return { state: 'pending' };
  if (ticket.triage_source === 'rules') {
    return ticket.triage_error ? { state: 'rules', reason: ticket.triage_error } : { state: 'rules' };
  }
  return ticket.triage_model ? { state: 'ai', model: ticket.triage_model } : { state: 'ai' };
}

export interface TriageBadge {
  label: string;
  tone: BadgeTone;
  /** Only staff see why AI fell back. Shown as visible text in the triage panel, and as the badge tooltip. */
  reason?: string;
}

export function triageBadge(view: TriageView): TriageBadge {
  switch (view.state) {
    case 'pending':
      return { label: 'Triage in progress', tone: 'neutral' };
    case 'ai':
      return { label: view.model ? `AI · ${view.model}` : 'AI triage', tone: 'brand' };
    case 'rules':
      return { label: 'Rules', tone: 'warning', reason: view.reason };
  }
}

/** Keep polling until triage has written its source. */
export function isTriagePending(ticket: TriageLike): boolean {
  return ticket.triage_source === undefined;
}
