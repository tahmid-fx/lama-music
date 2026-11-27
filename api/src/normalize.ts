import { badRequest } from "./http.ts";

/** MusicBrainz identifiers are UUIDs. */
export const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMbid(raw: string | undefined, field = "id"): string {
  if (!raw || !MBID_RE.test(raw)) {
    throw badRequest(`"${field}" must be a MusicBrainz UUID`, "invalid_mbid", { field });
  }
  return raw.toLowerCase();
}

export function parseLimit(raw: string | null, def: number, max: number): number {
  if (raw === null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw badRequest(`"limit" must be an integer between 1 and ${max}`, "invalid_limit");
  }
  return n;
}

export function parseOffset(raw: string | null): number {
  if (raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    throw badRequest('"offset" must be an integer between 0 and 10000', "invalid_offset");
  }
  return n;
}

/** MusicBrainz returns artist credits as an array of parts with join phrases. */
export function buildArtistCredit(credit: unknown): string {
  if (!Array.isArray(credit)) return "";
  return credit
    .map((part) => {
      const p = part as { name?: string; artist?: { name?: string }; joinphrase?: string };
      return `${p.name ?? p.artist?.name ?? ""}${p.joinphrase ?? ""}`;
    })
    .join("")
    .trim();
}

export const toDurationSeconds = (lengthMs: number | null | undefined): number | null =>
  typeof lengthMs === "number" && lengthMs > 0 ? Math.round(lengthMs / 1000) : null;

/** Trims MusicBrainz search scores to an int 0-100. */
export function normalizeScore(score: unknown): number | null {
  const n = Number(score);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

/** Case/accents/punctuation-insensitive comparison used to match iTunes artwork. */
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** iTunes artwork URLs embed the size; request a large square instead of 100px. */
export function upscaleArtwork(url: string | undefined, size = 600): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

/** Escapes the five characters that matter when embedding text in HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
