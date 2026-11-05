// Single request path for the app. Every error is normalized to ApiError, so screens handle one shape.
import { API_BASE_URL } from '@/lib/config';

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'conflict',
  'validation_error',
  'internal_error',
  'upstream_error',
  'network_error',
  'upload_failed',
  'unknown',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: readonly FieldError[];

  constructor(status: number, code: ErrorCode, message: string, details: readonly FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The first message for a form field, if the API flagged it. */
  fieldMessage(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'The request could not be read. Refresh the page and try again.',
  401: 'Your session has ended. Sign in again to continue.',
  403: 'You do not have permission to do that.',
  404: 'We could not find that. It may have been removed, or you may not have access.',
  405: 'That action is not available.',
  409: 'That conflicts with the current state. Refresh and try again.',
  422: 'Some details are invalid. Check the highlighted fields.',
  502: 'A service we depend on did not respond. Try again in a moment.',
};

const KNOWN_CODES: readonly string[] = ERROR_CODES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCode(value: unknown): ErrorCode {
  return typeof value === 'string' && KNOWN_CODES.includes(value) ? (value as ErrorCode) : 'unknown';
}

function toDetails(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!isRecord(item) || typeof item.field !== 'string' || typeof item.message !== 'string') return [];
    return [{ field: item.field, message: item.message }];
  });
}

/** Turns an error response body and status into an ApiError. Unknown shapes still get a useful message. */
export function normalizeError(status: number, body: unknown): ApiError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = error ? toCode(error.code) : 'unknown';
  const details = error ? toDetails(error.details) : [];
  const apiMessage = error && typeof error.message === 'string' ? error.message : undefined;
  const message =
    FALLBACK_MESSAGES[status] ??
    (status >= 500 ? 'Something went wrong on our side. Try again in a moment.' : apiMessage ?? 'Something went wrong. Try again.');
  return new ApiError(status, code, message, details);
}

export const NETWORK_ERROR_MESSAGE = 'We could not reach the server. Check your connection and try again.';

export type HeaderProvider = () => Promise<Record<string, string>>;

let authHeaders: HeaderProvider = () => Promise.resolve({});
let unauthorizedHandler: (() => void) | null = null;

/** Wired once by the auth provider. Keeps this module free of auth imports. */
export function configureApiAuth(headers: HeaderProvider, onUnauthorized: () => void): void {
  authHeaders = headers;
  unauthorizedHandler = onUnauthorized;
}

export type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(await authHeaders()) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }

  const body = await readBody(response);
  if (!response.ok) {
    const error = normalizeError(response.status, body);
    if (response.status === 401) unauthorizedHandler?.();
    throw error;
  }
  return body as T;
}

/** PUTs a file straight to S3 with the headers the presign call returned. Sends no API credentials. */
export function uploadFile(
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new ApiError(xhr.status, 'upload_failed', 'The upload did not finish. Try the file again.'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'upload_failed', NETWORK_ERROR_MESSAGE));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}
