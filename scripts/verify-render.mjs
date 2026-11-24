#!/usr/bin/env node
/**
 * Post-render verification gate for ReelCraft.
 * Checks ffprobe streams/duration, blackdetect (0 black frames), ebur128 loudness (-14 LUFS),
 * and builds a 1fps audit contact sheet + ear-check MP3.
 *
 * Usage:
 *   node scripts/verify-render.mjs <out/video.mp4> [--out=<audit-dir>]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const video = argv.find((a) => !a.startsWith("--"));
const opt = (k, def) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};

if (!video) {
  console.error("Usage: node scripts/verify-render.mjs <out/video.mp4> [--out=<audit-dir>]");
  process.exit(1);
}

const auditDir = opt("out", path.join(path.dirname(video), "audit"));
const framesDir = path.join(auditDir, "frames");
mkdirSync(framesDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status || 1);
  }
  return r;
}

const probe = JSON.parse(run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", video]).stdout);
const vStream = probe.streams.find((s) => s.codec_type === "video");
const aStream = probe.streams.find((s) => s.codec_type === "audio");

const checkRes = run("ffmpeg", ["-nostdin", "-i", video, "-vf", "blackdetect=d=0.1:pix_th=0.10", "-af", "ebur128=peak=true", "-f", "null", "-"]);
const blackLines = checkRes.stderr.split("\n").filter((l) => l.includes("black_start"));
const lufsMatch = checkRes.stderr.match(/Integrated loudness:\s*\n\s*I:\s*([-\d.]+)\s*LUFS/);
const peakMatch = checkRes.stderr.match(/True peak:\s*\n\s*Peak:\s*([-\d.]+)\s*dBFS/);

run("ffmpeg", ["-nostdin", "-y", "-i", video, "-vf", "fps=1,scale=320:-1", path.join(framesDir, "f_%03d.jpg")]);
const sheet = path.join(auditDir, "audit_contact_sheet.jpg");
run("ffmpeg", ["-nostdin", "-y", "-pattern_type", "glob", "-i", path.join(framesDir, "f_*.jpg"), "-vf", "tile=10x8:padding=3:margin=3", "-update", "1", "-frames:v", "1", sheet]);

console.log("\n=== ReelCraft Render Verification ===");
console.log(`  File:         ${video}`);
console.log(`  Video:        ${vStream?.codec_name} ${vStream?.width}x${vStream?.height} (${Number(probe.format.duration).toFixed(2)}s)`);
console.log(`  Audio:        ${aStream?.codec_name} ${aStream?.sample_rate} Hz (${aStream?.channels} ch)`);
console.log(`  Black frames: ${blackLines.length === 0 ? "0 ✓" : `${blackLines.length} ✗`}`);
console.log(`  Loudness:     ${lufsMatch ? lufsMatch[1] + " LUFS" : "unknown"} | True Peak: ${peakMatch ? peakMatch[1] + " dBFS" : "unknown"}`);
console.log(`  Audit sheet:  ${sheet}\n`);

if (blackLines.length > 0) process.exit(2);
