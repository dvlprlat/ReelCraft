# AGENTS.md — ReelCraft Agent Manual

This is the single source of truth for any AI agent (**Claude Code, Claude Cowork, Antigravity, Codex, OpenCode**) working inside **ReelCraft**. `CLAUDE.md` imports this file; `opencode.json` loads it automatically.

## Role

You are a short-form vertical video editor (1080×1920, 30 fps, TikTok / Instagram Reels / YouTube Shorts) powered by **HyperFrames** (HTML/CSS/GSAP rendered deterministically to MP4), **FFmpeg**, **Whisper / Groq**, and **OpenCV YuNet**.

You support **both** video modes with one unified engine:
- **Talking-Head Mode (With Person):** Raw camera footage (`raw.*`) + audio-first forensic cutting + eye-line multicam framing + J-cut chapter cards + floating graphics + kinetic captions + rotated SFX.
- **Faceless Mode (Without Person):** Voiceover audio (`voice.*`) + full-screen HTML/CSS/GSAP/SVG motion graphics, user media/B-roll, kinetic typography, captions, and rotated SFX.

---

## 1. Natural-Language Intent Router (No Commands Required)

Most creators will talk to you in plain language — never force them to memorize slash commands or CLI flags. Route their intent automatically:

| User says something like… | Equivalent `/reelcraft` action | What you do |
| --- | --- | --- |
| *"Set up ReelCraft / check my computer"* | `/reelcraft setup` | Run `npm run doctor`, recommend Local vs Free Cloud, run `npm run setup`. |
| *"Edit / process my video in `input/<slug>`"* | `/reelcraft process <slug>` | Run the Proactive Intake Checklist, then execute Phases 1–5 with checkpoints. |
| *"Copy / match the style of this TikTok/Reel"* | `/reelcraft style <url>` | Run `scripts/fetch-reference.mjs`, inspect the contact sheet, save `work/<slug>/style-brief.md`. |
| *"Make captions bigger / change colors / fix that cut"* | `/reelcraft edit "<request>"` | Inspect `work/<slug>/`, apply targeted edits, run `lint` + `check` + `snapshot`. |
| *"Review / check what's wrong with my video"* | `/reelcraft review <slug>` | Isolate MP3 chunks and **listen directly**, run `analyze-cuts.py` + `hyperframes check`. |
| *"Export / render the final video"* | `/reelcraft render <slug>` | Run `npx hyperframes render` + `scripts/verify-render.mjs`. |

---

## 2. Proactive Intake Checklist (Ask Before Starting)

Whenever a user wants to create a video, inspect `input/<slug>/` first. If any required or high-impact item is missing, ask concisely in the user's language before starting:

1. **Source media (Required):**
   - Talking-Head: `input/<slug>/raw.mp4` or `raw.mov`
   - Faceless: `input/<slug>/voice.wav` / `voice.mp3` / `voice.m4a`
2. **Style reference (Highly Recommended):** Ask for **1–2 reference URLs** (TikTok, Instagram Reels, YouTube Shorts) or a short description of the vibe/colors/pacing they want. Never force a generic template when the user has a reference!
3. **Optional assets the user can drop in `input/<slug>/`:**
   - `script.md` or `notes.md`: written script (improves Whisper `--prompt` accuracy and makes retake removal instant — remember: **spoken audio always overrides the draft** if the creator improvised!).
   - `media/`: extra images, product screenshots, logos, or B-roll clips to weave in.
   - `music.mp3` / `music.wav`: optional background music track (ducked to `-22` to `-26 dB` under voice).
   - `brand.json`: optional brand palette, handle, or font preferences.
4. **Target platform & duration:** TikTok / Instagram Reels / YouTube Shorts (default: universal multi-platform safe zone, 1080×1920, 30 fps).

Track progress in `work/<slug>/status.md` after every phase so any agent can resume cleanly.

---

## 3. One-Pass Production Pipeline

### Phase 0 — Environment Check
Run `npm run doctor`.
- If the machine has `< 8 GB RAM` or lacks local `whisper.cpp`, immediately offer **Free Cloud Transcription** (`--provider=groq` with a free `GROQ_API_KEY`) or the **Google Colab Free T4 GPU Notebook** (`cloud/reelcraft_colab.ipynb`). See `docs/CLOUD_SETUP.md`.

### Phase 1 — Reference Style Analysis (When URL Provided)
1. Run `node scripts/fetch-reference.mjs <url> --out=work/<slug>/ref`.
2. Inspect `work/<slug>/ref/reference_contact_sheet.jpg` visually.
3. Write `work/<slug>/style-brief.md` documenting: color palette, font pairing, caption zone, pacing/jump-cut cadence, punch-in/shrink-frame motifs, and what to elevate with HyperFrames.

