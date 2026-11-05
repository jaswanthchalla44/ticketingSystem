// Loads one ticket and, while triage is pending, quietly refreshes it until triage writes its source.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import type { TicketDetail } from '@/lib/api/types';
import { isTriagePending } from './triage';

export const TRIAGE_POLL_INTERVAL_MS = 2_000;
export const TRIAGE_POLL_LIMIT_MS = 120_000;

export type DetailState = 'loading' | 'ready' | 'error';

export interface TicketDetailState {
  ticket: TicketDetail | null;
  state: DetailState;
  error: ApiError | null;
  triageTimedOut: boolean;
  refresh: () => void;
}

export function useTicketDetail(id: string): TicketDetailState {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [state, setState] = useState<DetailState>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [triageTimedOut, setTriageTimedOut] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setError(null);
    setTriageTimedOut(false);
    api
      .getTicket(id, controller.signal)
      .then((detail) => {
        setTicket(detail);
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause : new ApiError(0, 'unknown', 'The ticket could not be loaded.'));
        setState('error');
      });
    return () => controller.abort();
  }, [id, reloadToken]);

  const pending = ticket !== null && isTriagePending(ticket);

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > TRIAGE_POLL_LIMIT_MS) {
        window.clearInterval(timer);
        setTriageTimedOut(true);
        return;
      }
      api
        .getTicket(id)
        .then(setTicket)
        .catch(() => undefined);
    }, TRIAGE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pending, id]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ticket, state, error, triageTimedOut, refresh };
}
