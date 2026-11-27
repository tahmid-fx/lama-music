/**
 * Runtime configuration. Everything has a safe default so the service starts
 * with zero setup; override through environment variables.
 */

const pkg = { name: "lama-music-api", version: "1.0.0" };

export const config = {
  service: "lama-music-api",
  version: pkg.version,
  port: Number(process.env.PORT ?? 8788),
  hostname: process.env.HOST ?? "127.0.0.1",

  /** MusicBrainz asks every client for a descriptive User-Agent with contact info. */
  userAgent:
    process.env.MB_USER_AGENT ??
    `LamaMusicAPI/${pkg.version} ( https://github.com/tahmid-fx/lama-music )`,

  /** MusicBrainz allows ~1 request/second per IP; we queue globally to stay polite. */
  musicbrainzBase: process.env.MUSICBRAINZ_BASE ?? "https://musicbrainz.org/ws/2",
  musicbrainzMinGapMs: Number(process.env.MB_MIN_GAP_MS ?? 1100),

  itunesBase: process.env.ITUNES_BASE ?? "https://itunes.apple.com",

  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 9000),

  /** Shared response cache. Catalog data changes slowly, so 10 minutes is safe. */
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 10 * 60 * 1000),
  cacheMaxEntries: Number(process.env.CACHE_MAX_ENTRIES ?? 500),

  /** Simple per-IP limiter to keep the public deployment healthy. */
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  },

  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  defaultLimit: 20,
  maxLimit: 50,
} as const;
