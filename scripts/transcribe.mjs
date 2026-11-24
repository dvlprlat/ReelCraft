#!/usr/bin/env node
/**
 * Unified word-level transcription for ReelCraft.
 * Supports:
 *   --provider=groq   (Free cloud tier via Groq Whisper large-v3-turbo, 0 local RAM)
 *   --provider=local  (Local whisper.cpp binary with large-v3-turbo)
 *
 * Usage:
 *   node scripts/transcribe.mjs <input-audio-or-video> --out <dir> [--provider=auto|groq|local] [--lang=es] [--prompt="..."]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env
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

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith("--"));
const opt = (k, def) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};

if (!input) {
  console.error("Usage: node scripts/transcribe.mjs <audio-or-video> --out=<dir> [--provider=auto|groq|local] [--lang=es] [--prompt=...]");
  process.exit(1);
}

const outDir = opt("out", path.dirname(input));
mkdirSync(outDir, { recursive: true });
const lang = opt("lang", "");
const prompt = opt("prompt", "");
let provider = opt("provider", "auto");

const localWhisper = [
  path.join(ROOT, "whisper.cpp/main"),
  path.join(ROOT, "whisper.cpp/build/bin/whisper-cli"),
].find((p) => existsSync(p));

if (provider === "auto") {
  provider = process.env.GROQ_API_KEY ? "groq" : localWhisper ? "local" : "none";
}

if (provider === "none") {
  console.error("No transcription provider available.");
  console.error("Option A (Free Cloud, recommended): add GROQ_API_KEY to .env (https://console.groq.com).");
  console.error("Option B (Local): install whisper.cpp + ggml-large-v3-turbo.bin in ./whisper.cpp/");
  process.exit(1);
}

let words = [];

if (provider === "groq") {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("Missing GROQ_API_KEY in environment or .env.");
    process.exit(1);
  }
  // Convert to compact 16kHz mono MP3 (< 25 MB Groq limit)
  const mp3Path = path.join(outDir, "transcribe_input.mp3");
  const conv = spawnSync("ffmpeg", ["-nostdin", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", mp3Path], { encoding: "utf8" });
  if (conv.status !== 0) {
    console.error(conv.stderr);
    process.exit(1);
  }

  const form = new FormData();
  const blob = new Blob([readFileSync(mp3Path)], { type: "audio/mpeg" });
  form.append("file", blob, "audio.mp3");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (lang) form.append("language", lang);
  if (prompt) form.append("prompt", prompt);

  console.log("Transcribing via Groq Whisper API (whisper-large-v3-turbo)...");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.error(`Groq API error ${res.status}:`, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  words = (data.words || []).map((w) => ({
    text: String(w.word || "").trim(),
    startMs: Math.round((w.start || 0) * 1000),
    endMs: Math.round((w.end || 0) * 1000),
    confidence: 1.0,
  })).filter((w) => w.text.length > 0);
} else {
  const wavPath = path.join(outDir, "transcribe_16k.wav");
  const conv = spawnSync("ffmpeg", ["-nostdin", "-y", "-i", input, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wavPath], { encoding: "utf8" });
  if (conv.status !== 0) {
    console.error(conv.stderr);
    process.exit(1);
  }
  const modelPath = path.join(ROOT, "whisper.cpp/ggml-large-v3-turbo.bin");
  if (!existsSync(modelPath)) {
    console.error(`Missing Whisper model at ${modelPath}`);
    process.exit(1);
  }
  const baseOut = path.join(outDir, "whisper_raw");
  const wArgs = ["-m", modelPath, "-f", wavPath, "-ojf", "-osrt", "-of", baseOut];
  if (lang) wArgs.push("-l", lang);
  if (prompt) wArgs.push("--prompt", prompt);
  console.log("Transcribing locally via whisper.cpp...");
  const wr = spawnSync(localWhisper, wArgs, { encoding: "utf8" });
  if (wr.status !== 0) {
    console.error(wr.stderr);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(`${baseOut}.json`, "utf8"));
  for (const seg of raw.transcription || []) {
    let cur = null;
    for (const t of seg.tokens || []) {
      if (t.text.startsWith("[_")) continue;
      const startsSpace = t.text.startsWith(" ");
      const clean = t.text.trim();
      if (!clean) continue;
      if (/^[.,?!¿¡;:"()]+$/.test(clean)) {
        if (cur) { cur.text += clean; cur.endMs = t.offsets.to; }
        continue;
      }
      if (startsSpace || !cur) {
        if (cur) words.push(cur);
        cur = { text: clean, startMs: t.offsets.from, endMs: t.offsets.to, confidence: t.p ?? 1.0 };
      } else {
        cur.text += clean;
        cur.endMs = t.offsets.to;
        cur.confidence = Math.min(cur.confidence, t.p ?? 1.0);
      }
    }
    if (cur) words.push(cur);
  }
}

const wordsOut = path.join(outDir, "words.json");
writeFileSync(wordsOut, JSON.stringify(words, null, 2));
writeFileSync(path.join(outDir, "transcript.txt"), words.map((w) => w.text).join(" ") + "\n");

// Forensic flags: spans >= 1.2s (potential hidden retakes) & low confidence (< 0.75)
const suspiciousSpans = [];
for (let i = 0; i < words.length; i++) {
  const nextStart = words[i + 1]?.startMs ?? words[i].endMs;
  const span = (Math.max(words[i].endMs, nextStart) - words[i].startMs) / 1000;
  if (span >= 1.2) {
    suspiciousSpans.push({
      atSec: +(words[i].startMs / 1000).toFixed(2),
      spanSec: +span.toFixed(2),
      word: words[i].text,
      nextWord: words[i + 1]?.text || "",
    });
  }
}
const lowConf = words.filter((w) => (w.confidence ?? 1) < 0.75);

console.log(`Wrote ${words.length} words to ${wordsOut}`);
if (suspiciousSpans.length) {
  console.log(`\n⚠ ${suspiciousSpans.length} span(s) >= 1.2s (check for hidden retakes/hesitations):`);
  for (const s of suspiciousSpans) console.log(`  @${s.atSec}s (${s.spanSec}s): "${s.word}" -> "${s.nextWord}"`);
}
if (lowConf.length) {
  console.log(`\n⚠ ${lowConf.length} low-confidence word(s) (<0.75):`);
  for (const w of lowConf) console.log(`  @${(w.startMs / 1000).toFixed(2)}s (${w.confidence.toFixed(2)}): "${w.text}"`);
}
