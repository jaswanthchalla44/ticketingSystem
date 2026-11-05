// Response and request shapes from docs/API.md. Optional fields are the ones the API hides from some roles or
// leaves out while triage is pending.
import type { Role } from '@/lib/roles';

export const STATUSES = ['New', 'In Progress', 'Waiting', 'Resolved'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = ['Login/Access', 'Email', 'Hardware', 'Network', 'Software', 'Billing', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const SENTIMENTS = ['Negative', 'Neutral', 'Positive'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const VISIBILITIES = ['public', 'internal'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const TRIAGE_SOURCES = ['ai', 'rules'] as const;
export type TriageSource = (typeof TRIAGE_SOURCES)[number];

export const ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export const ATTACHMENT_LIMIT = 10;

export interface Attachment {
  id: string;
  filename: string;
  content_type: AttachmentType;
  size: number;
  uploaded_by: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: Category;
  category_requested: Category;
  status: Status;
  priority: Priority;
  sentiment?: Sentiment;
  summary?: string;
  suggested_reply?: string;
  triage_source?: TriageSource;
  /** Model name when triage_source is `ai`, otherwise null. Visible to every role. */
  triage_model?: string | null;
  /** Short reason when AI fell back to rules. Staff only. */
  triage_error?: string;
  triaged_at?: string;
  requester_sub: string;
  requester_email: string;
  requester_name: string;
  assignee_id?: string;
  assignee_name?: string;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  first_response_at?: string;
}

export interface Comment {
  id: string;
  visibility: Visibility;
  body: string;
  author_name: string;
  author_role: Role;
  created_at: string;
}

export const EVENT_TYPES = [
  'ticket_created',
  'status_changed',
  'priority_changed',
  'category_changed',
  'assigned',
  'attachment_added',
  'triage',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface TimelineEntry {
  id: string;
  event_type: EventType;
  text: string;
  visibility: Visibility;
  actor_name: string;
  created_at: string;
}

export interface TicketDetail extends Ticket {
  comments: Comment[];
  timeline: TimelineEntry[];
}

export interface TicketPage {
  items: Ticket[];
  next_cursor: string | null;
}

export interface TicketQuery {
  status?: Status;
  priority?: Priority;
  category?: Category;
  assignee?: string;
  mine?: boolean;
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface NewTicket {
  title: string;
  description: string;
  category: Category;
}

export interface TicketPatch {
  status?: Status;
  priority?: Priority;
  category?: Category;
  assignee_id?: string | null;
}

export interface AttachmentPresign {
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
  key: string;
  expires_in: number;
  size: number;
}

export interface Agent {
  user_id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AppUser {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface Me {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

export interface DashboardAgentRow {
  agent_id: string;
  agent_name: string;
  assigned: number;
  open: number;
}

export interface Dashboard {
  total: number;
  open: number;
  resolved: number;
  by_status: Record<Status, number>;
  by_category: Record<Category, number>;
  by_agent: DashboardAgentRow[];
  unassigned: number;
  avg_first_response_seconds: number | null;
  first_response_sample: number;
  generated_at: string;
  truncated: boolean;
  row_limit: number;
}
