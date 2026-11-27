import { config } from "./config.ts";
import { TtlCache, cached } from "./cache.ts";
import { ApiError, createThrottle, fetchJson, notFound } from "./http.ts";
import {
  buildArtistCredit,
  normalizeScore,
  toDurationSeconds,
} from "./normalize.ts";
import type {
  AlbumDetail,
  AlbumSummary,
  AlbumTrack,
  ArtistSummary,
  TrackSummary,
} from "./types.ts";

const cache = new TtlCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
const throttle = createThrottle(config.musicbrainzMinGapMs);

type Json = Record<string, unknown>;

async function mb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: { lookup?: boolean } = {},
): Promise<T> {
  const url = new URL(`${config.musicbrainzBase}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  await throttle();
  return fetchJson<T>(url.toString(), { lookup: opts.lookup });
}

/** Escapes Lucene syntax so user input cannot break the query. */
export function escapeLucene(value: string): string {
  return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1").trim();
}

function mapArtist(raw: Json): ArtistSummary {
  const span = raw["life-span"] as Json | undefined;
  return {
    id: String(raw["id"] ?? ""),
    name: String(raw["name"] ?? ""),
    sortName: (raw["sort-name"] as string) ?? null,
    type: (raw["type"] as string) ?? null,
    country: (raw["country"] as string) ?? null,
    disambiguation: (raw["disambiguation"] as string) ?? null,
    lifeSpan: span
      ? {
          begin: (span["begin"] as string) ?? null,
          end: (span["end"] as string) ?? null,
          ended: Boolean(span["ended"]),
        }
      : null,
    tags: Array.isArray(raw["tags"])
      ? (raw["tags"] as Json[]).map((t) => String(t["name"] ?? "")).filter(Boolean).slice(0, 8)
      : [],
    score: normalizeScore(raw["score"]),
  };
}

function primaryArtistId(raw: Json): string | null {
  const credit = raw["artist-credit"];
  if (!Array.isArray(credit) || credit.length === 0) return null;
  const first = credit[0] as { artist?: { id?: string } };
  return first.artist?.id ?? null;
}

function mapAlbum(raw: Json, artworkUrl: string | null = null): AlbumSummary {
  return {
    id: String(raw["id"] ?? ""),
    title: String(raw["title"] ?? ""),
    artist: buildArtistCredit(raw["artist-credit"]),
    artistId: primaryArtistId(raw),
    primaryType: (raw["primary-type"] as string) ?? (raw["type"] as string) ?? null,
    secondaryTypes: Array.isArray(raw["secondary-types"]) ? (raw["secondary-types"] as string[]) : [],
    firstReleaseDate: (raw["first-release-date"] as string) ?? null,
    score: normalizeScore(raw["score"]),
    artworkUrl,
  };
}

/** A recording appears on many releases; prefer the one that belongs to a studio album. */
function pickAlbumRelease(raw: Json): Json | null {
  const releases = Array.isArray(raw["releases"]) ? (raw["releases"] as Json[]) : [];
  if (!releases.length) return null;
  const album = releases.find(
    (r) => ((r["release-group"] as Json | undefined)?.["primary-type"] as string) === "Album",
  );
  return album ?? releases[0] ?? null;
}

function mapTrack(raw: Json): TrackSummary {
  const release = pickAlbumRelease(raw);
  return {
    id: String(raw["id"] ?? ""),
    title: String(raw["title"] ?? ""),
    artist: buildArtistCredit(raw["artist-credit"]),
    artistId: primaryArtistId(raw),
    album: release ? String(release["title"] ?? "") : null,
    durationSeconds: toDurationSeconds(raw["length"] as number | undefined),
    score: normalizeScore(raw["score"]),
  };
}

/** MusicBrainz answers 400 "Invalid mbid." for unknown ids, 404 for some routes. */
async function lookupOr404<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
      throw notFound(message);
    }
    throw err;
  }
}

export async function searchArtists(
  query: string,
  limit: number,
  offset: number,
): Promise<{ items: ArtistSummary[]; total: number; cached: boolean }> {
  const key = `artist:${query}:${limit}:${offset}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    mb<Json>("/artist", { query: escapeLucene(query), limit, offset }),
  );
  const artists = Array.isArray(value["artists"]) ? (value["artists"] as Json[]) : [];
  return {
    items: artists.map(mapArtist),
    total: Number(value["count"] ?? artists.length),
    cached: hit,
  };
}

export async function searchAlbums(
  query: string,
  limit: number,
  offset: number,
  artworkFor?: (album: AlbumSummary) => Promise<string | null>,
): Promise<{ items: AlbumSummary[]; total: number; cached: boolean }> {
  const key = `rg:${query}:${limit}:${offset}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    mb<Json>("/release-group", { query: escapeLucene(query), limit, offset }),
  );
  const groups = Array.isArray(value["release-groups"]) ? (value["release-groups"] as Json[]) : [];
  const items = groups.map((g) => mapAlbum(g));
  if (artworkFor) {
    await Promise.all(
      items.map(async (item) => {
        item.artworkUrl = await artworkFor(item).catch(() => null);
      }),
    );
  }
  return { items, total: Number(value["count"] ?? items.length), cached: hit };
}

export async function searchTracks(
  query: string,
  limit: number,
  offset: number,
): Promise<{ items: TrackSummary[]; total: number; cached: boolean }> {
  const key = `rec:${query}:${limit}:${offset}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    mb<Json>("/recording", { query: escapeLucene(query), limit, offset }),
  );
  const recordings = Array.isArray(value["recordings"]) ? (value["recordings"] as Json[]) : [];
  return { items: recordings.map(mapTrack), total: Number(value["count"] ?? recordings.length), cached: hit };
}

