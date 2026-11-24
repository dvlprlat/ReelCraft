import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(os.tmpdir(), `reelcraft-pipeline-test-${Date.now()}`);
const FIX = path.join(TMP, "fixtures");
mkdirSync(FIX, { recursive: true });

function runNode(scriptRel, args = [], envExtra = {}) {
  return spawnSync("node", [path.join(ROOT, scriptRel), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...envExtra },
  });
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return r;
}

// Synthetic fixtures
const wavSpeech = path.join(FIX, "speech.wav");
ffmpeg([
  "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
  "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=1",
  "-f", "lavfi", "-i", "sine=frequency=520:duration=1",
  "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
  "-map", "[a]", "-ar", "48000", "-ac", "1", wavSpeech,
]);

const wavSilent = path.join(FIX, "silent.wav");
ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2", "-ar", "48000", "-ac", "1", wavSilent]);

const wavContinuous = path.join(FIX, "continuous.wav");
ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ar", "48000", "-ac", "1", wavContinuous]);

const mp4Raw = path.join(FIX, "raw.mp4");
ffmpeg([
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4Raw,
]);

const mp4Short = path.join(FIX, "short.mp4");
ffmpeg([
  "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=2",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4Short,
]);

const mp4Black = path.join(FIX, "with_black.mp4");
ffmpeg([
  "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=1",
  "-f", "lavfi", "-i", "color=c=black:s=320x568:r=30:d=0.5",
  "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=1",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5",
  "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
  "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4Black,
]);

const mp4NoAudio = path.join(FIX, "no_audio.mp4");
ffmpeg([
  "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=2",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4NoAudio,
]);

test("doctor.mjs: runs cleanly with exit 0", () => {
  const r = runNode("scripts/doctor.mjs");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ReelCraft Environment Doctor/);
});

test("CLI usage validation: missing required args exit 1 with Usage message", () => {
  for (const s of [
    "scripts/fetch-reference.mjs",
    "scripts/transcribe.mjs",
    "scripts/clean-audio.mjs",
    "scripts/cut-video.mjs",
    "scripts/verify-render.mjs",
  ]) {
    const r = runNode(s, []);
    assert.equal(r.status, 1, `${s} should exit 1 with no args`);
    assert.match(r.stderr, /Usage:/i);
  }
});

test("transcribe.mjs: rejects invalid provider, missing local binary, and supports --out <dir>", () => {
  const rBad = runNode("scripts/transcribe.mjs", [wavSpeech, "--out", path.join(TMP, "tr-bad"), "--provider=foobar"]);
  assert.equal(rBad.status, 1);
  assert.match(rBad.stderr, /Invalid --provider/i);

  const rLocal = runNode("scripts/transcribe.mjs", [wavSpeech, "--out", path.join(TMP, "tr-local"), "--provider=local"]);
  assert.equal(rLocal.status, 1);
  assert.match(rLocal.stderr, /whisper\.cpp binary not found|Missing Whisper model/i);
  assert.ok(!existsSync(path.join(FIX, "transcribe_16k.wav")), "Should not pollute input dir when --out <dir> is passed");
});

test("clean-audio.mjs: trims silence, handles continuous tone, fails cleanly on pure silence, and clears stale chunks", () => {
  const out = path.join(TMP, "clean-normal");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "ear_check_part99.mp3"), "stale");

  const r = runNode("scripts/clean-audio.mjs", [wavSpeech, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(path.join(out, "voice.clean.wav")));
  assert.ok(existsSync(path.join(out, "ear_check_part1.mp3")));
  assert.ok(!existsSync(path.join(out, "ear_check_part99.mp3")), "Stale ear_check_part99.mp3 should be removed");

  const rCont = runNode("scripts/clean-audio.mjs", [wavContinuous, `--out=${path.join(TMP, "clean-cont")}`]);
  assert.equal(rCont.status, 0, rCont.stderr);

  const rSil = runNode("scripts/clean-audio.mjs", [wavSilent, `--out=${path.join(TMP, "clean-sil")}`]);
  assert.equal(rSil.status, 1);
  assert.match(rSil.stderr, /No speech detected above -42 dB/i);

  const rNan = runNode("scripts/clean-audio.mjs", [wavSpeech, `--out=${path.join(TMP, "clean-nan")}`, "--max-silence=abc"]);
  assert.equal(rNan.status, 1);
  assert.match(rNan.stderr, /Invalid --max-silence/i);
});

