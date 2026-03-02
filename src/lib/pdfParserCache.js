/**
 * pdfParserCache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in caching layer over pdfParser.
 *
 * HOW IT WORKS
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  First visit   → parse PDF (slow) → store result in IndexedDB      │
 * │  Every refresh → load from IndexedDB (< 50 ms, no parsing at all)  │
 * │  PDF changes   → HEAD fingerprint mismatch → re-parse automatically│
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * USAGE — replace all imports of '../lib/pdfParser' with this file:
 *
 *   import { ensureParsed, getAllCompetencies,
 *            findCompetenciesByName, isPDFAvailable }
 *     from '../lib/pdfParserCache';
 *
 * No other changes needed anywhere.
 */

import * as pdfParser from './pdfParser';

// ─── Config ──────────────────────────────────────────────────────────────────

/** IndexedDB database name & version */
const DB_NAME    = 'rhrmpsb_pdf_cache';
const DB_VER     = 1;
const STORE      = 'cache';

/**
 * Bump this ONLY if you restructure the stored data format itself.
 * PDF content changes are detected automatically via HEAD fingerprint.
 */
const SCHEMA_VER = 1;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ─── PDF fingerprinting ───────────────────────────────────────────────────────

/**
 * Returns a lightweight fingerprint string for the PDF by doing a HEAD request
 * and reading Content-Length + Last-Modified (or ETag).
 * Falls back to a static string if the request fails (e.g. dev server quirks).
 *
 * This fingerprint is stored alongside the parsed data. On next load, if the
 * fingerprint differs → cache is stale → re-parse.
 */
async function getPDFFingerprint(pdfUrl) {
  try {
    const res = await fetch(pdfUrl, { method: 'HEAD', cache: 'no-cache' });
    if (!res.ok) return 'unavailable';
    const length  = res.headers.get('content-length') ?? '?';
    const etag    = res.headers.get('etag')            ?? '';
    const lastMod = res.headers.get('last-modified')   ?? '';
    // Prefer ETag (strongest), then last-modified + size, then just size
    return etag
      ? `etag:${etag}`
      : lastMod
        ? `mod:${lastMod}|size:${length}`
        : `size:${length}`;
  } catch {
    return 'unavailable'; // dev server or offline — treat as "unknown"
  }
}

// ─── Internal state ───────────────────────────────────────────────────────────

/** In-memory store after first load (either from cache or fresh parse) */
let _competencies = null; // null = not yet loaded
let _parsePromise = null; // singleton — prevent double-parsing

// ─── Public API ───────────────────────────────────────────────────────────────

export const isPDFAvailable = pdfParser.isPDFAvailable;

/**
 * Ensures competency data is loaded, either from:
 *  1. In-memory (instant, sub-ms)
 *  2. IndexedDB (instant, ~10–50 ms)
 *  3. Full PDF parse (slow, only on very first ever visit or after PDF change)
 *
 * @param {(pct: number, msg: string) => void} [onProgress]
 *   Called with 0→100 during a real parse, or a single call at 100 if from cache.
 */
export async function ensureParsed(onProgress) {

  // 1. Already in memory — fastest path
  if (_competencies) {
    onProgress?.(100, 'Loaded from cache');
    return _competencies;
  }

  // 2. Parsing already in flight — attach to the same promise
  if (_parsePromise) return _parsePromise;

  _parsePromise = (async () => {
    try {
      // Determine the PDF URL the same way pdfParser does
      // (adjust this path if your PDF lives somewhere else)
      const PDF_URL = '/rhrmpsb-system/2025_CBS.pdf';

      const fingerprint = await getPDFFingerprint(PDF_URL);

      // 3. Try IndexedDB cache
      let cached = null;
      try {
        cached = await idbGet('competencies');
      } catch (err) {
        console.warn('[pdfParserCache] IndexedDB read error:', err);
      }

      const cacheValid =
        cached &&
        cached.schemaVer === SCHEMA_VER &&
        Array.isArray(cached.data) &&
        cached.data.length > 0 &&
        // Only skip fingerprint check if we couldn't get one at all
        (fingerprint === 'unavailable' || cached.fingerprint === fingerprint);

      if (cacheValid) {
        // ── Cache HIT ────────────────────────────────────────────────
        onProgress?.(100, 'Loaded from cache');
        _competencies = cached.data;
        return _competencies;
      }

      // ── Cache MISS — do the real parse ───────────────────────────
      if (cached && !cacheValid) {
        console.info('[pdfParserCache] PDF has changed (fingerprint mismatch) — re-parsing.');
      }

      const result = await pdfParser.ensureParsed((pct, msg) => {
        onProgress?.(pct, msg);
      });

      _competencies = result;

      // Persist to IndexedDB in the background — don't block the caller
      idbSet('competencies', {
        schemaVer: SCHEMA_VER,
        fingerprint,
        cachedAt: Date.now(),
        data: result,
      }).catch(err => console.warn('[pdfParserCache] IndexedDB write error:', err));

      return _competencies;

    } catch (err) {
      // If anything fails, fall through to real parser without caching
      console.warn('[pdfParserCache] Cache layer error, using pdfParser directly:', err);
      _parsePromise = null; // allow retry
      const result = await pdfParser.ensureParsed(onProgress);
      _competencies = result;
      return _competencies;
    }
  })();

  return _parsePromise;
}

/**
 * Returns all parsed competencies.
 * Calls ensureParsed() internally if not yet loaded.
 */
export async function getAllCompetencies() {
  if (!_competencies) await ensureParsed();
  return _competencies ?? [];
}

/**
 * Finds competencies whose name contains the search string (case-insensitive).
 * Operates entirely on in-memory data — no re-parse ever needed.
 *
 * @param {string} name - The competency name to search for
 * @returns {Promise<Array>} Matching competency objects
 */
export async function findCompetenciesByName(name) {
  if (!_competencies) await ensureParsed();
  if (!_competencies?.length) return [];

  const needle = name?.toLowerCase().trim();
  if (!needle) return [];

  // 1. Exact match (case-insensitive)
  const exact = _competencies.filter(c =>
    c.name?.toLowerCase().trim() === needle
  );
  if (exact.length > 0) return exact;

  // 2. Starts-with match
  const startsWith = _competencies.filter(c =>
    c.name?.toLowerCase().trim().startsWith(needle)
  );
  if (startsWith.length > 0) return startsWith;

  // 3. Contains match (all words in needle appear in name)
  const words = needle.split(/\s+/).filter(Boolean);
  const contains = _competencies.filter(c => {
    const haystack = c.name?.toLowerCase() ?? '';
    return words.every(w => haystack.includes(w));
  });
  if (contains.length > 0) return contains;

  // 4. Fallback: at least one word matches
  const partial = _competencies.filter(c => {
    const haystack = c.name?.toLowerCase() ?? '';
    return words.some(w => w.length > 3 && haystack.includes(w));
  });
  return partial;
}

/**
 * Clears the IndexedDB cache and in-memory state.
 * Useful in admin tools if you need to force a re-parse after uploading a new PDF.
 */
export async function clearCache() {
  _competencies = null;
  _parsePromise = null;
  try {
    await idbSet('competencies', null);
    console.info('[pdfParserCache] Cache cleared. Next load will re-parse the PDF.');
  } catch (err) {
    console.warn('[pdfParserCache] Failed to clear IndexedDB cache:', err);
  }
}