export async function getArtist(mbid: string): Promise<{ artist: ArtistSummary; cached: boolean }> {
  const key = `artist:${mbid}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    lookupOr404(async () => {
      const raw = await mb<Json>(`/artist/${mbid}`, { inc: "tags" }, { lookup: true });
      if (!raw["id"]) throw notFound("Artist not found");
      return raw;
    }, "Artist not found"),
  );
  return { artist: mapArtist(value), cached: hit };
}

export async function getArtistAlbums(
  mbid: string,
  limit: number,
  offset: number,
  releaseType?: string,
): Promise<{ items: AlbumSummary[]; total: number; cached: boolean }> {
  const key = `artist:${mbid}:albums:${releaseType ?? "all"}:${limit}:${offset}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    mb<Json>("/release-group", {
      artist: mbid,
      inc: "artist-credits",
      limit,
      offset,
      type: releaseType,
    }),
  );
  const groups = Array.isArray(value["release-groups"]) ? (value["release-groups"] as Json[]) : [];
  return {
    items: groups.map((g) => mapAlbum(g)),
    total: Number(value["release-group-count"] ?? value["count"] ?? groups.length),
    cached: hit,
  };
}

/** Picks the release with the most tracks so tracklists are complete. */
function pickBestRelease(releases: Json[]): Json | null {
  let best: Json | null = null;
  let bestCount = -1;
  for (const release of releases) {
    const media = Array.isArray(release["media"]) ? (release["media"] as Json[]) : [];
    const count = media.reduce((sum, m) => sum + Number(m["track-count"] ?? 0), 0);
    if (count > bestCount) {
      best = release;
      bestCount = count;
    }
  }
  return best;
}

function tracksOf(release: Json | null): AlbumTrack[] {
  if (!release) return [];
  const media = Array.isArray(release["media"]) ? (release["media"] as Json[]) : [];
  return media.flatMap((medium, discIndex) => {
    const list = Array.isArray(medium["tracks"]) ? (medium["tracks"] as Json[]) : [];
    return list.map((t) => ({
      position: Number(t["position"] ?? 0),
      disc: discIndex + 1,
      title: String(t["title"] ?? ""),
      recordingId: (t["recording"] as Json | undefined)?.["id"]
        ? String((t["recording"] as Json)["id"])
        : null,
      durationSeconds: toDurationSeconds(t["length"] as number | undefined),
    }));
  });
}

export async function getAlbum(mbid: string): Promise<{ album: AlbumDetail; cached: boolean }> {
  const key = `rg:${mbid}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    lookupOr404(async () => {
    const group = await mb<Json>(`/release-group/${mbid}`, { inc: "artist-credits" }, { lookup: true });
    if (!group["id"]) throw notFound("Album not found");

    // Editions of one album differ; take the one with the most tracks so the
    // tracklist we return is the complete one.
    const browse = await mb<Json>("/release", { "release-group": mbid, inc: "recordings+media", limit: 100 });
    const releases = Array.isArray(browse["releases"]) ? (browse["releases"] as Json[]) : [];
    const best = pickBestRelease(releases);

    return {
      group,
      releases: releases.map((r) => ({
        id: String(r["id"] ?? ""),
        title: String(r["title"] ?? ""),
        date: (r["date"] as string) ?? null,
        country: (r["country"] as string) ?? null,
        trackCount: Number(r["track-count"] ?? 0),
      })),
      tracks: tracksOf(best),
    };
    }, "Album not found"),
  );

  const group = value["group"] as Json;
  const tracks = (value["tracks"] as AlbumTrack[]) ?? [];
  const releases = (value["releases"] as AlbumDetail["releases"]) ?? [];
  const total = tracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);

  return {
    album: {
      ...mapAlbum(group),
      releases,
      tracks,
      totalDurationSeconds: total > 0 ? total : null,
    },
    cached: hit,
  };
}

export async function getTrack(mbid: string): Promise<{ track: TrackSummary; cached: boolean }> {
  const key = `rec:${mbid}`;
  const { value, cached: hit } = await cached(cache as TtlCache<Json>, key, () =>
    lookupOr404(async () => {
      const raw = await mb<Json>(
        `/recording/${mbid}`,
        { inc: "artist-credits+releases+release-groups" },
        { lookup: true },
      );
      if (!raw["id"]) throw notFound("Track not found");
      return raw;
    }, "Track not found"),
  );
  return { track: mapTrack(value), cached: hit };
}

export { pickBestRelease };
