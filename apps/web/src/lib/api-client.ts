import { COOKIE_NAMES, CSRF_HEADER, SOCKET_ID_HEADER, type ApiErrorBody } from '@flowsync/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * The only place the app talks to the API.
 *
 * Every request is sent with credentials so the httpOnly session cookies travel,
 * and every state-changing request echoes the readable CSRF cookie in a header —
 * which is exactly what the server's double-submit check verifies. Keeping this
 * in one wrapper is what makes that guarantee auditable.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Field-level messages keyed by form field, ready for React Hook Form. */
  get fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const detail of this.details ?? []) {
      if (detail.path && !errors[detail.path]) errors[detail.path] = detail.message;
    }
    return errors;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * The realtime socket id of this tab. The server uses it to skip echoing an event
 * back to the client that caused it, so an optimistic update is never overwritten
 * by its own round trip.
 */
let currentSocketId: string | null = null;

export function setSocketId(socketId: string | null): void {
  currentSocketId = socketId;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Skips the JSON content type, for multipart uploads. */
  formData?: FormData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (method !== 'GET') {
    const csrf = readCookie(COOKIE_NAMES.csrf);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  if (currentSocketId) headers[SOCKET_ID_HEADER] = currentSocketId;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(options.signal ? { signal: options.signal } : {}),
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = payload as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
      error?.requestId,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', ...(signal ? { signal } : {}) }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
};

/** Serialises a query object, dropping empty values so URLs stay clean and cache keys stable. */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