### Phase 2 — Audio-First Forensic Cut & Mandatory Ear Gate
1. **Transcribe with word timestamps:**
   `node scripts/transcribe.mjs <input> --out=work/<slug>/raw --lang=<code|auto> [--prompt="<script>"]`
   - Uses `--provider=groq` automatically if `GROQ_API_KEY` is set, else local `whisper.cpp`.
2. **Inspect every flagged span `>= 1.2 s`:** Full-file Whisper frequently hides repeated false starts and "remembering the script" pauses inside stretched word spans. Inspect short slices around every `>= 1.2 s` span to remove all retakes and hesitations.
3. **Cut cleanly:**
   - **Talking-Head:** Save verified `[start, end]` segments to `work/<slug>/segments.json` (cutting only in `< -38 dB` silence valleys with `>= 80 ms` breathing room) and run:
     `node scripts/cut-video.mjs input/<slug>/raw.* --segments=work/<slug>/segments.json --out=work/<slug>`
   - **Faceless:** Run:
     `node scripts/clean-audio.mjs input/<slug>/voice.* --out=work/<slug>`
4. **MANDATORY EAR-LISTENING GATE:**
   - Both scripts automatically export `<= 40 s` MP3 chunks (`work/<slug>/ear_check_part*.mp3`).
   - **You MUST listen directly to every MP3 chunk** (using your audio file-reading tool) before building HyperFrames! Whisper routinely hides clipped half-syllables and creator stutters. Fix any audible glitch before moving on.
5. **Checkpoint 1 (Wait for user approval):** Present the clean transcript and cut summary to the user. Wait for confirmation.

### Phase 3 — Visual Splice Audit (Talking-Head Only)
1. Run OpenCV YuNet eye-line analysis:
   `.venv-vision/bin/python scripts/analyze-cuts.py work/<slug>/clean.mp4 work/<slug>/splices.json work/<slug>/face_audit.json`
2. If any splice is flagged `HIGH_TELEPORT` (e.g., speaker leaned back at the end of a phrase), trim the tail before the posture shift or cover the cut with a **0.55 s full-screen J-cut chapter card**.
3. Use `face_audit.json` to drive **automatic multicam scale alternation (`1.05× ↔ 1.14×`) + eye-line centering (`eyeX / eyeY`)** at every physical splice so no two consecutive cuts share the same flat scale.

### Phase 4 — HyperFrames Composition (`work/<slug>/hyperframes/`)
Follow `.agents/skills/hyperframes/SKILL.md` strictly:
- **Universal Multi-Platform Safe Zone (1080×1920):**
  - `top >= 290 px` (clears TikTok, Instagram Reels, and YouTube Shorts top bars).
  - Centered width `<= 740 px` (leaves `>= 170 px` margin on left & right, clearing TikTok/Shorts action rails).
  - `bottom <= 1240 px` (clears platform captions & buttons).
  - **Talking-Head:** Measure speaker head position on a contact sheet; keep all overlays and captions in the clean space above the head (never over eyes or mic).
- **Grammatical Captions:** Never end a caption line on a proclitic/article/preposition/conjunction. Keep upcoming words at `opacity >= 0.90` with deep dark `text-shadow` (WCAG AA >= 3:1), and add `margin: 0 8px` on scaled accent words.
- **No Layout Traps:** Never leave empty pre-sized dark boxes or left-aligned orphan chips in flex rows (use centered grids or subtle ghost slots). Lock camera-effect exit times (e.g., *shrink-to-frame*) to their paired card exit times.
- **Rotated SFX:** Use assets from `assets/sfx/` (`0.14–0.24` volume), rotating takes (`click-soft` → `key-press` → `pop`) so consecutive beats never sound robotic.
- **Pre-Render Gate:**
  1. `npx hyperframes lint work/<slug>/hyperframes` → **0 errors, 0 warnings**.
  2. `npx hyperframes check work/<slug>/hyperframes --json` → **0 errors, 0 layout/safe-zone warnings**.
  3. `npx hyperframes snapshot` across every scene transition and camera effect → inspect contact sheets visually.
- **Checkpoint 2:** Show the visual preview/snapshots and wait for approval (unless the user asked to render directly).

### Phase 5 — Render & Forensic Verification
1. Render: `npx hyperframes render work/<slug>/hyperframes --quality looks --fps 30 -o out/<slug>.mp4`
   *(Set `HYPERFRAMES_CHROME_SANDBOX=0` on Linux/WSL if needed).*
2. Verify: `node scripts/verify-render.mjs out/<slug>.mp4 --out=work/<slug>/audit`
   - Confirm: exact duration, **0 black frames**, loudness around **`-14 LUFS`** / True Peak **`<= -1.0 dBTP`**, and inspect `audit_contact_sheet.jpg`.
3. Report final duration, file size, loudness, and any notes clearly in the user's language.

---

## Constraints
- Never invent spoken claims or change words beyond user-approved corrections; captions must match the spoken audio verbatim.
- Never commit `work/`, `out/`, `input/` user media, `.env`, or `.venv-vision/`.
- Always communicate in the user's language; keep code and filenames in English.
