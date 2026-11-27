import { config } from "./config.ts";
import { lookupArtwork } from "./itunes.ts";
import { escapeHtml } from "./normalize.ts";
import { ApiError, badRequest, createRateLimiter, json } from "./http.ts";
import { parseLimit, parseMbid, parseOffset } from "./normalize.ts";
import {
  getAlbum,
  getArtist,
  getArtistAlbums,
  getTrack,
  searchAlbums,
  searchArtists,
  searchTracks,
} from "./musicbrainz.ts";
import type { Meta, SearchResult } from "./types.ts";

const limiter = createRateLimiter(config.rateLimit.windowMs, config.rateLimit.max);
const openapi = await Bun.file(new URL("../openapi.json", import.meta.url)).text();

const SEARCH_TYPES = new Set(["all", "artist", "album", "track"]);
const ALBUM_TYPES = new Set(["album", "single", "ep", "live", "compilation", "soundtrack"]);

/** Wraps a result with the API's standard envelope. */
function ok(data: unknown, meta: Omit<Meta, "tookMs"> & { warnings?: string[] }, started: number) {
  return json({
    data,
    meta: { ...meta, tookMs: Date.now() - started },
  });
}

function readQuery(url: URL, key: string, max = 120): string {
  const value = (url.searchParams.get(key) ?? "").trim();
  if (!value) throw badRequest(`Missing required query parameter "${key}"`, "missing_parameter", { param: key });
  if (value.length > max) {
    throw badRequest(`"${key}" must be ${max} characters or fewer`, "parameter_too_long", { param: key });
  }
  return value;
}

async function handleSearch(url: URL, started: number) {
  const q = readQuery(url, "q");
  const type = (url.searchParams.get("type") ?? "all").toLowerCase();
  if (!SEARCH_TYPES.has(type)) {
    throw badRequest(`"type" must be one of ${[...SEARCH_TYPES].join(", ")}`, "invalid_type");
  }
  const limit = parseLimit(url.searchParams.get("limit"), config.defaultLimit, config.maxLimit);
  const offset = parseOffset(url.searchParams.get("offset"));

  const wantArtists = type === "all" || type === "artist";
  const wantAlbums = type === "all" || type === "album";
  const wantTracks = type === "all" || type === "track";

  // MusicBrainz deggrades per index: its release-group search can be down while
  // artist/recording search still works. Return what we have plus a warning
  // instead of failing the whole search.
  const warnings: string[] = [];
  // Cover art costs an extra upstream call per album; cap it per request.
  let artworkBudget = 10;
  const [artists, albums, tracks] = await Promise.all([
    wantArtists
      ? searchArtists(q, limit, offset).catch(() => {
          warnings.push("artist_search_unavailable");
          return null;
        })
      : null,
    wantAlbums
      ? searchAlbums(q, limit, offset, (album) => {
          if (!album.artist || artworkBudget-- <= 0) return Promise.resolve(null);
          return lookupArtwork(album.artist, album.title);
        }).catch(() => {
          warnings.push("album_search_unavailable");
          return null;
        })
      : null,
    wantTracks
      ? searchTracks(q, limit, offset).catch(() => {
          warnings.push("track_search_unavailable");
          return null;
        })
      : null,
  ]);

  if (warnings.length === 3) {
    // Nothing succeeded: surface the upstream failure instead of an empty result.
    throw new ApiError(502, "upstream_error", "MusicBrainz search is unavailable");
  }

  const result: SearchResult = {
    artists: artists?.items ?? [],
    albums: albums?.items ?? [],
    tracks: tracks?.items ?? [],
  };

  return ok(
    result,
    {
      source: "musicbrainz+itunes",
      cached: Boolean(artists?.cached ?? albums?.cached ?? tracks?.cached),
      ...(warnings.length ? { warnings } : {}),
    },
    started,
  );
}

