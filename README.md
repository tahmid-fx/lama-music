# Lama Music

A rebranded build of the open-source **LastWave** Android music player, plus a small read-only
**catalog & search API** for it.

This repository holds the branding work (scripts, icon sources, build/runtime reports) and the API.
The signed APK is attached to the [v5.3.0 release](../../releases/tag/v5.3.0) as
`LamaMusic-v5.3.0-universal.apk` (42,607,194 bytes, SHA-256
`3737b2f1d6a96501c2c7a8b8331b29a05681247a3f46ad14b7556f5e1838efbd`).

| | |
|---|---|
| App version | 5.3.0 (versionCode 34) |
| Package id | `com.lastwave.app` (unchanged) |
| Min / target SDK | 29 / 35 |
| APK size | 42,607,194 bytes |
| APK SHA-256 | `3737b2f1d6a96501c2c7a8b8331b29a05681247a3f46ad14b7556f5e1838efbd` |

## What the rebrand changed

The app is patched at the resource and presentation-literal level — it is the same player underneath,
not a rewrite.

- **Name and label** → "Lama Music" in all 20 bundled locales (306 resource strings).
- **Visible text** → 35 user-facing string literals in the DEX (About, onboarding, player messages).
- **Icons** → 103 PNGs regenerated: legacy launcher icons, round icons, and the adaptive icon's
  foreground/background/monochrome layers.
- **Theme** → the signature lime colour kept, with the app name swapped.

Preserved on purpose, and verified after building:

- package id `com.lastwave.app`, version, permissions, manifest components, intent filters;
- all 32 native libraries byte-identical; assets byte-identical;
- DEX shape unchanged (11,410 classes / 65,536 methods / 51,997 fields / 13,900 types);
- the audio engine, `lastwave://` URL scheme, intent actions, Discord/Jam server identifiers and
  the upstream update-check endpoint.

`REPORT.md` documents every modification, the verification method, and the runtime test results
(install, launch, playback, notification, background playback, lock-screen controls, About screen,
launcher icon). The emulator screenshots those checks refer to were produced during the build and are
not committed here — the repository deliberately ships without binary captures.

## Known caveats

1. **Different signing key.** This build is signed with its own key, so Android will not install it
   as an update over an existing LastWave install, and the two cannot share app data. Uninstall the
   original first (that also erases its local library/settings).
2. **The in-app updater still points at LastWave releases.** It may offer an upstream update that
   would replace this build. Ignore it, or let me know if you want it repointed.
3. **Discord Rich Presence / Jam identifiers are unchanged**, so presence will show the upstream app
   name where those integrations are involved.
4. **Size grew from 36.2 MB to 42.6 MB** because the regenerated icon set is stored as PNGs.

## The API

A dependency-free Bun + TypeScript service over open data: metadata from
[MusicBrainz](https://musicbrainz.org), cover art from the iTunes Search API. No keys, no accounts,
no scraping.

```bash
cd api
bun src/server.ts          # http://127.0.0.1:8788
```

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

| Endpoint | Purpose |
|---|---|
| `GET /v1/search?q=&type=&limit=&offset=` | Search artists / albums / tracks (`type=all\|artist\|album\|track`) |
| `GET /v1/artists/{mbid}` | Artist detail |
| `GET /v1/artists/{mbid}/albums?limit=&offset=&type=` | An artist's albums |
| `GET /v1/albums/{mbid}` | Album detail: every edition + the fullest tracklist |
| `GET /v1/tracks/{mbid}` | Track detail |
| `GET /v1/artwork?artist=&album=` | 600×600 cover art URL |
| `GET /health`, `GET /openapi.json` | Health probe, OpenAPI 3.1 spec |

Full documentation, response shapes and limits: [`api/README.md`](api/README.md).

## Repository layout

```
api/                 catalog + search API (Bun, no dependencies)
  src/               config, HTTP client, MusicBrainz & iTunes clients, routes
  tests/             unit tests (bun test)
  scripts/smoke.ts   live end-to-end checks against a running instance
  openapi.json       OpenAPI 3.1 description
scripts/             rebrand + icon generation + ADB helper scripts
REPORT.md            complete build, modification and runtime-test report
```

## License and attribution

This project is a derivative of [Clash-Projects/LastWave-Native](https://github.com/Clash-Projects/LastWave-Native),
which is licensed under the **GNU General Public License v3.0**. The rebranded app and this
repository are therefore distributed under the same license — see [`LICENSE`](LICENSE) and
[`NOTICE.md`](NOTICE.md) for the attribution and the source offer.

The API under `api/` is an original work and is licensed separately under the **MIT** license
(see [`api/LICENSE`](api/LICENSE)).

"Lama Music" is an unofficial rebrand and is not affiliated with or endorsed by the LastWave authors.
Music metadata © MusicBrainz contributors (CC0); cover art URLs point at Apple's iTunes Search API.
