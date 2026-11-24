---
name: reelcraft
description: Produce vertical short-form videos (talking-head or faceless) for TikTok, Instagram Reels, and YouTube Shorts using HyperFrames, FFmpeg, Whisper/Groq, and OpenCV YuNet. Supports natural-language instructions and /reelcraft subcommands.
---

# ReelCraft Skill

Read `AGENTS.md` at the repository root for the full contract, folder structure, and quality gates.

## Command Router (`/reelcraft <subcommand> [args]`)

| Subcommand | Action |
| --- | --- |
| `/reelcraft setup` | Run `npm run doctor` + `npm run setup`. If RAM < 8 GB or local tools are missing, guide the user through `docs/CLOUD_SETUP.md` (free Groq Whisper API, Google Colab T4 GPU, or GitHub Codespaces). |
| `/reelcraft style <url>` | Run `node scripts/fetch-reference.mjs <url> --out=work/ref`, visually inspect the contact sheet, and write a reusable `style-brief.md`. |
| `/reelcraft process <slug>` | Inspect `input/<slug>/`, run the Proactive Intake Checklist (ask for mode, style reference, optional script/media/music), then execute Phases 1–5 from `AGENTS.md` with Checkpoints 1 & 2. |
| `/reelcraft edit "<instruction>"` | Inspect the active project in `work/<slug>/hyperframes/`, apply the requested natural-language change (style, pacing, captions, camera, SFX), run `lint` + `check` + `snapshot`, and confirm visually. |
| `/reelcraft review <slug>` | Run a full forensic audit: export/listen to MP3 ear-check chunks directly, run `scripts/analyze-cuts.py` (for talking-head), run `npx hyperframes check --json`, and report every issue with concrete fixes. |
| `/reelcraft render <slug>` | Render `out/<slug>.mp4` (`--quality looks --fps 30`) and run `node scripts/verify-render.mjs out/<slug>.mp4`. |
| `/reelcraft <free-form request>` | Route automatically using the Natural-Language Intent Router in `AGENTS.md`. |

## Non-Negotiable Quality Gates
1. **Direct Ear Listening:** Always listen to `ear_check_part*.mp3` before composing (Whisper hides stutters and clipped half-syllables).
2. **YuNet Eye-Line Audit (Talking-Head):** Always run `scripts/analyze-cuts.py` on `clean.mp4` + `splices.json`, eliminate `HIGH_TELEPORT` cuts, and alternate multicam scale (`1.05× ↔ 1.14×`) on every physical splice.
3. **Zero Safe-Zone Violations:** `npx hyperframes check --json` must pass with 0 layout/safe-zone errors across TikTok, Instagram Reels, and YouTube Shorts.
4. **Post-Render Audit:** `scripts/verify-render.mjs` must confirm 0 black frames and loudness near `-14 LUFS`.
