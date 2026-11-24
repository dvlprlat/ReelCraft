#!/usr/bin/env node
/**
 * ReelCraft Setup — bootstraps .env, HyperFrames browser, and optional OpenCV vision venv.
 * Usage:
 *   npm run setup                  (interactive defaults: .env + browser)
 *   npm run setup -- --full        (.env + browser + OpenCV YuNet venv)
 *   npm run setup -- --vision      (OpenCV YuNet venv only)
 *   npm run setup -- --cloud-only  (.env template only, skip heavy local installs)
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const cloudOnly = args.has("--cloud-only");
const installVision = args.has("--full") || args.has("--vision");

function run(cmd, argv) {
  console.log(`> ${cmd} ${argv.join(" ")}`);
  const r = spawnSync(cmd, argv, { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (!existsSync(path.join(ROOT, ".env")) && existsSync(path.join(ROOT, ".env.example"))) {
  copyFileSync(path.join(ROOT, ".env.example"), path.join(ROOT, ".env"));
  console.log("Created .env from .env.example");
}

if (cloudOnly) {
  console.log("Cloud-only setup complete. Add GROQ_API_KEY to .env or open cloud/reelcraft_colab.ipynb.");
  process.exit(0);
}

if (!args.has("--vision")) {
  console.log("Ensuring HyperFrames Chrome Headless Shell...");
  run("npx", ["hyperframes", "browser", "ensure"]);
}

if (installVision) {
  const venvDir = path.join(ROOT, ".venv-vision");
  if (!existsSync(venvDir)) {
    run("python3", ["-m", "venv", venvDir]);
  }
  const pip = path.join(venvDir, "bin", "pip");
  run(pip, ["install", "--quiet", "opencv-python-headless", "numpy"]);
  console.log("Vision stack ready (.venv-vision + assets/models/yunet.onnx).");
}

console.log("\nSetup finished! Run `npm run doctor` to verify your environment.");
