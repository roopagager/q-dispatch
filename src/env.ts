// ============================================================================
// Q-Dispatch — minimal, dependency-free .env loader
// Loads ./.env into process.env for local development. On Railway the platform
// injects environment variables directly, so a missing .env is a no-op.
// Existing process.env values always win (never overwritten).
// ============================================================================

import fs from 'fs';
import path from 'path';

export function loadEnv(): void {
  // Anchor to the app root (one level above this file's dir) first, then fall
  // back to the current working directory. This keeps the loader correct
  // whether the process is launched from the app root or a parent directory.
  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;

    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding single or double quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
