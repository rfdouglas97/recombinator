import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const INPUT = {
  rankedGaps: join(ROOT, 'output/whitespace/gap-opportunity-ranked.json'),
};

export const OUTPUT_DIR = join(ROOT, 'startup_engine/output');
export const LIBRARY_DIR = join(ROOT, 'output/startup-library');

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
