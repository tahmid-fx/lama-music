# Lama Music API

A small, read-only music catalog and search API. Built for the Lama Music player, useful to anyone
who needs free artist/album/track lookups without an API key.

- **Metadata:** [MusicBrainz](https://musicbrainz.org) web service (CC0 data).
- **Cover art:** [iTunes Search API](https://performance-partners.apple.com/search-api) (no key, no account).
- **Runtime:** [Bun](https://bun.sh) + TypeScript. **Zero dependencies**, no build step.
- **Licence:** MIT (see [LICENSE](LICENSE)). This is separate from the GPLv3 app in the repository root.

Nothing is scraped, no YouTube, no Spotify, no accounts, no writes: the API never stores user data.

## Run it

```bash
cd api
bun src/server.ts           # http://127.0.0.1:8788
```

```bash
curl http://127.0.0.1:8788/health
# {"status":"ok","service":"lama-music-api","version":"1.0.0","uptimeSeconds":9}
```

Open `http://127.0.0.1:8788/` in a browser for a human-readable endpoint list, and
`/openapi.json` for the machine-readable spec. Configuration is entirely optional and lives in
[`.env.example`](.env.example) — every value has a safe default.

```bash
bun test          # 12 unit tests, no network
bun run smoke     # 23 live checks against a running server
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/v1/search?q=&type=&limit=&offset=` | Search artists, albums and tracks |
| GET | `/v1/artists/{artistId}` | Artist detail |
| GET | `/v1/artists/{artistId}/albums?type=&limit=&offset=` | An artist's releases |
| GET | `/v1/albums/{albumId}` | Album detail with editions and tracklist |
| GET | `/v1/tracks/{trackId}` | Track detail |
| GET | `/v1/artwork?artist=&album=` | Cover art URL |
| GET | `/health` | Liveness and version |
| GET | `/openapi.json` | OpenAPI 3.1 document |

Identifiers are **MusicBrainz MBIDs** (UUIDs): artist MBIDs, release-group MBIDs for albums, and
recording MBIDs for tracks. Use search to discover them, then follow the links.

### Parameters

| Name | Applies to | Rules |
|---|---|---|
| `q` | search | required, 1–120 characters |
| `type` | search | `all` (default), `artist`, `album`, `track` |
| `type` | artist albums | `album`, `single`, `ep`, `live`, `compilation`, `soundtrack` (omit for all) |
| `limit` | search, albums | integer 1–50, default 20 |
| `offset` | search, albums | integer 0–10000, default 0 |

### Response envelope

Every success returns `data` plus a `meta` block:

```json
{
  "data": { },
  "meta": { "source": "musicbrainz+itunes", "cached": false, "tookMs": 679 }
}
```

`cached` reports whether the response came from the 10-minute cache. When MusicBrainz has one of its
search indexes down (this happens — see [Degradation](#degradation)), `meta.warnings` lists what was
unavailable, e.g. `["album_search_unavailable"]`, and the rest of the result is still returned.

Errors are consistent:

```json
{ "error": { "code": "invalid_mbid", "message": "\"artistId\" must be a MusicBrainz UUID", "details": { "field": "artistId" } } }
```

| Status | Codes |
|---|---|
| 400 | `missing_parameter`, `parameter_too_long`, `invalid_limit`, `invalid_offset`, `invalid_type`, `invalid_mbid` |
| 404 | `not_found` (unknown route or unknown MBID) |
| 429 | `rate_limited` (with `Retry-After`) |
| 502 | `upstream_error` (MusicBrainz or iTunes unreachable) |
| 500 | `internal_error` (with `requestId`) |

## Examples

### Search

```bash
curl "http://127.0.0.1:8788/v1/search?q=clairo&type=artist&limit=1"
```

```json
{
  "data": {
    "artists": [
      {
        "id": "d786f59b-1836-4ddb-8393-ab753edbe984",
        "name": "Clairo",
        "sortName": "Clairo",
        "type": "Person",
        "country": "US",
        "disambiguation": null,
        "lifeSpan": { "begin": "1998-08-18", "end": null, "ended": false },
        "tags": ["pop", "singer-songwriter", "indie", "alternative", "lo-fi", "indie pop"],
        "score": 100
      }
    ],
    "albums": [],
    "tracks": []
  },
  "meta": { "source": "musicbrainz+itunes", "cached": false, "tookMs": 679 }
}
```

`type=all` queries all three entities; each list is independent, so a query can legitimately return
artists but no albums.

### An artist's albums

```bash
curl "http://127.0.0.1:8788/v1/artists/d786f59b-1836-4ddb-8393-ab753edbe984/albums?limit=3"
```

```json
{
  "data": {
    "items": [
      { "id": "6fb46378-9cb7-4693-b76d-a62f2cc09214", "title": "Charm", "artist": "Clairo",
        "artistId": "d786f59b-1836-4ddb-8393-ab753edbe984", "primaryType": "Album",
        "secondaryTypes": [], "firstReleaseDate": "2024-07-12", "score": null, "artworkUrl": null },
      { "id": "2ae8fedc-5287-422e-998b-c1f38b81fb12", "title": "Sling", "artist": "Clairo",
        "artistId": "d786f59b-1836-4ddb-8393-ab753edbe984", "primaryType": "Album",
        "secondaryTypes": [], "firstReleaseDate": "2021-07-16", "score": null, "artworkUrl": null }
    ],
    "total": 51,
    "limit": 3,
    "offset": 0
  },
  "meta": { "source": "musicbrainz", "cached": false, "tookMs": 1321 }
}
```

### Album with tracklist

```bash
curl "http://127.0.0.1:8788/v1/albums/6fb46378-9cb7-4693-b76d-a62f2cc09214"
```

```json
{
  "data": {
    "id": "6fb46378-9cb7-4693-b76d-a62f2cc09214",
    "title": "Charm",
    "artist": "Clairo",
    "artistId": "d786f59b-1836-4ddb-8393-ab753edbe984",
    "primaryType": "Album",
    "secondaryTypes": [],
    "firstReleaseDate": "2024-07-12",
    "score": null,
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f7/8c/19/f78c1951-ced5-fea6-251b-50914d96fd62/00196922948305_Cover.jpg/600x600bb.jpg",
    "releases": [
      { "id": "b4c2f7e6-...", "title": "Charm", "date": "2024-07-12", "country": "US", "trackCount": 11 }
    ],
    "tracks": [
      { "position": 1, "disc": 1, "title": "Nomad", "recordingId": "0a90854e-6735-4242-89d7-5c33cf36cb01", "durationSeconds": 226 },
      { "position": 2, "disc": 1, "title": "Sexy to Someone", "recordingId": "4b4e3304-8655-4e2e-a91c-192a0f486134", "durationSeconds": 208 },
      { "position": 3, "disc": 1, "title": "Second Nature", "recordingId": "0280ccfd-b3a7-46b1-a4a6-18aa1d340c51", "durationSeconds": 227 }
    ],
    "totalDurationSeconds": 2287
  },
  "meta": { "source": "musicbrainz+itunes", "cached": false, "tookMs": 2408 }
}
```

An album has many editions (31 for this one). The API lists them all in `releases` but returns the
tracklist of the edition with the most tracks, so the tracklist you get is the complete one.
`releases` is trimmed above for brevity.

### Cover art

```bash
curl "http://127.0.0.1:8788/v1/artwork?artist=Daft%20Punk&album=Discovery"
```

```json
{
  "data": {
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/600x600bb.jpg",
    "size": 600
  },
  "meta": { "source": "itunes", "cached": false, "tookMs": 214 }
}
```

When nothing matches, `data` is `null` with HTTP 200 — an album simply not being in Apple's catalog is
not an error. iTunes returns 100×100 thumbnails by default; the URL is rewritten to 600×600.

## How it behaves under load and failure

- **MusicBrainz politeness.** Requests are serialised through a global queue with a 1100 ms gap
  (their guideline is one request per second per client), plus a descriptive `User-Agent` that you
  should customise via `MB_USER_AGENT` for your own deployment.
- **Caching.** Responses are cached in-process for 10 minutes (LRU-bounded, 500 entries). Repeated
  searches are effectively free and `meta.cached` tells you which.
- **Rate limiting.** 120 requests/minute per IP, fixed window, with `Retry-After` on 429.
- **Timeouts and retries.** Upstream calls time out after 9 s and retry twice on 429/5xx/empty bodies
  with backoff, honouring `Retry-After`.
- **Artwork budget.** A search resolves cover art for at most 10 albums, since each costs an extra
  upstream call.
- **Invalid identifiers.** MusicBrainz answers `400 Invalid mbid.` for unknown UUIDs; the API maps
  that (and upstream 404s) to a clean `404 not_found`.

### Degradation

MusicBrainz runs several search indexes, and one can be unavailable while the others work — the
release-group (album) index did exactly that during development, returning 503 for every query while
artist and recording search were fine. Because of that:

- a failing entity in `type=all` returns the other entities plus `meta.warnings`;
- a failing single-type search returns `502` rather than a misleading empty list;
- album *detail* keeps working, because it uses browse/lookup endpoints rather than search.

## Layout

```
src/config.ts        env-driven configuration with safe defaults
src/http.ts          fetch + timeout/retry, JSON helpers, throttle, rate limiter, ApiError
src/cache.ts         tiny TTL/LRU cache
src/normalize.ts     input validation and MusicBrainz/iTunes mapping helpers
src/musicbrainz.ts   search, browse and lookup against MusicBrainz
src/itunes.ts        cover art lookup (three matching passes)
src/types.ts         response contracts
src/server.ts        routing, envelopes, rate limiting, docs page
openapi.json         OpenAPI 3.1 spec served at /openapi.json
tests/               unit tests
scripts/smoke.ts     live end-to-end checks
```

## Deployment notes

The service is a single Bun process with no dependencies, so it runs anywhere Bun does, behind any
reverse proxy. Bind with `HOST=0.0.0.0` in a container, keep `MB_USER_AGENT` pointing at your own
deployment, and set `MB_MIN_GAP_MS` no lower than 1000 to stay inside MusicBrainz's rate limit. The
in-process cache means you want a single instance (or accept a cold cache per instance) — a shared
Redis cache is only worth adding if you run many replicas.