async function handleRequest(req: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": config.corsOrigin,
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ error: { code: "method_not_allowed", message: "Only GET is supported" } }, { status: 405 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "local";
  const rate = limiter(ip);
  if (!rate.allowed) {
    return json(
      { error: { code: "rate_limited", message: "Too many requests, slow down" }, requestId: crypto.randomUUID() },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  }

  try {
    if (path === "/") {
      return new Response(docsHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/openapi.json") {
      return new Response(openapi, { headers: { "content-type": "application/json; charset=utf-8" } });
    }
    if (path === "/health") {
      return json({ status: "ok", service: config.service, version: config.version, uptimeSeconds: Math.round(process.uptime()) });
    }
    if (path === "/v1/search") return await handleSearch(url, started);

    const artistMatch = /^\/v1\/artists\/([^/]+)$/.exec(path);
    if (artistMatch) {
      const mbid = parseMbid(artistMatch[1], "artistId");
      const { artist, cached } = await getArtist(mbid);
      return ok(artist, { source: "musicbrainz", cached }, started);
    }

    const artistAlbumsMatch = /^\/v1\/artists\/([^/]+)\/albums$/.exec(path);
    if (artistAlbumsMatch) {
      const mbid = parseMbid(artistAlbumsMatch[1], "artistId");
      const limit = parseLimit(url.searchParams.get("limit"), config.defaultLimit, config.maxLimit);
      const offset = parseOffset(url.searchParams.get("offset"));
      const type = (url.searchParams.get("type") ?? "").toLowerCase();
      if (type && !ALBUM_TYPES.has(type)) {
        throw badRequest(`"type" must be one of ${[...ALBUM_TYPES].join(", ")}`, "invalid_type");
      }
      const { items, total, cached } = await getArtistAlbums(mbid, limit, offset, type || undefined);
      return ok({ items, total, limit, offset }, { source: "musicbrainz", cached }, started);
    }

    const albumMatch = /^\/v1\/albums\/([^/]+)$/.exec(path);
    if (albumMatch) {
      const mbid = parseMbid(albumMatch[1], "albumId");
      const { album, cached } = await getAlbum(mbid);
      album.artworkUrl = await lookupArtwork(album.artist, album.title);
      return ok(album, { source: "musicbrainz+itunes", cached }, started);
    }

    const trackMatch = /^\/v1\/tracks\/([^/]+)$/.exec(path);
    if (trackMatch) {
      const mbid = parseMbid(trackMatch[1], "trackId");
      const { track, cached } = await getTrack(mbid);
      return ok(track, { source: "musicbrainz", cached }, started);
    }

    if (path === "/v1/artwork") {
      const artist = readQuery(url, "artist");
      const album = readQuery(url, "album");
      const artworkUrl = await lookupArtwork(artist, album);
      if (!artworkUrl) {
        return json({ data: null, meta: { source: "itunes", cached: false, tookMs: Date.now() - started } });
      }
      return ok({ artworkUrl, size: 600 }, { source: "itunes", cached: false }, started);
    }

    return json({ error: { code: "not_found", message: `No route for ${req.method} ${path}` } }, { status: 404 });
  } catch (err) {
    if (err instanceof ApiError) {
      return json(
        { error: { code: err.code, message: err.message, details: err.details ?? null } },
        { status: err.status },
      );
    }
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}]`, err);
    return json(
      { error: { code: "internal_error", message: "Unexpected server error" }, requestId },
      { status: 500 },
    );
  }
}

function docsHtml(): string {
  const endpoints: Array<[string, string]> = [
    ["GET /health", "Liveness plus version information."],
    ["GET /v1/search?q=&type=&limit=&offset=", "Search artists, albums and tracks. type = all | artist | album | track."],
    ["GET /v1/artists/{mbid}", "Artist detail with type, country, life span and tags."],
    ["GET /v1/artists/{mbid}/albums?limit=&offset=&type=", "Albums for an artist; type = album | single | ep | live | compilation | soundtrack."],
    ["GET /v1/albums/{mbid}", "Album detail: every edition plus the fullest tracklist."],
    ["GET /v1/tracks/{mbid}", "Track (recording) detail."],
    ["GET /v1/artwork?artist=&album=", "Cover art URL (600×600) for an artist + album pair."],
    ["GET /openapi.json", "OpenAPI 3.1 description of this API."],
  ];
  const rows = endpoints
    .map(([path, desc]) => `<tr><td><code>${escapeHtml(path)}</code></td><td>${escapeHtml(desc)}</td></tr>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(config.service)}</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:48px 20px;background:#0b1020;color:#e8ecff}
main{max-width:860px;margin:0 auto}
h1{font-size:34px;margin:0 0 4px;letter-spacing:-.02em}
p.lead{color:#9aa7d0;margin:0 0 32px}
code{background:#161d38;border:1px solid #26305a;border-radius:6px;padding:2px 6px;font-size:14px}
table{border-collapse:collapse;width:100%}
td{border-bottom:1px solid #1f2745;padding:10px 8px;vertical-align:top}
td:first-child{white-space:nowrap}
pre{background:#111731;border:1px solid #26305a;border-radius:10px;padding:14px;overflow:auto;font-size:13px}
a{color:#8fb4ff}
.badge{display:inline-block;background:#3358f5;color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;vertical-align:middle;margin-left:8px}
</style>
</head>
<body><main>
<h1>Lama Music API<span class="badge">v1</span></h1>
<p class="lead">Read-only catalog and search API. Data from MusicBrainz, cover art from iTunes. No keys required.</p>
<table>${rows}</table>
<h2>Examples</h2>
<pre>curl "http://127.0.0.1:${config.port}/v1/search?q=clairo&type=all&amp;limit=5"

curl "http://127.0.0.1:${config.port}/v1/artists/f2c8a3f0-6f36-4f10-9f36-0f2d1a3b1f9e"

curl "http://127.0.0.1:${config.port}/v1/artwork?artist=Clairo&amp;album=Immunity"</pre>
<h2>Notes</h2>
<p>Every response is wrapped in <code>{ "data": …, "meta": { "source", "cached", "tookMs" } }</code>.
Errors use <code>{ "error": { "code", "message" } }</code>. Responses are cached for 10 minutes;
MusicBrainz requests are throttled to one per second as their guidelines require.</p>
</main></body></html>`;
}

const server = Bun.serve({
  port: config.port,
  hostname: config.hostname,
  fetch: handleRequest,
});

console.log(`${config.service} v${config.version} listening on http://${config.hostname}:${server.port}`);
console.log(`docs: http://${config.hostname}:${server.port}/  ·  spec: /openapi.json`);
