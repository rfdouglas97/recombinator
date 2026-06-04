import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Load .env from project root into process.env (does not override existing env). */
export function loadDotEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const upper = key.toUpperCase();
    if (process.env[upper] === undefined) process.env[upper] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }

  // Normalize common .env naming variants
  if (!process.env.ANTHROPIC_API_KEY && process.env.anthropic_api_key) {
    process.env.ANTHROPIC_API_KEY = process.env.anthropic_api_key;
  }
}
