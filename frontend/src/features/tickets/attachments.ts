// Presign, PUT to S3, confirm. The browser never sends credentials to S3, and the API checks the object on confirm.
import { api, type AttachmentDraft } from '@/lib/api/endpoints';
import type { Attachment } from '@/lib/api/types';

export async function uploadAttachment(
  ticketId: string,
  file: File,
  draft: AttachmentDraft,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Attachment> {
  const presigned = await api.presignAttachment(ticketId, draft);
  await api.uploadAttachment(presigned.upload_url, presigned.headers, file, onProgress, signal);
  return api.confirmAttachment(ticketId, presigned.key);
}
