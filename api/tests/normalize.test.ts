import { describe, expect, test } from "bun:test";
import {
  buildArtistCredit,
  normalizeScore,
  normalizeTitle,
  parseLimit,
  parseMbid,
  parseOffset,
  toDurationSeconds,
  upscaleArtwork,
} from "../src/normalize.ts";
import { escapeLucene } from "../src/musicbrainz.ts";
import { TtlCache } from "../src/cache.ts";

describe("parseMbid", () => {
  test("accepts a canonical uuid and lowercases it", () => {
    expect(parseMbid("F2C8A3F0-6F36-4F10-9F36-0F2D1A3B1F9E")).toBe(
      "f2c8a3f0-6f36-4f10-9f36-0f2d1a3b1f9e",
    );
  });

  test("rejects malformed ids", () => {
    expect(() => parseMbid("not-a-uuid")).toThrow();
    expect(() => parseMbid("f2c8a3f06f364f109f360f2d1a3b1f9e")).toThrow();
    expect(() => parseMbid(undefined)).toThrow();
  });
});

describe("pagination parameters", () => {
  test("limit defaults, bounds and integers", () => {
    expect(parseLimit(null, 20, 50)).toBe(20);
    expect(parseLimit("1", 20, 50)).toBe(1);
    expect(parseLimit("50", 20, 50)).toBe(50);
    expect(() => parseLimit("0", 20, 50)).toThrow();
    expect(() => parseLimit("51", 20, 50)).toThrow();
    expect(() => parseLimit("2.5", 20, 50)).toThrow();
  });

  test("offset defaults and rejects negatives", () => {
    expect(parseOffset(null)).toBe(0);
    expect(parseOffset("40")).toBe(40);
    expect(() => parseOffset("-1")).toThrow();
    expect(() => parseOffset("abc")).toThrow();
  });
});

describe("MusicBrainz mapping helpers", () => {
  test("joins artist credits with their join phrases", () => {
    expect(
      buildArtistCredit([
        { name: "Calvin Harris", joinphrase: " feat. " },
        { name: "Dua Lipa" },
      ]),
    ).toBe("Calvin Harris feat. Dua Lipa");
    expect(buildArtistCredit(undefined)).toBe("");
  });

  test("converts track length to whole seconds", () => {
    expect(toDurationSeconds(215_480)).toBe(215);
    expect(toDurationSeconds(0)).toBeNull();
    expect(toDurationSeconds(null)).toBeNull();
  });

  test("clamps search scores into 0-100", () => {
    expect(normalizeScore("100")).toBe(100);
    expect(normalizeScore(150)).toBe(100);
    expect(normalizeScore(-4)).toBe(0);
    expect(normalizeScore(undefined)).toBeNull();
  });

  test("escapes lucene syntax so queries cannot be broken by input", () => {
    expect(escapeLucene("AC/DC")).toBe("AC\\/DC");
    expect(escapeLucene('say "hi"')).toBe("say \\\"hi\\\"");
    expect(escapeLucene("a+b")).toBe("a\\+b");
  });
});

describe("artwork and text helpers", () => {
  test("requests a large square instead of the 100px thumbnail", () => {
    expect(
      upscaleArtwork("https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg"),
    ).toBe("https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg");
    expect(upscaleArtwork(undefined)).toBeNull();
    expect(upscaleArtwork("https://example.test/cover.jpg")).toBe("https://example.test/cover.jpg");
  });

  test("normalises titles for fuzzy matching", () => {
    expect(normalizeTitle("Immunity")).toBe("immunity");
    expect(normalizeTitle("Sgt. Pepper's")).toBe("sgt pepper s");
    expect(normalizeTitle("Beyoncé & Jay-Z")).toBe("beyonce and jay z");
  });
});

describe("TtlCache", () => {
  test("returns values until the TTL expires, then misses", async () => {
    const cache = new TtlCache<number>(20, 10);
    cache.set("k", 1);
    expect(cache.get("k")).toBe(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(cache.get("k")).toBeUndefined();
  });

  test("evicts the oldest entry when full", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });
});
