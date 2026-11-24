#!/usr/bin/env node
/**
 * Post-render verification gate for ReelCraft.
 * Checks ffprobe streams/duration, blackdetect (0 black frames), ebur128 loudness (-14 LUFS),
 * and builds a 1fps audit contact sheet + ear-check MP3 chunk(s).
 *
 * Usage:
 *   node scripts/verify-render.mjs <out/video.mp4> [--out=<audit-dir>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { cleanMatchingFiles, computeTileGrid, parseArgs } from "./lib/cli.mjs";

const { positional, opt } = parseArgs(process.argv.slice(2));
const video = positional[0];

if (!video) {
  console.error("Usage: node scripts/verify-render.mjs <out/video.mp4> [--out=<audit-dir>]");
  process.exit(1);
}
if (!existsSync(video)) {
  console.error(`Video file not found: ${video}`);
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
const duration = Number(probe.format.duration || 0);

const checkArgs = ["-nostdin", "-i", video, "-vf", "blackdetect=d=0.1:pix_th=0.10"];
if (aStream) checkArgs.push("-af", "ebur128=peak=true");
checkArgs.push("-f", "null", "-");

const checkRes = run("ffmpeg", checkArgs);
const blackLines = checkRes.stderr.split("\n").filter((l) => l.includes("black_start"));
const lufsMatch = checkRes.stderr.match(/Integrated loudness:\s*\n\s*I:\s*([-\d.]+)\s*LUFS/);
const peakMatch = checkRes.stderr.match(/True peak:\s*\n\s*Peak:\s*([-\d.]+)\s*dBFS/);

const lufs = lufsMatch ? Number(lufsMatch[1]) : null;
const peak = peakMatch ? Number(peakMatch[1]) : null;

cleanMatchingFiles(framesDir, /^f_\d+\.jpg$/);
run("ffmpeg", ["-nostdin", "-y", "-i", video, "-vf", "fps=1,scale=320:-1", path.join(framesDir, "f_%03d.jpg")]);
const frameCount = readdirSync(framesDir).filter((f) => /^f_\d+\.jpg$/.test(f)).length;
const { cols, rows } = computeTileGrid(frameCount, 10);
const sheet = path.join(auditDir, "audit_contact_sheet.jpg");
if (frameCount > 0) {
  run("ffmpeg", ["-nostdin", "-y", "-pattern_type", "glob", "-i", path.join(framesDir, "f_*.jpg"), "-vf", `tile=${cols}x${rows}:padding=3:margin=3`, "-update", "1", "-frames:v", "1", sheet]);
}

cleanMatchingFiles(auditDir, /^ear_check_part\d+\.mp3$/);
let earChunks = 0;
if (aStream && duration > 0) {
  earChunks = Math.ceil(duration / 40);
  for (let i = 0; i < earChunks; i++) {
    run("ffmpeg", ["-nostdin", "-y", "-ss", String(i * 40), "-t", "40", "-i", video, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", path.join(auditDir, `ear_check_part${i + 1}.mp3`)]);
  }
}

const loudnessWarn = lufs !== null && (lufs < -16 || lufs > -12);
const peakWarn = peak !== null && peak > -1.0;

console.log("\n=== ReelCraft Render Verification ===");
console.log(`  File:         ${video}`);
console.log(`  Video:        ${vStream?.codec_name} ${vStream?.width}x${vStream?.height} (${duration.toFixed(2)}s)`);
console.log(`  Audio:        ${aStream ? `${aStream.codec_name} ${aStream.sample_rate} Hz (${aStream.channels} ch)` : "none"}`);
console.log(`  Black frames: ${blackLines.length === 0 ? "0 ✓" : `${blackLines.length} ✗`}`);
console.log(`  Loudness:     ${lufs !== null ? `${lufs} LUFS${loudnessWarn ? " ⚠ (target -14 LUFS)" : " ✓"}` : "n/a"} | True Peak: ${peak !== null ? `${peak} dBFS${peakWarn ? " ⚠ (target <= -1.0)" : " ✓"}` : "n/a"}`);
console.log(`  Audit sheet:  ${frameCount > 0 ? `${sheet} (${frameCount} frames, ${cols}x${rows})` : "none"}`);
console.log(`  Ear-check:    ${earChunks > 0 ? `${earChunks} MP3 chunk(s) in ${auditDir}` : "none"}\n`);

if (blackLines.length > 0) process.exit(2);
