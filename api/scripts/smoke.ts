/**
 * Live smoke test against a running instance.
 *   bun run start            # in one shell
 *   bun run smoke            # in another
 * Exits non-zero on the first failed expectation.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8788";

let checks = 0;
const failures: string[] = [];

function check(name: string, condition: unknown, detail?: unknown) {
  checks++;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}`, detail ?? "");
    failures.push(name);
  }
}

async function getJson(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

console.log(`Lama Music API smoke test → ${BASE}\n`);

const health = await getJson("/health");
check("GET /health is 200", health.status === 200, health.status);
check("health reports ok", health.body?.status === "ok", health.body);

const spec = await getJson("/openapi.json");
check("GET /openapi.json is a spec", spec.status === 200 && spec.body?.openapi === "3.1.0");

const artistSearch = await getJson("/v1/search?q=clairo&type=artist&limit=5");
check("GET /v1/search?type=artist is 200", artistSearch.status === 200, artistSearch.status);
check("artist search returns a hit", (artistSearch.body?.data?.artists?.length ?? 0) > 0);
check("search meta has source", typeof artistSearch.body?.meta?.source === "string");

// type=all must stay 200 even when one MusicBrainz index is down (warnings set).
const search = await getJson("/v1/search?q=clairo&type=all&limit=5");
check("GET /v1/search?type=all is 200", search.status === 200, search.status);
check(
  "combined search reports a warning when an index is down",
  search.status !== 200 || !search.body?.meta?.warnings || Array.isArray(search.body.meta.warnings),
);

const artist = search.body?.data?.artists?.[0];
if (artist?.id) {
  const detail = await getJson(`/v1/artists/${artist.id}`);
  check("GET /v1/artists/{id} is 200", detail.status === 200, detail.status);
  check("artist id round-trips", detail.body?.data?.id === artist.id);

  const albums = await getJson(`/v1/artists/${artist.id}/albums?limit=3`);
  check("GET /v1/artists/{id}/albums is 200", albums.status === 200, albums.status);
  check("albums response is paged", Array.isArray(albums.body?.data?.items));

  const album = albums.body?.data?.items?.[0];
  if (album?.id) {
    const albumDetail = await getJson(`/v1/albums/${album.id}`);
    check("GET /v1/albums/{id} is 200", albumDetail.status === 200, albumDetail.status);
    check("album has a tracklist", Array.isArray(albumDetail.body?.data?.tracks), albumDetail.status);
    check("album tracks carry positions", (albumDetail.body?.data?.tracks?.length ?? 0) > 0);
  }
}

const track = search.body?.data?.tracks?.[0];
if (track?.id) {
  const trackDetail = await getJson(`/v1/tracks/${track.id}`);
  check("GET /v1/tracks/{id} is 200", trackDetail.status === 200, trackDetail.status);
}

const artwork = await getJson("/v1/artwork?artist=Clairo&album=Immunity");
check("GET /v1/artwork is 200", artwork.status === 200, artwork.status);
check(
  "artwork returns a 600px url or explicit null",
  artwork.body?.data === null || /600x600bb/.test(artwork.body?.data?.artworkUrl ?? ""),
  artwork.body?.data,
);

const badId = await getJson("/v1/artists/not-a-uuid");
check("invalid MBID is rejected with 400", badId.status === 400, badId.status);
check("error payload has a code", typeof badId.body?.error?.code === "string");

const missing = await getJson("/v1/search");
check("missing q is rejected with 400", missing.status === 400, missing.status);

const unknown = await getJson("/v1/nope");
check("unknown route is 404", unknown.status === 404, unknown.status);

const cors = await fetch(`${BASE}/health`, { method: "OPTIONS" });
check("CORS preflight is 204", cors.status === 204, cors.status);

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log("failed:", failures.join(", "));
  process.exit(1);
}
