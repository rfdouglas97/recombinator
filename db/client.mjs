/**
 * Postgres connection pool.
 *
 * Uses DATABASE_URL from .env (same pattern as agent/env.mjs).
 * A "pool" keeps a few connections open and reuses them — faster than
 * opening a new connection for every query.
 */

import pg from 'pg';
import { loadDotEnv } from '../agent/env.mjs';

const { Pool } = pg;

loadDotEnv();

let pool;

export function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example → .env and run npm run db:up');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

/** Run a single SQL statement with optional params ($1, $2, …). */
export async function query(text, params = []) {
  const p = getPool();
  return p.query(text, params);
}

/** Borrow a connection for multiple statements in one transaction. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function pingDatabase() {
  const { rows } = await query('SELECT current_database() AS db, NOW() AS now');
  return rows[0];
}
