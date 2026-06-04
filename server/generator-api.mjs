#!/usr/bin/env node
/**
 * HTTP API for explorer Startup Generator (whitespace search + LLM generation).
 * Port 3456 — proxied by Vite dev server at /api
 */

import { createServer } from 'http';
import { loadDotEnv } from '../agent/env.mjs';
import { resolveApiConfig } from '../agent/llm.mjs';
import { findWhitespaceGaps, generateSyntheticForCell, discoverAndGenerate } from '../scripts/generator-lib.mjs';
import { getLibrary, getArchivedLibrary, generateMoreCards, recordJudgment, archiveCard, restoreCard } from './library-service.mjs';
import { handleChat, getChatMeta } from './chat-service.mjs';
import { tryHandleReadApi } from './read-api.mjs';

loadDotEnv();

const PORT = parseInt(process.env.PORT ?? process.env.GENERATOR_API_PORT ?? '3456', 10);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body');
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  try {
    if (await tryHandleReadApi(req, res, url)) return;

    if (req.method === 'GET' && url.pathname === '/api/generator/health') {
      sendJson(res, 200, {
        ok: true,
        llm_configured: Boolean(resolveApiConfig()),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generator/gaps') {
      const body = await readBody(req);
      const gaps = findWhitespaceGaps({
        sectorId: body.sectorId ?? '',
        industryId: body.industryId ?? '',
        businessModel: body.businessModel ?? '',
        query: body.query ?? '',
        limit: Math.min(parseInt(body.limit ?? '15', 10), 50),
      });
      sendJson(res, 200, { gaps, count: gaps.length });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generator/generate') {
      const body = await readBody(req);
      const cell = body.target_cell ?? body.targetCell;

      if (cell?.business_model && cell?.vertical_id && cell?.phenotype_primary_id) {
        const result = await generateSyntheticForCell(cell, {
          syntheticId: `syn-ui-${Date.now()}`,
        });
        sendJson(res, 200, result);
        return;
      }

      const result = await discoverAndGenerate({
        sectorId: body.sectorId ?? '',
        industryId: body.industryId ?? '',
        businessModel: body.businessModel ?? '',
        query: body.query ?? body.idea ?? '',
        seed: body.seed ?? Date.now(),
      });

      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/library') {
      const archived = url.searchParams.get('archived') === '1';
      const payload = archived ? getArchivedLibrary() : getLibrary();
      sendJson(res, 200, {
        ok: true,
        llm_configured: Boolean(resolveApiConfig()),
        ...payload,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/library/generate') {
      const body = await readBody(req);
      const result = await generateMoreCards({
        count: body.count ?? 5,
        query: body.query ?? body.idea ?? '',
        sectorId: body.sectorId ?? body.sector ?? '',
        industryId: body.industryId ?? body.industry ?? '',
        businessModel: body.businessModel ?? body.business_model ?? '',
        concurrency: body.concurrency ?? 3,
      });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/library/judgments') {
      const body = await readBody(req);
      const result = recordJudgment(body.card_id ?? body.cardId, {
        verdict: body.verdict ?? null,
        human_score: body.human_score ?? body.humanScore ?? null,
        notes: body.notes ?? '',
      });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/library/archive') {
      const body = await readBody(req);
      const result = archiveCard(body.card_id ?? body.cardId, { notes: body.notes ?? '' });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/library/restore') {
      const body = await readBody(req);
      const result = restoreCard(body.card_id ?? body.cardId);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/chat/health') {
      sendJson(res, 200, {
        ok: true,
        llm_configured: Boolean(resolveApiConfig()),
        ...getChatMeta(),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readBody(req);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const result = await handleChat({
        messages,
        filters: body.filters ?? {},
        filterSlugs: body.filterSlugs ?? body.filter_slugs ?? null,
        selectedSlug: body.selectedSlug ?? body.selected_slug ?? null,
        limit: body.limit ?? 12,
      });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use (stale generator API?).`);
    console.error(`  Fix: lsof -ti :${PORT} | xargs kill -9`);
    console.error(`  Then: npm run explorer:dev`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`API server → http://localhost:${PORT}`);
  console.log(`  Read API:  GET /api/bundle, /api/companies, /api/gaps, /api/launches, /api/health`);
  console.log(`  Generator: POST /api/generator/*, /api/library/*, /api/chat`);
  console.log(`  LLM: ${resolveApiConfig() ? 'configured' : 'NOT configured (set .env)'}`);
  console.log(`  Postgres: ${process.env.DATABASE_URL ? 'DATABASE_URL set' : 'NOT set — read API will fail'}`);
});
