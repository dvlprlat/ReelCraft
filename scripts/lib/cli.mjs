import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

/**
 * Load key=value pairs from `<rootDir>/.env` into `process.env` without overriding
 * already-set environment variables.
 */
export function loadEnv(rootDir) {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

/**
 * Parse CLI arguments supporting both `--key=value` and `--key value` forms.
 */
export function parseArgs(argv, { booleans = [] } = {}) {
  const boolSet = new Set(booleans);
  const positional = [];
  const opts = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 2) {
      opts[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    if (!boolSet.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      opts[key] = argv[++i];
    } else {
      opts[key] = true;
    }
  }

  const opt = (k, def = "") => (opts[k] !== undefined && opts[k] !== true ? String(opts[k]) : def);
  return { positional, opts, opt };
}

/**
 * Remove stale files matching `regex` inside `dir` before regenerating outputs.
 */
export function cleanMatchingFiles(dir, regex) {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (regex.test(name)) {
      unlinkSync(path.join(dir, name));
      removed++;
    }
  }
  return removed;
}

/**
 * Compute an FFmpeg `tile=colsxrows` grid that fits all extracted frames without truncating.
 */
export function computeTileGrid(frameCount, maxCols = 10) {
  const count = Math.max(1, frameCount);
  const cols = Math.min(maxCols, count);
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}
