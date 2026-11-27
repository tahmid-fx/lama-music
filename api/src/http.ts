import { config } from "./config.ts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = "bad_request", details?: unknown) =>
  new ApiError(400, code, message, details);

export const notFound = (message = "Resource not found") => new ApiError(404, "not_found", message);

export const badGateway = (message = "Upstream catalog unavailable") =>
  new ApiError(502, "upstream_error", message);

/** JSON response with the headers this API promises on every route. */
export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": config.corsOrigin,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,OPTIONS",
      "cache-control": "public, max-age=60",
      ...init.headers,
    },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch + JSON with a hard timeout and bounded retries for transient upstream
 * failures. Throws ApiError(502) when the upstream cannot be reached.
 */
export async function fetchJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; retries?: number; timeoutMs?: number; lookup?: boolean } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? config.upstreamTimeoutMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": config.userAgent, accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * (attempt + 1);
        lastError = new Error(`upstream ${res.status}`);
        if (attempt < retries) {
          await sleep(wait);
          continue;
        }
        throw badGateway(`Upstream returned ${res.status}`);
      }

      // MusicBrainz answers 400 "Invalid mbid." for unknown ids, 404 on some routes.
      if (res.status === 404 || (res.status === 400 && opts.lookup)) {
        throw notFound("Resource not found in the upstream catalog");
      }

      if (!res.ok) {
        throw badGateway(`Upstream returned ${res.status}`);
      }

      // MusicBrainz occasionally replies with an empty body on rate limiting.
      const text = await res.text();
      if (!text.trim()) {
        lastError = new Error("empty upstream body");
        if (attempt < retries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw badGateway("Upstream returned an empty body");
      }
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      lastError = err;
      if (attempt < retries) await sleep(400 * (attempt + 1));
    }
  }

  throw badGateway(
    `Could not reach upstream catalog (${lastError instanceof Error ? lastError.message : "unknown error"})`,
  );
}

/** Serialises calls so we never exceed MusicBrainz's one request per second. */
export function createThrottle(minGapMs: number) {
  let chain: Promise<void> = Promise.resolve();
  let last = 0;
  return function throttle(): Promise<void> {
    chain = chain.then(async () => {
      const wait = Math.max(0, last + minGapMs - Date.now());
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    return chain;
  };
}

/** Fixed-window per-key limiter (IP addresses in practice). */
export function createRateLimiter(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      hits.set(key, fresh);
      return { allowed: true, remaining: max - 1, resetAt: fresh.resetAt };
    }
    entry.count += 1;
    return { allowed: entry.count <= max, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt };
  };
}
