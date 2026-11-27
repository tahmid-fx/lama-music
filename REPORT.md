# Lama Music — Rebranding & Build Report

Rebrand of **LastWave 5.3.0** (Android) to **Lama Music**, performed as a resource- and
branding-level modification of the shipped APK. No application logic was rewritten.

---

## 1. Final deliverables

| Item | Path |
|---|---|
| **Final APK** | `out/LamaMusic-v5.3.0-universal.apk` (41.9 MB) |
| Unsigned build | `out/LamaMusic-v5.3.0-universal-unsigned.apk` |
| Signing keystore | `keys/lamamusic-release.keystore` (PKCS12) |
| Keystore password | `keys/keystore-password.txt` |
| Original, untouched APK | `input/LastWave-v5.3.0-universal.apk` |
| Branding previews | `docs/branding/` |
| Reproduction scripts | `scripts/logo.mjs`, `scripts/adaptive.mjs`, `scripts/rebrand.mjs`, `scripts/preview-adaptive.mjs` |

Final APK SHA-256: `3737b2f1d6a96501c2c7a8b8331b29a05681247a3f46ad14b7556f5e1838efbd`

The original APK was never modified: its SHA-256 is
`eb0903a87dfffbd3e3eb410de138ffa09be00a3b9b229d6799e66b787a008aac`, identical to the
upstream `SHA256SUMS.txt` published with release 5.3.0.

---

## 2. Method (and why not a full rebuild)

The APK was obtained from the official 5.3.0 release, checksum-verified, then:

1. Decoded with **apktool 3.0.3** (resources + smali; native libs and assets copied verbatim).
2. Branding resources, icons and user-facing literals replaced (details in §4).
3. Rebuilt with aapt2, zipaligned, and signed with a **new RSA-4096 key**.
4. Verified with **aapt2 2.19** and **apksigner (uber-apk-signer 1.3.0)**.

A from-source Gradle rebuild was deliberately avoided: it would require compileSdk 37 /
NDK / AGP 9.1.1 and would reproduce R8 optimisation passes on code that already ships
working. Editing the released artifact keeps the shipped audio engine, DEX and native
libraries exactly as the developer built them.

---

## 3. Original application — analysis

| Property | Value |
|---|---|
| Package | `com.lastwave.app` (unchanged) |
| Version | 5.3.0, versionCode 34 (unchanged) |
| minSdk / targetSdk / compileSdk | 29 / 35 / 37 |
| Launcher activities | `MainShellActivity` + 5 launcher `<activity-alias>` icon variants |
| DEX | 3 files (classes.dex 14.4 MB, classes2, classes3) |
| Native libraries | 32 `.so` files across arm64-v8a, armeabi-v7a, x86, x86_64 |
| Adaptive icons | `mipmap-anydpi/ic_launcher*.xml` (background + foreground + monochrome) |
| App name resource | `@string/app_name` |

Capabilities present in the original (documented from the APK/manifest and preserved):

- YouTube Music streaming/browsing/search, offline downloads, local device audio
- Playlists, queue, automix transitions, lyrics (multiple sources), podcasts
- Background playback via `MediaBrowserServiceCompat` + Media3 ExoPlayer 1.9.0
- Media notifications, lock-screen/media-session controls, headset & Bluetooth buttons
- Audio focus handling, audio effects; C++/Oboe engine with parametric EQ, AutoEQ,
  lossless addons and bit-perfect USB DAC output
- Last.fm scrobbling + stats, Spotify import, Discord Rich Presence, Google Cast, Android Auto
- Listen Together ("Jam"), Glance home-screen widgets (5 providers)
- Room database (v15), DataStore preferences, backup/restore, in-app update check

---

## 4. Branding changes

### Names and text
- **306 resource strings** replaced across the default and 20 locale files
  (`LastWave` → `Lama Music`, e.g. `app_name`, About, widgets, dialogs, toasts,
  settings copy, backup/restore messages, share sheets).
