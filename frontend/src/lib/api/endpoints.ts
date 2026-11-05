// Every API call the app makes. Paths and shapes follow docs/API.md.
import { apiRequest, buildQuery, uploadFile } from '@/lib/api/client';
import type {
  AppUser,
  Agent,
  Attachment,
  AttachmentPresign,
  Comment,
  Dashboard,
  Me,
  NewTicket,
  Ticket,
  TicketDetail,
  TicketPage,
  TicketPatch,
  TicketQuery,
  Visibility,
} from '@/lib/api/types';
import type { Role } from '@/lib/roles';

export interface AttachmentDraft {
  filename: string;
  content_type: string;
  size: number;
}

export interface AttachmentLink {
  url: string;
  expires_in: number;
  filename: string;
}

export const api = {
  me: () => apiRequest<Me>('GET', '/me'),

  listTickets: (query: TicketQuery = {}, signal?: AbortSignal) =>
    apiRequest<TicketPage>('GET', `/tickets${buildQuery({ ...query })}`, { signal }),

  createTicket: (ticket: NewTicket) => apiRequest<Ticket>('POST', '/tickets', { body: ticket }),

  getTicket: (id: string, signal?: AbortSignal) => apiRequest<TicketDetail>('GET', `/tickets/${id}`, { signal }),

  updateTicket: (id: string, patch: TicketPatch) => apiRequest<Ticket>('PATCH', `/tickets/${id}`, { body: patch }),

  addComment: (id: string, body: string, visibility: Visibility) =>
    apiRequest<Comment>('POST', `/tickets/${id}/comments`, { body: { body, visibility } }),

  presignAttachment: (ticketId: string, draft: AttachmentDraft) =>
    apiRequest<AttachmentPresign>('POST', `/tickets/${ticketId}/attachments/presign`, { body: draft }),

  confirmAttachment: (ticketId: string, key: string) =>
    apiRequest<Attachment>('POST', `/tickets/${ticketId}/attachments/confirm`, { body: { key } }),

  attachmentLink: (ticketId: string, attachmentId: string) =>
    apiRequest<AttachmentLink>('GET', `/tickets/${ticketId}/attachments/${attachmentId}/url`),

  /** Sends the file to the presigned URL. The presign call decides the headers, so they are sent as given. */
  uploadAttachment: uploadFile,

  listAgents: () => apiRequest<{ items: Agent[] }>('GET', '/agents'),

  dashboard: () => apiRequest<Dashboard>('GET', '/dashboard'),

  listUsers: () => apiRequest<{ items: AppUser[] }>('GET', '/users'),

  updateUserRole: (sub: string, role: Role) => apiRequest<AppUser>('PATCH', `/users/${sub}`, { body: { role } }),
};
