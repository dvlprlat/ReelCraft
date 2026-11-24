import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanMatchingFiles, computeTileGrid, loadEnv, parseArgs } from "../scripts/lib/cli.mjs";
import { detectForensicFlags, mergeWhisperTokens, normalizeLang } from "../scripts/transcribe.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("cli.parseArgs: supports --key=value, --key value, booleans, and positional args", () => {
  const res = parseArgs(["input/raw.mp4", "--out", "work/demo", "--lang=es", "--prompt", "Hola mundo"]);
  assert.deepEqual(res.positional, ["input/raw.mp4"]);
  assert.equal(res.opt("out"), "work/demo");
  assert.equal(res.opt("lang"), "es");
  assert.equal(res.opt("prompt"), "Hola mundo");
  assert.equal(res.opt("missing", "fallback"), "fallback");

  const withBool = parseArgs(["--full", "input.mp4"], { booleans: ["full"] });
  assert.equal(withBool.opts.full, true);
  assert.deepEqual(withBool.positional, ["input.mp4"]);
});

test("cli.loadEnv: loads key=value without overriding existing env vars", () => {
  const tmp = path.join(os.tmpdir(), `rc-env-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  writeFileSync(path.join(tmp, ".env"), '# comment\nRC_TEST_A="hello"\nRC_TEST_B=world\n');
  process.env.RC_TEST_B = "preset";
  try {
    loadEnv(tmp);
    assert.equal(process.env.RC_TEST_A, "hello");
    assert.equal(process.env.RC_TEST_B, "preset");
  } finally {
    delete process.env.RC_TEST_A;
    delete process.env.RC_TEST_B;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("cli.cleanMatchingFiles & computeTileGrid", () => {
  const tmp = path.join(os.tmpdir(), `rc-clean-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    writeFileSync(path.join(tmp, "f_001.jpg"), "a");
    writeFileSync(path.join(tmp, "f_002.jpg"), "b");
    writeFileSync(path.join(tmp, "keep.txt"), "c");
    const removed = cleanMatchingFiles(tmp, /^f_\d+\.jpg$/);
    assert.equal(removed, 2);
    assert.deepEqual(readdirSync(tmp), ["keep.txt"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  assert.deepEqual(computeTileGrid(0, 10), { cols: 1, rows: 1 });
  assert.deepEqual(computeTileGrid(5, 10), { cols: 5, rows: 1 });
  assert.deepEqual(computeTileGrid(85, 10), { cols: 10, rows: 9 });
});

test("transcribe helpers: normalizeLang, mergeWhisperTokens, detectForensicFlags", () => {
  assert.equal(normalizeLang("auto"), "");
  assert.equal(normalizeLang("AUTO"), "");
  assert.equal(normalizeLang("  "), "");
  assert.equal(normalizeLang("es"), "es");

  const merged = mergeWhisperTokens([
    {
      tokens: [
        { text: "[_BEG_]", offsets: { from: 0, to: 0 }, p: 1 },
        { text: " Ho", offsets: { from: 100, to: 200 }, p: 0.9 },
        { text: "la", offsets: { from: 200, to: 350 }, p: 0.6 },
        { text: ",", offsets: { from: 350, to: 380 }, p: 0.95 },
        { text: " mundo", offsets: { from: 1800, to: 2200 }, p: 0.92 },
      ],
    },
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], { text: "Hola,", startMs: 100, endMs: 380, confidence: 0.6 });
  assert.deepEqual(merged[1], { text: "mundo", startMs: 1800, endMs: 2200, confidence: 0.92 });

  const { suspiciousSpans, lowConf } = detectForensicFlags(merged);
  assert.equal(suspiciousSpans.length, 1);
  assert.equal(suspiciousSpans[0].word, "Hola,");
  assert.equal(suspiciousSpans[0].spanSec, 1.7);
  assert.equal(lowConf.length, 1);
  assert.equal(lowConf[0].text, "Hola,");
});

test("repo integrity: package.json scripts, SFX manifest, YuNet model, Colab notebook, Python syntax", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    const m = cmd.match(/node\s+(scripts\/[^\s]+)/);
    if (m) assert.ok(existsSync(path.join(ROOT, m[1])), `Script ${name} -> ${m[1]} missing`);
  }

  const manifest = JSON.parse(readFileSync(path.join(ROOT, "assets/sfx/manifest.json"), "utf8"));
  const sfxDir = path.join(ROOT, "assets/sfx");
  const actualMp3s = new Set(readdirSync(sfxDir).filter((f) => f.endsWith(".mp3")));
  const manifestMp3s = new Set(Object.values(manifest).map((e) => e.file));
  for (const f of manifestMp3s) assert.ok(actualMp3s.has(f), `Manifest SFX missing on disk: ${f}`);
  for (const f of actualMp3s) assert.ok(manifestMp3s.has(f), `Orphan SFX not in manifest: ${f}`);

  assert.ok(existsSync(path.join(ROOT, "assets/models/yunet.onnx")), "yunet.onnx missing");

  const nbText = readFileSync(path.join(ROOT, "cloud/reelcraft_colab.ipynb"), "utf8");
  const nb = JSON.parse(nbText);
  assert.ok(Array.isArray(nb.cells) && nb.cells.length > 0, "Invalid colab notebook");
  assert.doesNotMatch(nbText, /YOUR_ORG/, "Colab notebook still contains YOUR_ORG placeholder");

  const syn = spawnSync("python3", ["-m", "py_compile", path.join(ROOT, "scripts/analyze-cuts.py")], { encoding: "utf8" });
  assert.equal(syn.status, 0, syn.stderr);
});
