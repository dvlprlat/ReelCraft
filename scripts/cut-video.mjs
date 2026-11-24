#!/usr/bin/env node
/**
 * Talking-Head video cutter for ReelCraft.
 * Takes a raw video + JSON list of verified [startSec, endSec] speech segments,
 * scales to 1080x1920 30fps (-g 30 for instant HyperFrames seeking), normalizes audio to -14 LUFS,
 * exports splices.json, and exports <= 40s MP3 ear-check chunks.
 *
 * Usage:
 *   node scripts/cut-video.mjs <raw-video> --segments=<segments.json> --out=<dir>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith("--"));
const opt = (k, def) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};

if (!input || !opt("segments", "")) {
  console.error("Usage: node scripts/cut-video.mjs <raw-video> --segments=<segments.json> --out=<dir>");
  process.exit(1);
}

const outDir = opt("out", path.dirname(input));
mkdirSync(outDir, { recursive: true });
const segments = JSON.parse(readFileSync(opt("segments", ""), "utf8"));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status || 1);
  }
  return r;
}

const parts = [];
const ins = [];
const splices = [];
let acc = 0;

segments.forEach(([s, e], i) => {
  parts.push(`[0:v]trim=start=${s.toFixed(3)}:end=${e.toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[v${i}]`);
  parts.push(`[0:a]atrim=start=${s.toFixed(3)}:end=${e.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012,areverse,afade=t=in:st=0:d=0.012,areverse[a${i}]`);
  ins.push(`[v${i}][a${i}]`);
  acc += e - s;
  if (i < segments.length - 1) splices.push(Number(acc.toFixed(3)));
});

parts.push(`${ins.join("")}concat=n=${segments.length}:v=1:a=1[vout][acat]`);
parts.push(`[acat]highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=15:release=150,loudnorm=I=-14:TP=-1.5:LRA=11[anorm]`);

const cleanMp4 = path.join(outDir, "clean.mp4");
run("ffmpeg", [
  "-nostdin", "-y", "-i", input,
  "-filter_complex", parts.join(";"),
  "-map", "[vout]", "-map", "[anorm]",
  "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-g", "30", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  cleanMp4,
]);

const dur = parseFloat(run("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", cleanMp4]).stdout.trim());
writeFileSync(path.join(outDir, "splices.json"), JSON.stringify(splices, null, 2));

// Export <= 40s MP3 chunks for mandatory direct ear-listening gate
const chunkCount = Math.ceil(dur / 40);
for (let i = 0; i < chunkCount; i++) {
  run("ffmpeg", ["-nostdin", "-y", "-ss", String(i * 40), "-t", "40", "-i", cleanMp4, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", path.join(outDir, `ear_check_part${i + 1}.mp3`)]);
}

console.log(`Clean talking-head video ready: ${cleanMp4} (${dur.toFixed(2)}s, ${splices.length} splices).`);
console.log(`Saved splices.json and ${chunkCount} ear-check MP3 chunk(s) — LISTEN directly before composing!`);
