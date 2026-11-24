#!/usr/bin/env node
/**
 * Download a style reference video (TikTok, Instagram Reels, YouTube Shorts) via yt-dlp
 * and build a 1fps contact sheet so the agent can visually analyze typography, layout, and pacing.
 *
 * Usage:
 *   node scripts/fetch-reference.mjs <url> --out=<dir>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { cleanMatchingFiles, computeTileGrid, parseArgs } from "./lib/cli.mjs";

const { positional, opt } = parseArgs(process.argv.slice(2));
const url = positional[0];

if (!url) {
  console.error("Usage: node scripts/fetch-reference.mjs <reference-url> --out=<dir>");
  process.exit(1);
}

const outDir = opt("out", "work/reference");
const framesDir = path.join(outDir, "frames");
mkdirSync(framesDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status || 1);
  }
  return r;
}

const refMp4 = path.join(outDir, "reference.mp4");
console.log(`Downloading reference video from ${url}...`);
run("yt-dlp", ["-S", "ext:mp4:m4a", "--merge-output-format", "mp4", "-o", refMp4, "--force-overwrites", url]);

console.log("Extracting 1fps frames & building contact sheet...");
cleanMatchingFiles(framesDir, /^f_\d+\.jpg$/);
run("ffmpeg", ["-nostdin", "-y", "-i", refMp4, "-vf", "fps=1,scale=320:-1", path.join(framesDir, "f_%03d.jpg")]);
const frameCount = readdirSync(framesDir).filter((f) => /^f_\d+\.jpg$/.test(f)).length;
const { cols, rows } = computeTileGrid(frameCount, 8);
const sheet = path.join(outDir, "reference_contact_sheet.jpg");
if (frameCount > 0) {
  run("ffmpeg", ["-nostdin", "-y", "-pattern_type", "glob", "-i", path.join(framesDir, "f_*.jpg"), "-vf", `tile=${cols}x${rows}:padding=4:margin=4`, "-update", "1", "-frames:v", "1", sheet]);
}

console.log(`Reference ready: ${refMp4}`);
console.log(`Contact sheet:   ${sheet} (${frameCount} frames, ${cols}x${rows})`);
