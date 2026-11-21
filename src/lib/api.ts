const BACKEND_STORAGE_KEY = 'gta6_urdu_backend_url';

export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(BACKEND_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/$/, '');
    }
  }
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL;
  return envUrl ? envUrl.trim().replace(/\/$/, '') : '';
}

export function setBackendBaseUrl(url: string) {
  if (typeof window === 'undefined') return;
  const cleaned = url.trim().replace(/\/$/, '');
  if (!cleaned) {
    window.localStorage.removeItem(BACKEND_STORAGE_KEY);
  } else {
    window.localStorage.setItem(BACKEND_STORAGE_KEY, cleaned);
  }
}

export function resolveMediaUrl(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('blob:')) {
    return pathOrUrl;
  }
  const base = getBackendBaseUrl();
  return `${base}${pathOrUrl}`;
}

export function getWebSocketUrl(): string {
  const base = getBackendBaseUrl();
  if (base) {
    return `${base.replace(/^http/, 'ws')}/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  bearerToken?: string | null
): Promise<T> {
  const base = getBackendBaseUrl();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (bearerToken) {
    headers.set('Authorization', `Bearer ${bearerToken}`);
  }

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { error: text || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    throw new Error((json.error as string) || `Request failed (${res.status})`);
  }

  return json as T;
}
