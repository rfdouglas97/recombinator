/**
 * Read-only HTTP handlers — Postgres-backed GET routes for the explorer.
 * Mounted from server/generator-api.mjs (same port /api proxy).
 */

import { pingDatabase } from '../db/client.mjs';
import {
  listCompanies,
  getCompanyDetail,
  listGaps,
  listLaunches,
  getFacets,
} from '../db/queries.mjs';
import { buildBundleFromDb } from '../db/build-bundle.mjs';

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

/**
 * @returns {Promise<boolean>} true if request was handled
 */
export async function tryHandleReadApi(req, res, url) {
  if (req.method !== 'GET') return false;

  try {
    if (url.pathname === '/api/health') {
      // Liveness: always 200 so Railway/Vercel deploy healthchecks pass.
      // DB status is informational — readiness, not process survival.
      let database = { ok: false, status: 'not_configured' };
      if (process.env.DATABASE_URL) {
        try {
          const db = await pingDatabase();
          database = { ok: true, status: 'connected', name: db.db, time: db.now };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          database = { ok: false, status: 'error', error: message };
        }
      }
      sendJson(res, 200, { ok: true, service: 'yc-scrape-api', database });
      return true;
    }

    if (url.pathname === '/api/bundle') {
      const bundle = await buildBundleFromDb();
      sendJson(res, 200, bundle);
      return true;
    }

    if (url.pathname === '/api/meta/facets') {
      sendJson(res, 200, await getFacets());
      return true;
    }

    if (url.pathname === '/api/companies') {
      const companies = await listCompanies({
        batch: url.searchParams.get('batch') || undefined,
        sector: url.searchParams.get('sector') || undefined,
        phenotype: url.searchParams.get('phenotype') || undefined,
        vertical: url.searchParams.get('vertical') || undefined,
        search: url.searchParams.get('search') || undefined,
        limit: url.searchParams.get('limit') || undefined,
        offset: url.searchParams.get('offset') || undefined,
      });
      sendJson(res, 200, { count: companies.length, companies });
      return true;
    }

    const companyMatch = url.pathname.match(/^\/api\/companies\/([^/]+)$/);
    if (companyMatch) {
      const slug = decodeURIComponent(companyMatch[1]);
      const company = await getCompanyDetail(slug);
      if (!company) {
        sendJson(res, 404, { error: 'Company not found', slug });
        return true;
      }
      sendJson(res, 200, company);
      return true;
    }

    if (url.pathname === '/api/gaps') {
      const gaps = await listGaps({
        limit: url.searchParams.get('limit') || undefined,
        sector: url.searchParams.get('sector') || undefined,
      });
      sendJson(res, 200, { count: gaps.length, gaps });
      return true;
    }

    if (url.pathname === '/api/launches') {
      const launches = await listLaunches({
        limit: url.searchParams.get('limit') || undefined,
        verdict: url.searchParams.get('verdict') || undefined,
        band: url.searchParams.get('band') || undefined,
      });
      sendJson(res, 200, { count: launches.length, launches });
      return true;
    }

    return false;
  } catch (err) {
    console.error('[read-api]', err);
    const message = err instanceof Error ? err.message : String(err);
    const isDb = /DATABASE_URL|connect|ECONNREFUSED/i.test(message);
    sendJson(res, isDb ? 503 : 500, {
      error: message,
      hint: isDb ? 'Run: npm run db:up && npm run db:migrate' : undefined,
    });
    return true;
  }
}
