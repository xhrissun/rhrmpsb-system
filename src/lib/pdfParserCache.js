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
 */

import * as pdfParser from './pdfParser';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_NAME    = 'rhrmpsb_pdf_cache';
const DB_VER     = 1;
const STORE      = 'cache';
const SCHEMA_VER = 1;

// ─── Known name aliases / synonyms ───────────────────────────────────────────
// Maps "what the DB might call it" → "what the CBS Manual calls it"
// Add entries here whenever a mismatch is discovered.
const NAME_ALIASES = [
  // DB name fragment               CBS Manual fragment
  ['people development',            'creating and nurturing a high performing organization'],
  ['competency development',        'competency development and enhancement'],
  ['managing performance',          'people performance management'],
  ['coaching for results',          'people performance management'],
  ['strategic leadership',          'thinking strategically and creatively'],
  ['leading change',                'leading change'],
  ['partnership and networking',    'building collaborative and inclusive working relationships'],
  ['building collaborative',        'partnership and networking'],
  ['completed staff work',          'completed staff work'],
  ['writing effectively',           'writing effectively'],
  ['speaking effectively',          'speaking effectively'],
  ['technology literacy',           'technology literacy and managing information'],
  ['project management',            'project management'],
  ['discipline',                    'discipline'],
  ['excellence',                    'excellence'],
  ['nobility',                      'nobility'],
  ['responsibility',                'responsibility'],
  ['caring for the environment',    'caring for the environment and natural resources'],
];

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

async function getPDFFingerprint(pdfUrl) {
  try {
    const res = await fetch(pdfUrl, { method: 'HEAD', cache: 'no-cache' });
    if (!res.ok) return 'unavailable';
    const length  = res.headers.get('content-length') ?? '?';
    const etag    = res.headers.get('etag')            ?? '';
    const lastMod = res.headers.get('last-modified')   ?? '';
    return etag
      ? `etag:${etag}`
      : lastMod
        ? `mod:${lastMod}|size:${length}`
        : `size:${length}`;
  } catch {
    return 'unavailable';
  }
}

// ─── Internal state ───────────────────────────────────────────────────────────

let _competencies = null;
let _parsePromise = null;

// ─── Name matching utilities ──────────────────────────────────────────────────

