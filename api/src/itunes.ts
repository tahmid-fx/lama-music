import { config } from "./config.ts";
import { TtlCache, cached } from "./cache.ts";
import { createThrottle, fetchJson } from "./http.ts";
import { normalizeTitle, upscaleArtwork } from "./normalize.ts";

const cache = new TtlCache<string | null>(config.cacheTtlMs, config.cacheMaxEntries);
const throttle = createThrottle(120);

type ItunesResponse = {
  resultCount?: number;
  results?: Array<{
    collectionName?: string;
    artistName?: string;
    artworkUrl100?: string;
    artworkUrl60?: string;
  }>;
};

type Hit = { artist: string; album: string; artworkUrl?: string };

/**
 * Scores how well an iTunes album result matches what we asked for.
 * 2 = exact title/artist, 1 = partial, 0 = unrelated.
 */
function score(hit: Hit, wantAlbum: string, wantArtist: string): number {
  const albumName = normalizeTitle(hit.album);
  const artistName = normalizeTitle(hit.artist);
  let s = 0;
  if (albumName === wantAlbum) s += 2;
  else if (albumName.includes(wantAlbum) || (wantAlbum && albumName.startsWith(wantAlbum))) s += 1;
  if (wantArtist && artistName === wantArtist) s += 2;
  else if (wantArtist && artistName.includes(wantArtist)) s += 1;
  return s;
}

async function searchItunes(params: Record<string, string>): Promise<ItunesResponse> {
  const url = new URL(`${config.itunesBase}/search`);
  url.searchParams.set("entity", "album");
  url.searchParams.set("media", "music");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  await throttle();
  return fetchJson<ItunesResponse>(url.toString(), { retries: 1 });
}

/**
 * iTunes needs no key and carries the same releases MusicBrainz describes, so
 * it is used only for cover art. Three passes, cheapest first: both names
 * together, then album title, then artist name. Returns null when nothing
 * matches well enough — callers treat artwork as optional.
 */
export async function findArtwork(artist: string, album: string): Promise<string | null> {
  const term = [artist, album].filter(Boolean).join(" ").trim();
  if (!term) return null;

  const key = `art:${term.toLowerCase()}`;
  const { value } = await cached(cache, key, async () => {
    const wantAlbum = normalizeTitle(album);
    const wantArtist = normalizeTitle(artist);

    const passes: Array<Record<string, string>> = [
      { term, limit: "10" },
      ...(album ? [{ term: album, attribute: "albumTerm", limit: "25" }] : []),
      ...(artist ? [{ term: artist, attribute: "artistTerm", limit: "50" }] : []),
    ];

    let best: { url: string; score: number } | null = null;
    for (const pass of passes) {
      const body = await searchItunes(pass).catch(() => null);
      const results = Array.isArray(body?.results) ? body.results : [];
      for (const r of results) {
        const url = upscaleArtwork(r.artworkUrl100 ?? r.artworkUrl60, 600);
        if (!url) continue;
        const s = score(
          { artist: r.artistName ?? "", album: r.collectionName ?? "" },
          wantAlbum,
          wantArtist,
        );
        if (!best || s > best.score) best = { url, score: s };
      }
      // Exact title and artist: no need to spend more upstream calls.
      if (best && best.score >= 4) break;
    }

    return best && best.score >= 2 ? best.url : null;
  });

  return value;
}

/** Best-effort enrichment: never fails the parent request. */
export async function lookupArtwork(artist: string, album: string): Promise<string | null> {
  return findArtwork(artist, album).catch(() => null);
}
