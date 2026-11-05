import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import type { Visibility } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextAreaField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/toast-context';

interface ReplyFormProps {
  ticketId: string;
  isStaff: boolean;
  body: string;
  onBodyChange: (body: string) => void;
  onPosted: () => void;
}

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; hint: string }> = [
  { value: 'public', label: 'Reply to the requester', hint: 'They will see this reply.' },
  { value: 'internal', label: 'Internal note', hint: 'Staff only. The requester never sees it.' },
];

export function ReplyForm({ ticketId, isStaff, body, onBodyChange, onPosted }: ReplyFormProps) {
  const toast = useToast();
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effective: Visibility = isStaff ? visibility : 'public';
  const trimmed = body.trim();

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) {
      setError('Write a message before sending.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.addComment(ticketId, trimmed, effective);
      onBodyChange('');
      toast.notify({ tone: 'success', title: effective === 'internal' ? 'Internal note added' : 'Reply sent' });
      onPosted();
    } catch (cause) {
      setError(cause instanceof ApiError ? (cause.fieldMessage('body') ?? cause.message) : 'Your message was not sent. Try again.');
    } finally {
      setSending(false);
    }
  }

  const label = !isStaff ? 'Message to support' : effective === 'internal' ? 'Internal note' : 'Reply to the requester';

  return (
    <Card title={isStaff ? 'Respond' : 'Add a message'}>
      <form className="flex flex-col gap-4" onSubmit={(event) => void send(event)} noValidate>
        {isStaff && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">Who should see this?</legend>
            {VISIBILITY_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={() => setVisibility(option.value)}
                  className="mt-1 accent-brand"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="block text-xs text-ink-2">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <TextAreaField
          id="reply-body"
          label={label}
          value={body}
          onChange={(event) => {
            onBodyChange(event.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          rows={5}
        />
        <div className="flex justify-end">
          <Button type="submit" busy={sending}>
            {effective === 'internal' ? 'Save note' : 'Send'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
