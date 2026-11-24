# Free Cloud Setup Guide

If your computer has `< 8 GB RAM`, a slow CPU, or cannot install local dependencies (`whisper.cpp`, OpenCV, Chrome Headless), ReelCraft supports **three free cloud options** that either you or your AI agent can connect in minutes.

---

## Option 1: Free Groq Whisper API (Best Hybrid Upgrade — 2 Minutes)

Transcribing locally with `whisper.cpp` (`large-v3-turbo`) requires ~4–6 GB RAM and takes 3–5 minutes on CPU. With Groq's free tier, the exact same `whisper-large-v3-turbo` model runs in **~2 seconds** with **0 local RAM**.

1. Sign up free at [https://console.groq.com](https://console.groq.com) and create an API key.
2. Copy `.env.example` to `.env` and set:
   ```bash
   GROQ_API_KEY=gsk_your_key_here
   ```
3. Verify connection:
   ```bash
   npm run doctor
   node scripts/transcribe.mjs <your-audio-or-video> --out=work/test --provider=groq
   ```
   *(When `GROQ_API_KEY` is present in `.env`, `scripts/transcribe.mjs` uses Groq automatically by default).*

---

## Option 2: Google Colab Free T4 GPU (Full Cloud Pipeline)

Use `cloud/reelcraft_colab.ipynb` when you want **zero local installation** and fast GPU processing:
1. Open [Google Colab](https://colab.research.google.com) → **File → Upload notebook** → select `cloud/reelcraft_colab.ipynb`.
2. Go to **Runtime → Change runtime type → T4 GPU (Free)**.
3. Run the cells in order:
   - Cell 1 installs Node 22, FFmpeg, HyperFrames, OpenCV, and clones ReelCraft.
   - Cell 2 uploads your raw video/audio.
   - Cell 3 transcribes (via Groq API or GPU Whisper) and runs YuNet face analysis.
   - Cell 4 renders your HyperFrames composition and downloads the final `.mp4`.

---

## Option 3: GitHub Codespaces (Free Monthly Cloud Machine)

This repository includes `.devcontainer/devcontainer.json` pre-configured with **Node.js 22, FFmpeg, and Python 3**:
1. On GitHub, click **Code → Codespaces → Create codespace on main**.
2. Wait ~2 minutes for the container to build (`npm install` runs automatically).
3. Run `npm run doctor` and start working with your agent right inside the browser.

---

## Option 4: HyperFrames Cloud Render (Optional)

If you have a HyperFrames account and want hosted cloud rendering without local Chrome Headless:
```bash
npx hyperframes cloud render work/<slug>/hyperframes --fps 30 --quality high -o out/<slug>.mp4
```
