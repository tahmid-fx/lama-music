# Notice and attribution

## Upstream project

Lama Music is an unofficial rebrand of **LastWave**, an open-source Android music player:

- Upstream: https://github.com/Clash-Projects/LastWave-Native
- Upstream version this build is based on: **5.3.0** (versionCode 34)
- Upstream license: **GNU General Public License, version 3** (`LICENSE` in this repository)

The rebranded application is a modified version of that work and is distributed under the GPLv3.

## Corresponding source (GPLv3 §6)

The modified application is produced from the unmodified upstream release by the scripts in
`scripts/`, applied to a decoded copy of the upstream APK:

1. `input/LastWave-v5.3.0-universal.apk` — the unmodified upstream binary, published by the LastWave
   project with its own `SHA256SUMS.txt` (SHA-256 `eb0903a87dfffbd3e3eb410de138ffa09be00a3b9b229d6799e66b787a008aac`).
2. `scripts/rebrand.mjs` — replaces the display name in resources, the user-facing string literals in
   the DEX, and the icon set; `scripts/logo.mjs`, `scripts/adaptive.mjs`,
   `scripts/preview-adaptive.mjs` generate the new branding assets.
3. `REPORT.md` — records every change made, byte-level, plus the verification that no functional
   component was altered.
4. Build and signing steps are documented in `REPORT.md` so the modified binary can be reproduced
   from the upstream APK by anyone.

No upstream source file was modified: the changes are limited to presentation resources (strings,
icons, theme name) and user-visible text literals, so the upstream source at the linked repository,
together with the scripts and report in this repository, constitutes the corresponding source of this
modified version.

## Third-party components

The application bundles components from the upstream project, including AndroidX Media3 and its
FFmpeg decoder extension, and third-party libraries listed by the upstream project. Their licenses
and notices are unchanged and remain in effect.

## Data sources used by the API

- **MusicBrainz** — metadata, licensed CC0. Clients must send a descriptive `User-Agent` and stay at
  or below one request per second; the API enforces both.
- **iTunes Search API** — cover art lookups, used only to resolve artwork URLs. Artwork remains the
  property of its respective rights holders.

## Trademarks

"Lama Music" is an unofficial community rebrand and is not affiliated with, endorsed by, or
sponsored by the LastWave authors. All other product names, logos and brands are the property of
their respective owners.
