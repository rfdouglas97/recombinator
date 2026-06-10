/**
 * In-memory per-IP rate limits (fixed window).
 * Railway: uses X-Forwarded-For. Localhost is exempt for dev.
 *
 * Env (all optional):
 *   RATE_LIMIT_DISABLED=1          — turn off
 *   RATE_LIMIT_BUNDLE_MAX=30       — GET /api/bundle per minute
 *   RATE_LIMIT_READ_MAX=120        — other GET /api/* per minute
 *   RATE_LIMIT_WRITE_MAX=40        — light POST (judgments, gaps, …)
 *   RATE_LIMIT_EXPENSIVE_MAX=12    — LLM routes (chat, generate)
 *   RATE_LIMIT_WINDOW_MS=60000
 */

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);

const LIMITS = {
  bundle: parseInt(process.env.RATE_LIMIT_BUNDLE_MAX ?? '30', 10),
  read: parseInt(process.env.RATE_LIMIT_READ_MAX ?? '120', 10),
  write: parseInt(process.env.RATE_LIMIT_WRITE_MAX ?? '40', 10),
  expensive: parseInt(process.env.RATE_LIMIT_EXPENSIVE_MAX ?? '12', 10),
};

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

const EXPENSIVE_PATHS = new Set(['/api/chat', '/api/generator/generate', '/api/library/generate']);

const WRITE_PATHS = new Set([
  '/api/generator/gaps',
  '/api/library/judgments',
  '/api/library/archive',
  '/api/library/restore',
]);

const HEALTH_PATHS = new Set(['/', '/api/health', '/api/generator/health', '/api/chat/health']);

function disabled() {
  return process.env.RATE_LIMIT_DISABLED === '1' || process.env.RATE_LIMIT_DISABLED === 'true';
}

function isLocalhost(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'unknown';
}

/** Client IP behind Railway / proxies. */
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.length) return real.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * @returns {'bundle' | 'read' | 'write' | 'expensive' | null}
 */
export function rateLimitTier(pathname, method) {
  if (method === 'OPTIONS') return null;
  if (HEALTH_PATHS.has(pathname)) return null;
  if (method === 'GET' && pathname === '/api/bundle') return 'bundle';
  if (method === 'GET' && pathname.startsWith('/api/')) return 'read';
  if (method === 'POST' && EXPENSIVE_PATHS.has(pathname)) return 'expensive';
  if (method === 'POST' && WRITE_PATHS.has(pathname)) return 'write';
  if (method === 'POST' && pathname.startsWith('/api/')) return 'write';
  return null;
}

function pruneExpired(now) {
  if (buckets.size < 5000) return;
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

/**
 * @returns {{ allowed: true } | { allowed: false, retryAfterSec: number, tier: string, limit: number }}
 */
export function checkRateLimit(req, pathname, method) {
  const tier = rateLimitTier(pathname, method);
  if (!tier || disabled()) return { allowed: true };

  const ip = clientIp(req);
  if (isLocalhost(ip)) return { allowed: true };

  const limit = LIMITS[tier];
  const now = Date.now();
  const key = `${ip}|${tier}`;
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, entry);
  }
  entry.count += 1;
  pruneExpired(now);

  if (entry.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec, tier, limit };
  }
  return { allowed: true };
}
