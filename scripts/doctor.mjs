#!/usr/bin/env node
/**
 * ReelCraft Doctor — checks local hardware & tool readiness and recommends
 * Local Mode vs Free Cloud Fallback (Groq Whisper API / Google Colab / Codespaces).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env if present
const envPath = path.join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
}

function cmdOk(cmd, args = ["--version"]) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || r.stderr || "").trim().split("\n")[0] };
}

const totalRamGb = +(os.totalmem() / 1024 ** 3).toFixed(1);
const cpuCores = os.cpus().length;
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);

const ffmpeg = cmdOk("ffmpeg", ["-version"]);
const ffprobe = cmdOk("ffprobe", ["-version"]);
const ytdlp = cmdOk("yt-dlp", ["--version"]);
const hf = cmdOk("npx", ["--no-install", "hyperframes", "--version"]);

const venvPy = path.join(ROOT, ".venv-vision/bin/python");
const cv2Check = existsSync(venvPy)
  ? cmdOk(venvPy, ["-c", "import cv2; print('OpenCV ' + cv2.__version__)"])
  : { ok: false, out: "not installed (.venv-vision missing)" };

const yunetExists = existsSync(path.join(ROOT, "assets/models/yunet.onnx"));
const whisperBin = existsSync(path.join(ROOT, "whisper.cpp/main")) || existsSync(path.join(ROOT, "whisper.cpp/build/bin/whisper-cli"));
const hasGroqKey = Boolean(process.env.GROQ_API_KEY);
const hasBrowserEnv = Boolean(process.env.HYPERFRAMES_BROWSER_PATH && existsSync(process.env.HYPERFRAMES_BROWSER_PATH));

const checks = [
  { name: "Node.js >= 22", ok: nodeMajor >= 22, detail: `v${process.versions.node}` },
  { name: "RAM >= 8 GB (local Whisper)", ok: totalRamGb >= 7.5, detail: `${totalRamGb} GB (${cpuCores} cores)` },
  { name: "FFmpeg + FFprobe", ok: ffmpeg.ok && ffprobe.ok, detail: ffmpeg.ok ? ffmpeg.out.slice(0, 48) : "missing" },
  { name: "HyperFrames CLI", ok: hf.ok, detail: hf.ok ? hf.out : "run npm install" },
  { name: "yt-dlp (style references)", ok: ytdlp.ok, detail: ytdlp.ok ? ytdlp.out : "optional (pip install yt-dlp)" },
  { name: "OpenCV + YuNet (face tracking)", ok: cv2Check.ok && yunetExists, detail: cv2Check.ok ? `${cv2Check.out} + yunet.onnx` : cv2Check.out },
  { name: "Local whisper.cpp", ok: whisperBin, detail: whisperBin ? "installed" : "not installed (or use Groq free tier)" },
  { name: "Groq Free Cloud API (GROQ_API_KEY)", ok: hasGroqKey, detail: hasGroqKey ? "configured" : "not set in .env" },
];

console.log("\n=== ReelCraft Environment Doctor ===\n");
for (const c of checks) {
  console.log(`  ${c.ok ? "✓" : "✗"} ${c.name.padEnd(36)} ${c.detail}`);
}

console.log("\n=== Recommendation ===");
if (!ffmpeg.ok || nodeMajor < 22) {
  console.log("  ⚠ Missing hard prerequisites (Node 22+ or FFmpeg).");
  console.log("  → Use free cloud option: GitHub Codespaces (.devcontainer/) or Google Colab (cloud/reelcraft_colab.ipynb).");
} else if (totalRamGb < 7.5 || (!whisperBin && !hasGroqKey)) {
  console.log("  → Recommended mode: HYBRID / FREE CLOUD TRANSCRIPTION");
  console.log("    1. Get a free GROQ_API_KEY at https://console.groq.com and add it to .env");
  console.log("    2. Run transcription with: npm run transcribe -- <audio> --provider=groq");
  console.log("    3. Or run the full pipeline on free T4 GPU via cloud/reelcraft_colab.ipynb");
} else {
  console.log("  ✓ Ready for full LOCAL + HYBRID execution!");
  if (!cv2Check.ok) console.log("  ℹ Optional for talking-head eye-line tracking: npm run setup -- --vision");
  if (!hasBrowserEnv) console.log("  ℹ Ensure HyperFrames browser: npx hyperframes browser ensure");
}
console.log("");
