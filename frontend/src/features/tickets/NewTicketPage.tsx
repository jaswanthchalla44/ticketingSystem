import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { CATEGORIES, type Category } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/toast-context';
import { formatBytes } from '@/features/common/format';
import { uploadAttachment } from './attachments';
import { ATTACHMENT_ACCEPT, TICKET_LIMITS, checkAttachment, validateTicketDraft, type FieldErrors, type TicketField } from './validation';

interface Draft {
  title: string;
  description: string;
  category: string;
}

const EMPTY_DRAFT: Draft = { title: '', description: '', category: '' };

export function NewTicketPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors<TicketField | 'file'>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  function update(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function chooseFile(next: File | null) {
    setFormError(null);
    if (!next) {
      setFile(null);
      setErrors((current) => ({ ...current, file: undefined }));
      return;
    }
    const check = checkAttachment(next);
    if (!check.ok) {
      setFile(null);
      setErrors((current) => ({ ...current, file: check.error }));
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setErrors((current) => ({ ...current, file: undefined }));
    setFile(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const found = validateTicketDraft(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      document.getElementById(Object.keys(found)[0] ?? 'title')?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await api.createTicket({
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category as Category,
      });

      if (file) {
        const check = checkAttachment(file);
        if (!check.ok) throw new Error(check.error);
        setProgress(0);
        try {
          await uploadAttachment(ticket.id, file, { filename: file.name, content_type: check.content_type, size: file.size }, setProgress);
        } catch {
          toast.notify({
            tone: 'error',
            title: 'Your ticket was saved, but the screenshot did not upload',
            description: 'Open the ticket and add it again.',
          });
          navigate(`/tickets/${ticket.id}`);
          return;
        }
      }

      toast.notify({ tone: 'success', title: 'Ticket submitted', description: 'We are sorting it now. Priority and category update in a moment.' });
      navigate(`/tickets/${ticket.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 422) {
        const fields: FieldErrors<TicketField> = {};
        for (const field of ['title', 'description', 'category'] as const) {
          const message = cause.fieldMessage(field);
          if (message) fields[field] = message;
        }
        setErrors((current) => ({ ...current, ...fields }));
        if (Object.keys(fields).length === 0) setFormError(cause.message);
      } else {
        setFormError(cause instanceof Error ? cause.message : 'The ticket could not be sent. Try again.');
      }
    } finally {
      setProgress(null);
      setSubmitting(false);
    }
  }

  const descriptionLength = draft.description.trim().length;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Report a problem</h1>
        <p className="mt-1 text-sm text-ink-2">Tell us what is happening, what you expected, and anything you already tried.</p>
      </header>

      <Card>
        <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)} noValidate>
          {formError && (
            <p role="alert" className="rounded-lg border border-critical/50 bg-critical/10 p-3 text-sm text-ink">
              {formError}
            </p>
          )}

          <TextField
            id="title"
            label="Title"
            name="title"
            hint={`Say the problem in a few words. ${TICKET_LIMITS.titleMin} to ${TICKET_LIMITS.titleMax} characters.`}
            value={draft.title}
            maxLength={TICKET_LIMITS.titleMax + 20}
            onChange={(event) => update('title', event.target.value)}
            error={errors.title}
            autoComplete="off"
          />

          <SelectField
            id="category"
            label="Category"
            name="category"
            hint="Pick the closest match. We may change it after we read your request."
            value={draft.category}
            onChange={(event) => update('category', event.target.value)}
            error={errors.category}
          >
            <option value="">Choose a category</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectField>

          <TextAreaField
            id="description"
            label="Description"
            name="description"
            hint={`What happened, when it started, and what you tried. ${descriptionLength} of ${TICKET_LIMITS.descriptionMax} characters.`}
            value={draft.description}
            onChange={(event) => update('description', event.target.value)}
            error={errors.description}
            rows={6}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="attachment" className="text-sm font-medium text-ink">
              Screenshot or document <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <input
              id="attachment"
              ref={fileInput}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              disabled={submitting}
              aria-describedby="attachment-hint"
              aria-invalid={errors.file ? true : undefined}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-page"
            />
            <p id="attachment-hint" className="text-xs text-ink-2">
              PNG, JPEG, GIF, WebP or PDF, up to 5 MB.
            </p>
            {file && (
              <p className="text-sm text-ink-2">
                {file.name} ({formatBytes(file.size)}){' '}
                <button
                  type="button"
                  className="font-medium text-brand underline underline-offset-2"
                  disabled={submitting}
                  onClick={() => {
                    chooseFile(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  Remove
                </button>
              </p>
            )}
            {errors.file && (
              <p role="alert" className="text-sm text-critical-text">
                {errors.file}
              </p>
            )}
          </div>

          {progress !== null && (
            <div className="flex flex-col gap-1">
              <div
                role="progressbar"
                aria-label="Screenshot upload"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="h-2 w-full overflow-hidden rounded-full bg-line"
              >
                <div className="h-full bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="text-xs text-ink-2">Uploading screenshot… {Math.round(progress * 100)}%</p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/')} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" busy={submitting}>
              Submit ticket
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
