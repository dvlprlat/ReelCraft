#!/usr/bin/env node
/**
 * Audio cleanup & loudness normalization for Faceless voiceovers (and raw audio inspection).
 * Normalizes to -14 LUFS / -1.5 dBTP, trims long silences, and exports <= 40s MP3 ear-check chunks.
 *
 * Usage:
 *   node scripts/clean-audio.mjs <input-audio> --out=<dir> [--max-silence=0.45] [--kept-pause=0.16]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith("--"));
const opt = (k, def) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};

if (!input) {
  console.error("Usage: node scripts/clean-audio.mjs <input-audio> --out=<dir> [--max-silence=0.45] [--kept-pause=0.16]");
  process.exit(1);
}

const outDir = opt("out", path.dirname(input));
mkdirSync(outDir, { recursive: true });
const maxSilence = Number(opt("max-silence", "0.45"));
const keptPause = Number(opt("kept-pause", "0.16"));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status || 1);
  }
  return r;
}

const normWav = path.join(outDir, "voice.norm.wav");
const cleanWav = path.join(outDir, "voice.clean.wav");

// 1. Clean & normalize voice to -14 LUFS
run("ffmpeg", [
  "-nostdin", "-y", "-i", input, "-vn",
  "-af", "highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=15:release=150,loudnorm=I=-14:TP=-1.5:LRA=11",
  "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
  normWav,
]);

// 2. Detect true silences at -42 dB and trim long pauses safely
const dur = parseFloat(run("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", normWav]).stdout.trim());
const silLog = run("ffmpeg", ["-nostdin", "-i", normWav, "-af", `silencedetect=noise=-42dB:d=${maxSilence}`, "-f", "null", "-"]).stderr;
const starts = [...silLog.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
const ends = [...silLog.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));

const margin = keptPause / 2;
const kept = [];
let cursor = 0;
for (let i = 0; i < starts.length; i++) {
  const s = starts[i];
  const e = ends[i] ?? dur;
  if (s + margin > cursor + 0.05) kept.push([cursor, Math.min(s + margin, dur)]);
  cursor = Math.max(e - margin, 0);
}
if (dur - cursor > 0.05) kept.push([cursor, dur]);

const parts = [];
const ins = [];
kept.forEach(([s, e], i) => {
  parts.push(`[0:a]atrim=start=${s.toFixed(3)}:end=${e.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012,areverse,afade=t=in:st=0:d=0.012,areverse[a${i}]`);
  ins.push(`[a${i}]`);
});
parts.push(`${ins.join("")}concat=n=${kept.length}:v=0:a=1[aout]`);

run("ffmpeg", ["-nostdin", "-y", "-i", normWav, "-filter_complex", parts.join(";"), "-map", "[aout]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", cleanWav]);

const cleanDur = parseFloat(run("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", cleanWav]).stdout.trim());

// 3. Export <= 40s MP3 chunks for mandatory direct ear-listening gate
const chunkCount = Math.ceil(cleanDur / 40);
for (let i = 0; i < chunkCount; i++) {
  const from = i * 40;
  run("ffmpeg", ["-nostdin", "-y", "-ss", String(from), "-t", "40", "-i", cleanWav, "-c:a", "libmp3lame", "-b:a", "128k", path.join(outDir, `ear_check_part${i + 1}.mp3`)]);
}

console.log(`Clean voice ready: ${cleanWav} (${cleanDur.toFixed(2)}s, ${kept.length} segments).`);
console.log(`Exported ${chunkCount} ear-check MP3 chunk(s) in ${outDir} — LISTEN directly before composing!`);
