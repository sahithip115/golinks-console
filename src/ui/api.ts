/** Typed wrapper around the API, shared by both console panels. */

export interface ShortcutView {
  code: string;
  shortUrl: string;
  destination: string;
  owner: string;
  note: string | null;
  enabled: boolean;
  retired: boolean;
  useCount: number;
  createdAt: string;
  retiresAt: string;
  lastUsedAt: string | null;
}

export interface DirectoryResponse {
  tally: { total: number; live: number; disabled: number; retired: number; uses: number };
  shortcuts: ShortcutView[];
}

export interface UsageReport {
  code: string;
  totalUses: number;
  usesLastDay: number;
  distinctVisitors: number;
  retiresAt: string;
  topSources: Array<{ host: string; uses: number }>;
  recentUses: Array<{ happenedAt: string; sourceHost: string | null }>;
}

export interface HealthResponse {
  status: string;
  uptimeSeconds: number;
}

/** A failure the API described, carrying its code and the request id to quote. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId: string | null,
    readonly fields: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FailureBody {
  code?: string;
  message?: string;
  requestId?: string;
  fields?: Record<string, string>;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json' } : {},
  });
  const text = await response.text();
  const payload: unknown = text === '' ? null : JSON.parse(text);

  if (!response.ok) {
    const failure = (payload ?? {}) as FailureBody;
    const fields = failure.fields ?? {};
    const detail = Object.values(fields)[0];
    throw new ApiError(
      detail ?? failure.message ?? `Request failed (${response.status})`,
      failure.code ?? 'unknown',
      failure.requestId ?? response.headers.get('x-request-id'),
      fields,
    );
  }
  return payload as T;
}

const json = (body: unknown): RequestInit['body'] => JSON.stringify(body);

export const api = {
  health: () => request<HealthResponse>('/health'),
  directory: (search: string) =>
    request<DirectoryResponse>(`/api/v1/shortcuts${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  register: (body: Record<string, unknown>) =>
    request<ShortcutView>('/api/v1/shortcuts', { method: 'POST', body: json(body) }),
  usage: (code: string) => request<UsageReport>(`/api/v1/shortcuts/${encodeURIComponent(code)}/usage`),
  amend: (code: string, body: Record<string, unknown>) =>
    request<ShortcutView>(`/api/v1/shortcuts/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: json(body),
    }),
};
