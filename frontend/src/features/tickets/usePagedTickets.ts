// Loads a ticket list page by page. Cursor pagination only: there is no page number to jump to.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import type { Ticket, TicketQuery } from '@/lib/api/types';

export type LoadState = 'loading' | 'ready' | 'error';

interface Options {
  pageSize: number;
  /** Load every page up to this many, for views that need the whole set (the board). */
  maxPages?: number;
}

export interface PagedTickets {
  items: Ticket[];
  state: LoadState;
  error: ApiError | null;
  hasMore: boolean;
  /** True when maxPages stopped the load before the cursor ran out. */
  capped: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Changes one loaded ticket in place. Used for optimistic updates, which the caller rolls back on failure. */
  patchItem: (id: string, change: Partial<Ticket>) => void;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, 'unknown', 'Something went wrong. Try again.');
}

export function usePagedTickets(query: TicketQuery, { pageSize, maxPages = 1 }: Options): PagedTickets {
  const [items, setItems] = useState<Ticket[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [capped, setCapped] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const key = JSON.stringify(query);

  // Reset whenever the filters or a reload change.
  useEffect(() => {
    const controller = new AbortController();
    const parsed = JSON.parse(key) as TicketQuery;
    setState('loading');
    setError(null);
    setCapped(false);

    async function load() {
      try {
        let page = await api.listTickets({ ...parsed, limit: pageSize }, controller.signal);
        let collected = page.items;
        let pages = 1;
        while (page.next_cursor && maxPages > pages) {
          page = await api.listTickets({ ...parsed, limit: pageSize, cursor: page.next_cursor }, controller.signal);
          collected = [...collected, ...page.items];
          pages += 1;
        }
        if (controller.signal.aborted) return;
        setItems(collected);
        setCursor(page.next_cursor);
        setCapped(Boolean(page.next_cursor));
        setState('ready');
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(toApiError(cause));
        setState('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [key, reloadToken, pageSize, maxPages]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const parsed = JSON.parse(key) as TicketQuery;
    api
      .listTickets({ ...parsed, limit: pageSize, cursor })
      .then((page) => {
        setItems((existing) => [...existing, ...page.items]);
        setCursor(page.next_cursor);
      })
      .catch((cause: unknown) => setError(toApiError(cause)))
      .finally(() => setLoadingMore(false));
  }, [cursor, key, loadingMore, pageSize]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const patchItem = useCallback((id: string, change: Partial<Ticket>) => {
    setItems((existing) => existing.map((ticket) => (ticket.id === id ? { ...ticket, ...change } : ticket)));
  }, []);

  return { items, state, error, hasMore: cursor !== null, capped, loadingMore, loadMore, reload, patchItem };
}
