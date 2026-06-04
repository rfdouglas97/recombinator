#!/usr/bin/env node
/**
 * Run explorer Vite dev server + generator API together.
 */

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = process.env.GENERATOR_API_PORT ?? '3456';

/** Free stale generator API from a previous dev session. */
function freeApiPort() {
  if (process.platform === 'win32') return;
  try {
    execSync(`lsof -ti :${API_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // port already free
  }
}

freeApiPort();

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  return child;
}

const api = run('node', ['server/generator-api.mjs']);
const vite = run('npm', ['run', 'dev'], { cwd: join(ROOT, 'explorer') });

function shutdown() {
  api.kill('SIGTERM');
  vite.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

api.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Generator API exited with code ${code}`);
    vite.kill('SIGTERM');
    process.exit(code);
  }
});

vite.on('exit', (code) => {
  api.kill('SIGTERM');
  process.exit(code ?? 0);
});
