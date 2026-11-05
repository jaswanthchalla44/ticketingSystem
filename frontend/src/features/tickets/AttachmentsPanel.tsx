import { useRef, useState } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { ATTACHMENT_LIMIT, type Attachment, type Ticket } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { formatBytes, formatDateTime } from '@/features/common/format';
import { uploadAttachment } from './attachments';
import { ATTACHMENT_ACCEPT, checkAttachment } from './validation';

interface AttachmentsPanelProps {
  ticket: Ticket;
  onAdded: () => void;
}

export function AttachmentsPanel({ ticket, onAdded }: AttachmentsPanelProps) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const full = ticket.attachments.length >= ATTACHMENT_LIMIT;

  async function open(attachment: Attachment) {
    setBusyId(attachment.id);
    try {
      const link = await api.attachmentLink(ticket.id, attachment.id);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      toast.notify({ tone: 'error', title: 'The file could not be opened', description: cause instanceof ApiError ? cause.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  async function add(file: File | undefined) {
    if (!file) return;
    const check = checkAttachment(file);
    if (!check.ok) {
      setMessage(check.error);
      return;
    }
    setMessage(null);
    setProgress(0);
    try {
      await uploadAttachment(ticket.id, file, { filename: file.name, content_type: check.content_type, size: file.size }, setProgress);
      toast.notify({ tone: 'success', title: 'Screenshot added' });
      onAdded();
    } catch (cause) {
      toast.notify({ tone: 'error', title: 'The file was not added', description: cause instanceof ApiError ? cause.message : undefined });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <Card title="Files" description={`${ticket.attachments.length} of ${ATTACHMENT_LIMIT} attached`}>
      {ticket.attachments.length === 0 ? (
        <p className="text-sm text-ink-2">No files on this ticket.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ticket.attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{attachment.filename}</p>
                <p className="text-xs text-ink-2">
                  {formatBytes(attachment.size)} · {formatDateTime(attachment.created_at)}
                </p>
              </div>
              <Button variant="secondary" size="sm" busy={busyId === attachment.id} onClick={() => void open(attachment)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="add-file" className="text-sm font-medium text-ink">
            Add a file
          </label>
          <input
            id="add-file"
            ref={input}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            disabled={progress !== null}
            onChange={(event) => void add(event.target.files?.[0])}
            className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          {progress !== null && (
            <div role="progressbar" aria-label="Upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {message && (
            <p role="alert" className="text-sm text-critical-text">
              {message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
