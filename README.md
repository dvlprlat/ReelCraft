<p align="left">
  <img src="assets/logo.svg" alt="ReelCraft Logo" width="56" height="56">
</p>

# ReelCraft

[![Tests](https://github.com/dvlprlat/ReelCraft/actions/workflows/test.yml/badge.svg)](https://github.com/dvlprlat/ReelCraft/actions/workflows/test.yml)
[![Website](https://img.shields.io/badge/web-reelcraft.dev-ff4d2e)](https://reelcraft.dev)

**Open-source, AI-agent-ready pipeline for turning raw footage or voiceovers into polished vertical videos for TikTok, Instagram Reels, and YouTube Shorts — using plain language.**

*[Visit reelcraft.dev →](https://reelcraft.dev) · [Leer guía en español →](docs/README.es.md)*

ReelCraft combines **HyperFrames** (HTML/CSS/GSAP video rendering), **FFmpeg**, **Whisper / Groq** (word-level transcription), and **OpenCV YuNet** (eye-line tracking & jump-cut masking) behind a universal agent workflow (**Claude Code, Claude Cowork, Antigravity, Codex, OpenCode**).

No React/TypeScript boilerplate. No rigid templates. Works for **both** **Talking-Head** (on-camera) and **Faceless** (voiceover + motion graphics / B-roll) videos in **any language**.

---

## Quickstart (For Non-Technical Creators)

You don't need to memorize commands — just tell your AI agent:

> *"Clone `reelcraft`, run setup, and help me edit my video."*

1. **Drop your files** into `input/<project-name>/` (see folder guide below).
2. **Tell your agent what you want**, for example:
   - *"Process `my-video` using this TikTok as a style reference: `https://...`"*
   - *"Make the captions slightly larger and warmer, and remove the pause at 0:24."*
   - *"Review my video for stutters or awkward cuts and re-render."*
3. Your rendered video lands in `out/<project-name>.mp4` (`1080×1920`, `30 fps`, `-14 LUFS`).

*(Power users can also invoke `/reelcraft setup`, `/reelcraft process <slug>`, `/reelcraft edit "..."`, `/reelcraft review <slug>`, `/reelcraft style <url>`, and `/reelcraft render <slug>` directly).*

---

## What to Put in `input/<project-name>/`

| File / Folder | Required? | Purpose |
| --- | --- | --- |
| `raw.mp4` or `raw.mov` | Required *(Talking-Head)* | Unedited vertical or horizontal camera recording. |
| `voice.wav` / `voice.mp3` / `voice.m4a` | Required *(Faceless)* | Voiceover recording for faceless motion-graphics videos. |
| `script.md` or `notes.md` | Optional | Written script or key points (improves transcription accuracy and retake removal). |
| `media/` | Optional | Extra photos, product screenshots, logos, or B-roll clips. |
| `music.mp3` or `music.wav` | Optional | Background music track (automatically ducked under voice). |
| `brand.json` | Optional | Preferred colors, handle, or typography notes. |

You can also simply paste **1–2 reference URLs** (TikTok, Instagram Reels, YouTube Shorts) in chat — your agent will download and analyze their visual style automatically.

---

## Minimum Requirements & Free Cloud Alternatives

| Component | Local Minimum | Recommended | Free Cloud Alternative |
| --- | --- | --- | --- |
| **Node.js** | 22+ | 22 / 24 LTS | GitHub Codespaces (`.devcontainer/`) |
| **FFmpeg** | 6.0+ (`loudnorm`, `blackdetect`, `ebur128`) | 7.0+ | Included in Colab & Codespaces |
| **RAM** | 4 GB *(with Groq API)* | 8–16 GB *(for local Whisper)* | **Groq Whisper API** (free tier, 0 local RAM) |
| **Transcription** | Local `whisper.cpp` (`large-v3-turbo`) | Local or Groq | **Groq Whisper API** (`--provider=groq`) |
| **Face Tracking** | Python 3.10+ (`opencv-python-headless`) | Optional (Talking-Head) | Included in `cloud/reelcraft_colab.ipynb` |
| **Rendering** | Chrome Headless (`hyperframes browser ensure`) | GPU or multi-core CPU | **Google Colab Free T4 GPU** (`cloud/reelcraft_colab.ipynb`) |

Run `npm run doctor` at any time — it checks your hardware and automatically tells you whether to run locally or enable the free cloud fallback. See **[docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md)** for 2-minute setup instructions.

---

## Manual CLI Reference (Step-by-Step)

```bash
npm install
npm run doctor                                                      # Check hardware & tools
npm run setup                                                       # Install browser (+ --full for OpenCV)
node scripts/fetch-reference.mjs "<url>" --out=work/demo/ref        # Analyze a style reference
node scripts/transcribe.mjs input/demo/raw.mp4 --out=work/demo/raw  # Transcribe (Groq or local Whisper)
node scripts/cut-video.mjs input/demo/raw.mp4 --segments=work/demo/segments.json --out=work/demo
.venv-vision/bin/python scripts/analyze-cuts.py work/demo/clean.mp4 work/demo/splices.json work/demo/face_audit.json
npx hyperframes check work/demo/hyperframes --json                  # Safe-zone & contrast audit
npx hyperframes render work/demo/hyperframes --quality looks -o out/demo.mp4
node scripts/verify-render.mjs out/demo.mp4                         # Final technical audit
```

---

## Bundled Open-Source Assets

- **Fonts (`assets/fonts/`):** Manrope, Playfair Display Italic, Montserrat Black, Anybody (SIL Open Font License).
- **SFX (`assets/sfx/`):** 19 royalty-free transition & accent sounds (Pixabay Content License — see `assets/sfx/CREDITS.md`).
- **Vision Model (`assets/models/yunet.onnx`):** OpenCV Zoo YuNet face & eye-landmark model (MIT).

## License

MIT — see [LICENSE](LICENSE).