function normalize(str) {
  return (str ?? '')
    .toLowerCase()
    .replace(/[()\/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

const STOP = new Set([
  'and', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'or',
  'its', 'with', 'from', 'that', 'this', 'are', 'was', 'has',
  'their', 'they', 'into', 'also', 'an', 'a',
]);

function keywords(str) {
  return normalize(str).split(' ').filter(w => w.length > 2 && !STOP.has(w));
}

/** Character trigram similarity — handles misspellings */
function trigramSim(a, b) {
  const trigrams = s => {
    const t = new Set();
    const c = s.replace(/\s/g, '');
    for (let i = 0; i < c.length - 2; i++) t.add(c.slice(i, i + 3));
    return t;
  };
  const ta = trigrams(a), tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

/** Word-overlap Jaccard similarity */
function jaccardSim(a, b) {
  const wa = new Set(keywords(a));
  const wb = new Set(keywords(b));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union  = new Set([...wa, ...wb]).size;
  let score = inter / union;
  // Bonus: if all words of the shorter set appear in the longer set
  const [shorter, longer] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (shorter.size >= 3 && [...shorter].every(w => longer.has(w))) {
    score = Math.min(1.0, score + 0.2);
  }
  return score;
}

/**
 * Composite similarity: blend Jaccard + trigrams, weighted by name length.
 * Short/single-word names rely more on trigrams.
 */
function similarity(query, candidate) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (q === c) return 1.0;

  const jac = jaccardSim(q, c);
  const tri = trigramSim(q, c);
  const wordCount = Math.min(keywords(query).length, keywords(candidate).length);
  const triW = wordCount <= 2 ? 0.7 : 0.3;
  return Math.min(1.0, jac * (1 - triW) + tri * triW);
}

/**
 * Expand a query name through known aliases.
 * Returns an array of alternative search strings to try.
 */
function expandAliases(name) {
  const lower = name.toLowerCase();
  const extras = [];
  for (const [fragment, alias] of NAME_ALIASES) {
    if (lower.includes(fragment)) extras.push(alias);
    if (lower.includes(alias))   extras.push(fragment);
  }
  return [name, ...extras];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const isPDFAvailable = pdfParser.isPDFAvailable;

/**
 * Ensures competency data is loaded (memory → IndexedDB → full parse).
 */
export async function ensureParsed(onProgress) {
  if (_competencies) {
    onProgress?.(100, 'Loaded from cache');
    return _competencies;
  }
  if (_parsePromise) return _parsePromise;

  _parsePromise = (async () => {
    try {
      const PDF_URL   = '/rhrmpsb-system/2025_CBS.pdf';
      const fingerprint = await getPDFFingerprint(PDF_URL);

      let cached = null;
      try { cached = await idbGet('competencies'); } catch {}

      const cacheValid =
        cached &&
        cached.schemaVer === SCHEMA_VER &&
        Array.isArray(cached.data) &&
        cached.data.length > 0 &&
        (fingerprint === 'unavailable' || cached.fingerprint === fingerprint);

      if (cacheValid) {
        onProgress?.(100, 'Loaded from cache');
        _competencies = cached.data;
        return _competencies;
      }

      if (cached && !cacheValid) {
        console.info('[pdfParserCache] PDF changed — re-parsing.');
      }

      const result = await pdfParser.ensureParsed((pct, msg) => onProgress?.(pct, msg));
      _competencies = result;

      idbSet('competencies', {
        schemaVer: SCHEMA_VER,
        fingerprint,
        cachedAt: Date.now(),
        data: result,
      }).catch(err => console.warn('[pdfParserCache] IDB write error:', err));

      return _competencies;
    } catch (err) {
      console.warn('[pdfParserCache] Cache layer error, falling back to parser:', err);
      _parsePromise = null;
      const result = await pdfParser.ensureParsed(onProgress);
      _competencies = result;
      return _competencies;
    }
  })();

  return _parsePromise;
}

export async function getAllCompetencies() {
  if (!_competencies) await ensureParsed();
  return _competencies ?? [];
}

/**
 * Enhanced findCompetenciesByName:
 *
 * 1. Strip level prefixes like "(BASIC) - " or "(OC1) - "
 * 2. Expand through known aliases (e.g. "People Development" → CBS wording)
 * 3. Exact → startsWith → all-keywords → fuzzy similarity → partial fallback
 * 4. Deduplicate by (code, category) pairs before returning
 *
 * @param {string} name
 * @returns {Promise<Array>}
 */
export async function findCompetenciesByName(name) {
  if (!_competencies) await ensureParsed();
  if (!_competencies?.length) return [];

  // ── 1. Clean the incoming name ───────────────────────────────────────────
  // Strip common prefixes inserted by the UI:
  //   "(BASIC) - Discipline"  →  "Discipline"
  //   "(OC1) - Writing Effectively"  →  "Writing Effectively"
  //   "(LC3) - People Development (Creating...)"  →  "People Development (Creating...)"
  let cleanName = (name ?? '').trim();
  cleanName = cleanName.replace(/^\([A-Z]+\d*[A-Z]?\)\s*[-–]\s*/i, '');  // (CODE) - 
  cleanName = cleanName.replace(/^\([A-Z]+\)\s*/i, '');                    // (LEVEL) prefix
  cleanName = cleanName.trim();

  const needle = cleanName.toLowerCase();

  // ── 2. Exact match ───────────────────────────────────────────────────────
  const exact = _competencies.filter(c => c.name?.toLowerCase().trim() === needle);
  if (exact.length > 0) return dedupe(exact);

  // ── 3. Starts-with ───────────────────────────────────────────────────────
  const startsWith = _competencies.filter(c => c.name?.toLowerCase().trim().startsWith(needle));
  if (startsWith.length > 0) return dedupe(startsWith);

  // ── 4. All-keywords match ─────────────────────────────────────────────────
  const words = keywords(cleanName);
  if (words.length > 0) {
    const allWords = _competencies.filter(c => {
      const h = c.name?.toLowerCase() ?? '';
      return words.every(w => h.includes(w));
    });
    if (allWords.length > 0) return dedupe(allWords);
  }

  // ── 5. Alias expansion + fuzzy similarity ─────────────────────────────────
  const queries = expandAliases(cleanName);
  const THRESHOLD = 0.45;

  const scored = new Map(); // key = `${code}:${category}` → { comp, score }

  for (const q of queries) {
    for (const c of _competencies) {
      const s = similarity(q, c.name ?? '');
      const key = `${c.code}:${c.category}`;
      if (s >= THRESHOLD) {
        const existing = scored.get(key);
        if (!existing || s > existing.score) scored.set(key, { comp: c, score: s });
      }
    }
  }

  if (scored.size > 0) {
    const ranked = [...scored.values()].sort((a, b) => b.score - a.score);
    const best = ranked[0].score;

    // Return best match + any variants within 15% of best score
    const VARIANT_BAND = 0.15;
    const results = ranked
      .filter(r => r.score >= best - VARIANT_BAND)
      .map(r => r.comp);

    if (results.length > 0) return dedupe(results);
  }

  // ── 6. Partial fallback: at least one meaningful word matches ─────────────
  const partial = _competencies.filter(c => {
    const h = c.name?.toLowerCase() ?? '';
    return words.some(w => w.length > 4 && h.includes(w));
  });
  return dedupe(partial);
}

/** Remove duplicate (code + category) pairs, preserving order. */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(c => {
    const k = `${c.code}:${c.category}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Clears the IndexedDB cache and in-memory state.
 * Use in admin tools after uploading a new PDF.
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