- **35 distinct hard-coded literals in DEX** replaced — only presentation copy:
  About/nav titles, snackbars, share text ("Join my Lama Music Jam session"),
  crash/USB diagnostic headers, Discord presence strings, media-session labels,
  lyrics source credit, and the export folder names (`/Lama Music/`, `/Lama Music/Backups/`).
- Deliberately **not** touched: class/method/package identifiers, prefs keys,
  intent actions & custom permission (`com.lastwave.app.*`), deep-link scheme
  `lastwave://`, HTTP user agents, the lyrics/addon backend URLs, the update-check URL,
  resource *names* (`settings_lastwave_theme`, `ic_lastwave_logo_mono`, `style/Theme.LastWave`).

### Icons and logo (from the supplied Lama Music artwork)
- Cropped the supplied logo to its 621×621 tile (auto-detected), never stretched.
- **103 PNG assets**: legacy launcher icons at mdpi→xxxhdpi (48–192 px) for all four
  icon variants incl. round masks, adaptive-icon foreground glyph layers, themed
  monochrome layer, in-app logo drawables, notification small icon and widget mark.
- **Adaptive icons restructured**: the old flat lime background became a brand
  gradient layer (`ic_launcher_bg*.xml`, purple → cobalt → cyan, sampled from your
  logo) with the llama glyph confined to the 66 dp safe zone, plus a monochrome layer
  for Android 13+ themed icons. Mask preview: `docs/branding/adaptive-icon-mask-preview.png`.
- Launcher background colours changed from signature lime to brand cobalt/cyan
  (white variant keeps a dark glyph, black variant keeps a light glyph).
- Splash screen follows `@mipmap/ic_launcher`, so it now shows the Lama Music icon.
- Notification/status-bar icons use the llama line-art glyph with transparency.

---

## 5. Preserved original features

Verified preserved by construction and by inspection of the rebuilt artifact:

- 32/32 native libraries **byte-identical** to the original APK (audio engine untouched).
- `assets/` **byte-identical** (AutoEQ targets, POToken page, etc.).
- DEX integrity: **classes 11,410 / methods 65,536 / fields 51,997 / types 13,900** —
  the same counts as the original in all three DEX files. No class or method was added
  or dropped; only string constants changed.
- Manifest untouched: same package, version, SDK levels, permissions, activities,
  services, receivers, providers, intent filters, and ABI list.
- Permissions unchanged (no permission added or removed).
- Database, preferences, deep links, Cast, Android Auto, widgets, USB audio all intact.

---

## 6. Signing information

| Field | Value |
|---|---|
| Keystore | `keys/lamamusic-release.keystore` (PKCS12) |
| Alias | `lamamusic` |
| Password | see `keys/keystore-password.txt` (same value for store and key) |
| Algorithm | RSA 4096-bit, SHA384withRSA |
| Validity | 2026-11-27 → 2056-11-19 (10,950 days) |
| Certificate SHA-256 | `07:A8:89:34:31:77:FF:29:FF:7B:8C:5B:2F:C9:C1:6A:C6:BC:E0:7B:84:83:0D:E0:BC:8B:CB:00:8D:A3:22:FE` |
| Schemes | v1 + v2 + v3 (v3 confirmed by apksigner); zipalign verified |

**Back up the keystore and password.** Every future Lama Music update must be signed with
this exact key or Android will refuse to update in place.

---

## 7. Verification performed

| Check | Result |
|---|---|
| Source APK checksum vs official SHA256SUMS | ✅ match |
| `aapt2 dump badging`: label / package / version / SDK / ABIs | ✅ `Lama Music`, `com.lastwave.app`, 34 / 5.3.0, 29/35, 4 ABIs |
| All 20 locale app labels | ✅ `Lama Music` |
| Compiled adaptive icon (background/foreground/monochrome) | ✅ present, gradient layer compiled |
| Icon bitmaps in APK inspected | ✅ correct artwork, gradients intact after aapt2 crunching |
| Native libraries vs original | ✅ 32/32 identical |
| Assets vs original | ✅ identical |
| DEX class/method/field/type counts vs original | ✅ identical |
| Remaining `LastWave` in user-facing strings | ✅ none (only internal resource/class names) |
| Signature + zipalign verification | ✅ v1/v2/v3, zipalign verified |
| Original APK unmodified | ✅ checksum matches upstream |

