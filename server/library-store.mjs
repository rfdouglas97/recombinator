/**
 * File-backed startup idea library + human judgments.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LIBRARY_DIR = join(ROOT, 'output/startup-library');
export const LIBRARY_PATH = join(LIBRARY_DIR, 'library.json');
export const JUDGMENTS_PATH = join(LIBRARY_DIR, 'judgments.json');
export const JUDGMENTS_JSONL = join(LIBRARY_DIR, 'judgments.jsonl');
export const CARDS_JSONL = join(LIBRARY_DIR, 'cards.jsonl');
export const ARCHIVE_PATH = join(LIBRARY_DIR, 'archive.json');
export const ARCHIVE_JSONL = join(LIBRARY_DIR, 'archive.jsonl');

function ensureDir() {
  mkdirSync(LIBRARY_DIR, { recursive: true });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadLibraryDoc() {
  return readJson(LIBRARY_PATH, {
    cards: [],
    updated_at: null,
    batches: [],
  });
}

export function loadJudgmentsDoc() {
  return readJson(JUDGMENTS_PATH, { judgments: {} });
}

export function loadArchiveDoc() {
  return readJson(ARCHIVE_PATH, { cards: [], updated_at: null });
}

export function saveArchiveDoc(doc) {
  ensureDir();
  doc.updated_at = new Date().toISOString();
  doc.card_count = doc.cards.length;
  writeFileSync(ARCHIVE_PATH, JSON.stringify(doc, null, 2));
  return doc;
}

export function appendArchiveJsonl(card) {
  ensureDir();
  appendFileSync(ARCHIVE_JSONL, `${JSON.stringify(card)}\n`);
}

export function saveLibraryDoc(doc) {
  ensureDir();
  doc.updated_at = new Date().toISOString();
  doc.card_count = doc.cards.length;
  writeFileSync(LIBRARY_PATH, JSON.stringify(doc, null, 2));
  return doc;
}

export function appendCardJsonl(card) {
  ensureDir();
  appendFileSync(CARDS_JSONL, `${JSON.stringify(card)}\n`);
}

export function saveJudgment(cardId, judgment) {
  ensureDir();
  const doc = loadJudgmentsDoc();
  const prev = doc.judgments[cardId] ?? {};
  const entry = {
    card_id: cardId,
    verdict: judgment.verdict !== undefined ? judgment.verdict : (prev.verdict ?? null),
    human_score:
      judgment.human_score !== undefined && judgment.human_score !== null
        ? judgment.human_score
        : (prev.human_score ?? null),
    notes: judgment.notes !== undefined ? judgment.notes : (prev.notes ?? ''),
    archived: judgment.archived !== undefined ? judgment.archived : (prev.archived ?? false),
    archived_at:
      judgment.archived === true
        ? new Date().toISOString()
        : judgment.archived === false
          ? null
          : (prev.archived_at ?? null),
    judged_at: new Date().toISOString(),
  };
  doc.judgments[cardId] = entry;
  writeFileSync(JUDGMENTS_PATH, JSON.stringify(doc, null, 2));
  appendFileSync(JUDGMENTS_JSONL, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function mergeJudgmentsOntoCards(cards, judgmentsDoc = loadJudgmentsDoc()) {
  const map = judgmentsDoc.judgments ?? {};
  return cards.map((card) => {
    const j = map[card.id];
    if (!j) return card;
    return {
      ...card,
      judgment: j.verdict ?? card.judgment ?? null,
      human_score: j.human_score ?? card.human_score ?? null,
      notes: j.notes ?? card.notes ?? '',
      judged_at: j.judged_at ?? card.judged_at ?? null,
      archived: j.archived ?? card.archived ?? false,
      archived_at: j.archived_at ?? card.archived_at ?? null,
    };
  });
}

export function archiveCardById(cardId, { notes = '' } = {}) {
  const doc = loadLibraryDoc();
  const idx = doc.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const [card] = doc.cards.splice(idx, 1);
  saveLibraryDoc(doc);

  const archivedCard = {
    ...card,
    judgment: 'reject',
    archived: true,
    archived_at: new Date().toISOString(),
    notes: notes || card.notes || '',
  };

  const archive = loadArchiveDoc();
  archive.cards.unshift(archivedCard);
  saveArchiveDoc(archive);
  appendArchiveJsonl(archivedCard);

  saveJudgment(cardId, { verdict: 'reject', notes: archivedCard.notes, archived: true });

  return archivedCard;
}

export function restoreCardById(cardId) {
  const archive = loadArchiveDoc();
  const idx = archive.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    throw new Error(`Archived card not found: ${cardId}`);
  }

  const [card] = archive.cards.splice(idx, 1);
  saveArchiveDoc(archive);

  const { archived_at: _a, archived: _b, ...rest } = card;
  const restored = rest;

  const doc = loadLibraryDoc();
  doc.cards.unshift(restored);
  saveLibraryDoc(doc);

  const prev = loadJudgmentsDoc().judgments[cardId] ?? {};
  saveJudgment(cardId, {
    verdict: prev.verdict === 'reject' ? null : prev.verdict,
    human_score: prev.human_score,
    notes: prev.notes ?? '',
    archived: false,
  });

  return restored;
}
