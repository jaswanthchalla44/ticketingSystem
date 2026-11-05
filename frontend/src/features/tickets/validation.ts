// Client-side checks mirror docs/API.md. The API checks again and returns field errors, which the forms show too.
import { ATTACHMENT_TYPES, CATEGORIES, type AttachmentType, type Category } from '@/lib/api/types';

export const TICKET_LIMITS = {
  titleMin: 3,
  titleMax: 140,
  descriptionMin: 10,
  descriptionMax: 5000,
} as const;

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export type TicketField = 'title' | 'description' | 'category';
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export interface TicketDraft {
  title: string;
  description: string;
  category: string;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function validateTicketDraft(draft: TicketDraft): FieldErrors<TicketField> {
  const errors: FieldErrors<TicketField> = {};
  const title = draft.title.trim();
  const description = draft.description.trim();

  if (title.length < TICKET_LIMITS.titleMin) {
    errors.title = `Title needs at least ${TICKET_LIMITS.titleMin} characters.`;
  } else if (title.length > TICKET_LIMITS.titleMax) {
    errors.title = `Title can be at most ${TICKET_LIMITS.titleMax} characters.`;
  }

  if (description.length < TICKET_LIMITS.descriptionMin) {
    errors.description = `Describe the problem in at least ${TICKET_LIMITS.descriptionMin} characters.`;
  } else if (description.length > TICKET_LIMITS.descriptionMax) {
    errors.description = `Keep the description to ${TICKET_LIMITS.descriptionMax} characters or fewer.`;
  }

  if (!isCategory(draft.category)) {
    errors.category = 'Choose the category that fits best.';
  }
  return errors;
}

export type AttachmentCheck = { ok: true; content_type: AttachmentType } | { ok: false; error: string };

const EXTENSION_TYPES: Record<string, AttachmentType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** The API requires the extension to match the content type, so the type comes from the extension. */
export function attachmentTypeFor(filename: string): AttachmentType | undefined {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return undefined;
  return EXTENSION_TYPES[filename.slice(dot + 1).toLowerCase()];
}

export function checkAttachment(file: { name: string; size: number }): AttachmentCheck {
  const contentType = attachmentTypeFor(file.name);
  if (!contentType || !(ATTACHMENT_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: 'Use a PNG, JPEG, GIF, WebP image or a PDF.' };
  }
  if (file.size === 0) return { ok: false, error: 'That file is empty. Choose another file.' };
  if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, error: 'Files must be 5 MB or smaller.' };
  return { ok: true, content_type: contentType };
}

export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.join(',');