### Runtime verification — now performed

A real install/launch/playback pass was executed on an Android 15 (API 35, arm64-v8a)
emulator, and cross-checked against the untouched original APK as a control. Results and
evidence are in **§11**.

---

## 8. Known limitations

1. **Signature change** — this APK cannot install as an update over an existing LastWave
   install (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Uninstall LastWave first (its data will
   be lost unless exported), or install on a clean profile. It will likewise not receive
   updates from the original developer.
2. **In-app updater** — the update checker still points at the LastWave GitHub releases and
   would offer a LastWave APK that cannot install over this signature. The 5.3.0 build is
   current, so nothing prompts today; the URL was intentionally left untouched (functional
   string), but it should be repointed or disabled in a future source build.
3. **Remote assets still original** — Discord Rich Presence large-image URL and the Jam
   server (`jam.clashgram.org`) are hosted branding/infrastructure, unchanged.
4. **Lime "signature theme"** — the optional theme's palette is a hard-coded Material
   scheme in the original code (lime/teal). It is renamed to "Lama Music Signature Theme"
   but not recoloured; doing so would alter the app's whole design system.
5. **APK size** 36.2 MB → 41.9 MB, because the rebuild keeps unshrunk resources (R8
   resource shrinking is not applied by apktool) and adds density-specific icon art.
6. **Internal names preserved on purpose** — package `com.lastwave.app`, `lastwave://`
   deep links, `Theme.LastWave` style names, prefs/db identifiers and native library names.
   These are not user-visible and changing them risks breaking Last.fm auth callbacks,
   upgrades and native code.
7. Launcher icons' thin line-art has hairline gaps where the supplied artwork's strokes fade
   out; this is in the source image, not a scaling artifact.

---

## 9. Device checks (executed on emulator — see §11)

1. Uninstall any existing LastWave, then install `LamaMusic-v5.3.0-universal.apk`.
2. Launcher label shows **Lama Music**, icon is the new llama mark (test on a home screen,
   the app drawer, Recents, and Settings → Apps).
3. Cold start: splash shows the new icon, no crash.
4. Sign in / browse, play a track, lock the screen → media notification and lock-screen
   controls show "Lama Music".
5. Background playback, headset pause/resume, Settings → About shows "Lama Music" and the
   new logo, and the equalizer/Audio pages open.

---

## 10. Reproduce

```bash
# 1. decode the released APK
java -jar tools/apktool.jar d -f -o work/apk-v2 input/LastWave-v5.3.0-universal.apk
# 2. generate icon assets from the supplied logo
sips -s format png logo.webp --out work/brand/logo-source.png
bun scripts/logo.mjs work/brand/logo-source.png work/brand/out
bun scripts/adaptive.mjs
# 3. apply branding (strings, DEX presentation literals, icons, adaptive layers)
bun scripts/rebrand.mjs work/apk-v2 work/brand/out --apply
# 4. build + sign
java -jar tools/apktool.jar b work/apk-v2 -o out/LamaMusic-unsigned.apk
java -jar tools/uber-apk-signer.jar -a out/LamaMusic-unsigned.apk \
  --ks keys/lamamusic-release.keystore --ksAlias lamamusic \
  --ksPass "$(cat keys/keystore-password.txt)" --ksKeyPass "$(cat keys/keystore-password.txt)" \
  -o out/signed
```

---

## 11. Runtime verification (Android 15 emulator)

Environment: Android 15 / API 35, `google_apis`, arm64-v8a, Pixel 6 profile, 1080×2400,
headless (`-no-window -no-audio -gpu swiftshader_indirect`), SDK installed under
`android-sdk/` in this project. App installed with `adb install` → **Success**
(`versionName=5.3.0`, `versionCode=34`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Install on Android 15 | **PASS** | `adb install` Success; `pm list packages` → `com.lastwave.app` |
| 2 | Cold start, no crash | **PASS** | Process alive (`pidof` 4254/7412); crash buffer empty; 0 `FATAL EXCEPTION`; 0 `ANR` |
| 3 | Runtime permission dialogs | **PASS** | System prompts read "Allow **Lama Music** to send you notifications?" and "… access music and audio" |
| 4 | Onboarding/marketing screen branding | **PASS** | Title "Lama Music", tagline present (`docs/runtime-tests/02-onboarding.png`) |
| 5 | Guest home / recommended content | **PASS** | Home, genres, Discover populated |
| 6 | Play a track (streaming, guest) | **PASS** | Session `state=PLAYING(3)`; `AudioTrack state:started` 48 kHz; **frames written +385,152 in 8 s ≈ 8.0 s of audio**; queue auto-advanced through 3 tracks |
| 7 | Media notification | **PASS** | Ongoing MediaStyle notification: title "Shut up My Moms Calling", text "Hotel Ugly", 6 actions, `category=transport`, icon `drawable/ic_launcher_logo` (new glyph); visible in shade (`04-notification-shade.png`) |
| 8 | Background playback | **PASS** | After HOME: session still `PLAYING`, `AudioTrack state:started`, `MusicPlaybackService isForeground=true foregroundId=4102`, notification persisted |
| 9 | Lock-screen media controls | **PASS** | Controls + album art rendered on keyguard, playback continued (`07-lockscreen-controls.png`) |
| 10 | Headset/media-button path | **PASS** | `KEYCODE_MEDIA_PAUSE` → `PAUSED(2)`; `KEYCODE_MEDIA_PLAY` → `PLAYING(3)` |
| 11 | Settings navigation | **PASS** | Settings tree opens; "Lama Music Jam" entry renamed |
| 12 | About screen | **PASS** | "Lama Music", "Version 5.3.0", "Made by Lama Music Team", new circular logo (`05-about.png`) |
| 13 | Launcher icon + label | **PASS** | Dock entry labelled "Lama Music" with new adaptive icon (`06-launcher-icon.png`) |
| 14 | Rebrand did not change behaviour | **PASS (control)** | Original APK installed on the same emulator reproduced identically: `PLAYING`, same +385,152 frames/8 s, and the **same static `position`** |

### Observations (not failures, and not caused by the rebrand)
- **Media-session position is static** in `dumpsys media_session` (`position=0/41`) while audio
  renders. The untouched original APK shows exactly the same value, so this is pre-existing
  app behaviour (the session only publishes state on events), confirmed by the A/B control.
- **About-screen glyph** shows hairline gaps in the thinnest strokes (visible at 72 dp). This
  comes from the supplied raster artwork's soft/fading strokes, not from scaling. Launcher
  and notification sizes look clean.
- Notification channel id (`lastwave_playback_v3`) and MediaSession tag (`LastWavePlayer`) are
  internal identifiers, intentionally preserved.

### Not covered in this run
- Signed-in YouTube Music account features (only guest mode was exercised; no account was used).
- Bluetooth, Cast and USB-DAC output (no such hardware in the emulator).
- Android 7 `minSdk` build variant and other Android versions (single API 35 emulator).
- Emulator audio is muted (`-no-audio`); correctness was verified by decoded audio frame
  counters rather than by listening.

Screenshots: `docs/runtime-tests/`.

### Restart the emulator
```bash
export ANDROID_SDK_ROOT=$PWD/android-sdk
android-sdk/emulator/emulator -avd lama35 -no-window -no-audio -gpu swiftshader_indirect &
android-sdk/platform-tools/adb wait-for-device
```