test("cut-video.mjs: cuts multi-segment & single-segment, rejects empty/invalid segments cleanly", () => {
  const out = path.join(TMP, "cut-normal");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "ear_check_part5.mp3"), "stale");
  const segFile = path.join(out, "segments.json");
  writeFileSync(segFile, JSON.stringify([[0.5, 1.5], [2.0, 3.5]]));

  const r = runNode("scripts/cut-video.mjs", [mp4Raw, "--segments", segFile, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(path.join(out, "clean.mp4")));
  assert.ok(existsSync(path.join(out, "ear_check_part1.mp3")));
  assert.ok(!existsSync(path.join(out, "ear_check_part5.mp3")));
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, "splices.json"), "utf8")), [1]);

  const probe = JSON.parse(
    spawnSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", path.join(out, "clean.mp4")], { encoding: "utf8" }).stdout
  );
  const v = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);

  const emptySeg = path.join(TMP, "empty.json");
  writeFileSync(emptySeg, "[]");
  const rEmpty = runNode("scripts/cut-video.mjs", [mp4Raw, `--segments=${emptySeg}`, `--out=${path.join(TMP, "cut-empty")}`]);
  assert.equal(rEmpty.status, 1);
  assert.match(rEmpty.stderr, /non-empty JSON array/i);

  const badSeg = path.join(TMP, "bad.json");
  writeFileSync(badSeg, JSON.stringify([[2.0, 1.0]]));
  const rBad = runNode("scripts/cut-video.mjs", [mp4Raw, `--segments=${badSeg}`, `--out=${path.join(TMP, "cut-bad")}`]);
  assert.equal(rBad.status, 1);
  assert.match(rBad.stderr, /Invalid segment/i);
});

test("verify-render.mjs: verifies clean video, exports ear-check MP3, cleans stale frames, detects black frames, handles no-audio", () => {
  const audit = path.join(TMP, "audit-reuse");
  const r1 = runNode("scripts/verify-render.mjs", [mp4Raw, "--out", audit]);
  assert.equal(r1.status, 0, r1.stderr);
  assert.match(r1.stdout, /Black frames:\s+0 ✓/);
  assert.match(r1.stdout, /Loudness:\s+[-\d.]+\s+LUFS/);
  assert.ok(existsSync(path.join(audit, "audit_contact_sheet.jpg")));
  assert.ok(existsSync(path.join(audit, "ear_check_part1.mp3")));
  const frames4s = readdirSync(path.join(audit, "frames")).length;
  assert.equal(frames4s, 4);

  // Re-run with shorter 2s video in same audit dir — stale frames must be cleared
  const r2 = runNode("scripts/verify-render.mjs", [mp4Short, "--out", audit]);
  assert.equal(r2.status, 0, r2.stderr);
  const frames2s = readdirSync(path.join(audit, "frames")).length;
  assert.equal(frames2s, 2, `Expected stale frames to be cleared (2 frames), found ${frames2s}`);

  // Video with black frames exits 2
  const rBlack = runNode("scripts/verify-render.mjs", [mp4Black, `--out=${path.join(TMP, "audit-black")}`]);
  assert.equal(rBlack.status, 2);
  assert.match(rBlack.stdout, /Black frames:\s+[1-9]\d* ✗/);

  // Video without audio succeeds gracefully
  const rNoAudio = runNode("scripts/verify-render.mjs", [mp4NoAudio, `--out=${path.join(TMP, "audit-noaudio")}`]);
  assert.equal(rNoAudio.status, 0, rNoAudio.stderr);
  assert.match(rNoAudio.stdout, /Audio:\s+none/);
});

test.after(() => {
  rmSync(TMP, { recursive: true, force: true });
});
