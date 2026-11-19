export const USER_AGENT = 'AdaptleSeeder/0.1 (https://github.com/Provenri/Adaptle_v0.1)';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  retries?: number;
  retryDelayMs?: number;
  /** Return null instead of throwing for 404s. */
  allow404?: boolean;
  method?: 'GET' | 'POST';
  /** JSON-serializable request body (POST only). */
  body?: unknown;
}

/** fetch with User-Agent, retries with backoff, and JSON parsing. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T | null> {
  const {
    headers = {},
    retries = 3,
    retryDelayMs = 1_000,
    allow404 = false,
    method = 'GET',
    body,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (response.status === 404 && allow404) return null;
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new NonRetryableError(`HTTP ${response.status} from ${url}: ${detail.slice(0, 500)}`);
      }
      // Some APIs (e.g. PostgREST with return=minimal) reply with an empty body.
      const text = await response.text();
      return text ? (JSON.parse(text) as T) : null;
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * 2 ** attempt);
      }
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${String(lastError)}`);
}

export class NonRetryableError extends Error {}
