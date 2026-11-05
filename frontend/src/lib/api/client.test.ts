import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, buildQuery, configureApiAuth, normalizeError, NETWORK_ERROR_MESSAGE } from './client';

describe('normalizeError', () => {
  it('keeps the code and every field detail from a 422 body', () => {
    const error = normalizeError(422, {
      error: {
        code: 'validation_error',
        message: 'request is invalid',
        details: [
          { field: 'title', message: 'must be at least 3 characters' },
          { field: 'category', message: 'must be one of the listed values' },
        ],
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_error');
    expect(error.fieldMessage('title')).toBe('must be at least 3 characters');
    expect(error.fieldMessage('description')).toBeUndefined();
    expect(error.message).toBe('Some details are invalid. Check the highlighted fields.');
  });

  it('shows a plain message for 403 and 404 without the raw API text', () => {
    expect(normalizeError(403, { error: { code: 'forbidden', message: 'role Customer may not post internal notes' } }).message).toBe(
      'You do not have permission to do that.',
    );
    expect(normalizeError(404, { error: { code: 'not_found', message: 'ticket not found' } }).message).toMatch(/could not find that/);
  });

  it('never shows the message of a 500 body', () => {
    const error = normalizeError(500, { error: { code: 'internal_error', message: 'KeyError: TABLE_TICKETS' } });
    expect(error.code).toBe('internal_error');
    expect(error.message).toBe('Something went wrong on our side. Try again in a moment.');
  });

  it('maps an unknown code or a body with no error object to unknown', () => {
    expect(normalizeError(409, { error: { code: 'brand_new_code', message: 'x' } }).code).toBe('unknown');
    expect(normalizeError(418, 'teapot').code).toBe('unknown');
    expect(normalizeError(418, undefined).message).toBe('Something went wrong. Try again.');
  });

  it('drops malformed detail entries instead of failing', () => {
    const error = normalizeError(422, { error: { code: 'validation_error', details: [{ field: 'title' }, 'nope', { field: 'email', message: 'bad' }] } });
    expect(error.details).toEqual([{ field: 'email', message: 'bad' }]);
  });
});

describe('buildQuery', () => {
  it('skips empty values and encodes the rest', () => {
    expect(buildQuery({ q: 'vpn drops', status: undefined, mine: false, limit: 25, cursor: '' })).toBe('?q=vpn+drops&mine=false&limit=25');
    expect(buildQuery({ status: undefined })).toBe('');
  });
});

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configureApiAuth(() => Promise.resolve({}), () => undefined);
  });

  it('sends the auth header and a JSON body, and returns the parsed response', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    configureApiAuth(() => Promise.resolve({ Authorization: 'Bearer abc' }), () => undefined);

    const result = await apiRequest<{ ok: boolean }>('POST', '/tickets', { body: { title: 'x' } });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/tickets');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'x' }));
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer abc');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('turns a failed fetch into a network_error with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(apiRequest('GET', '/health')).rejects.toMatchObject({ code: 'network_error', message: NETWORK_ERROR_MESSAGE });
  });

  it('signs the user out when the API answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'no' } }), { status: 401 }))));
    const onUnauthorized = vi.fn();
    configureApiAuth(() => Promise.resolve({}), onUnauthorized);

    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
