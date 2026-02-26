import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_BOUNDARIES = [192, 384, 589];
const LEVEL_NAMES = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];
const PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';
const CODE_RE = /^([A-Z]+\d+[A-Z]?)\s*[-–]\s*(.+)/;

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────────────────────

let _cache = null;
let _promise = null;

// ─────────────────────────────────────────────────────────────────────────────
// Column assignment
//
// FIX — rogue glyph / orphan character:
//   PDF glyphs that belong to a word in column N but whose x-coordinate sits
//   marginally past a column boundary get misassigned.  COLUMN_MARGIN keeps any
//   glyph within that many px of a boundary in the LEFT column.
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_MARGIN = 6; // px

function getColumn(x) {
  for (let i = 0; i < COLUMN_BOUNDARIES.length; i++) {
    if (x < COLUMN_BOUNDARIES[i] + COLUMN_MARGIN) return i;
  }
  return 3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row grouping
// ─────────────────────────────────────────────────────────────────────────────

function groupByRow(items, tol = 5) {
  const rows = new Map();
  for (const item of items) {
    let key = null;
    for (const k of rows.keys()) {
      if (Math.abs(k - item.y) <= tol) { key = k; break; }
    }
    key = key ?? item.y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(item);
  }
  const sorted = new Map([...rows.entries()].sort((a, b) => a[0] - b[0]));
  sorted.forEach(row => row.sort((a, b) => a.x - b.x));
  return sorted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page text extraction
// ─────────────────────────────────────────────────────────────────────────────

async function getPageItems(page) {
  const vp = page.getViewport({ scale: 1.0 });
  const content = await page.getTextContent();
  return content.items
    .filter(i => i.str && i.str.trim())
    .map(i => ({
      str: i.str,
      x: Math.round(i.transform[4] * 10) / 10,
      y: Math.round((vp.height - i.transform[5]) * 10) / 10,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Header-row detection
// ─────────────────────────────────────────────────────────────────────────────

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text cleanup helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove a lone lowercase orphan character at the very start of a string.
 * Handles the "t " that bleeds into the next column from e.g. "currenT".
 */
function stripLeadingOrphan(text) {
  return text.replace(/^[a-z] /, '');
}

/**
 * Strip a trailing competency code that leaked from the next page/section.
 * e.g. "…best practice. OC2" → "…best practice."
 */
function stripTrailingCode(text) {
  return text.replace(/\s+[A-Z]{1,5}\d+[A-Z]?\s*$/, '').trim();
}

function fixSpacing(text) {
  if (!text) return text;

  // Heal split hyphenated phrases: "long - term" → "long-term"
  text = text.replace(/(\w+)\s+-\s+(\w+)/g, '$1-$2');

  const fixes = {
    'Deve lops': 'Develops',           'deve lops': 'develops',
    'st rategies': 'strategies',       'St rategies': 'Strategies',
    'pro cedures': 'procedures',       'Pro cedures': 'Procedures',
    'inte grates': 'integrates',       'Inte grates': 'Integrates',
    'inter ventions': 'interventions', 'Inter ventions': 'Interventions',
    'poli cies': 'policies',           'Poli cies': 'Policies',
    'guide lines': 'guidelines',       'Guide lines': 'Guidelines',
    'recom mends': 'recommends',       'Recom mends': 'Recommends',
    'th e': 'the',                     'Th e': 'The',
    'an d': 'and',                     'An d': 'And',
    'In fluences': 'Influences',       'in fluences': 'influences',
    'im prove': 'improve',             'Im prove': 'Improve',
    'im proving': 'improving',         'Im proving': 'Improving',
    'im provement': 'improvement',     'Im provement': 'Improvement',
    'com pliance': 'compliance',       'Com pliance': 'Compliance',
    'en vironment': 'environment',     'En vironment': 'Environment',
    'en vironmental': 'environmental', 'En vironmental': 'Environmental',
    'sus tainable': 'sustainable',     'Sus tainable': 'Sustainable',
    're silient': 'resilient',         'Re silient': 'Resilient',
    'bio diversity': 'biodiversity',   'Bio diversity': 'Biodiversity',
    'eco logy': 'ecology',             'Eco logy': 'Ecology',
    'con struction': 'construction',   'Con struction': 'Construction',
    'de velopment': 'development',     'De velopment': 'Development',
    'cur rent': 'current',             'Cur rent': 'Current',
    'curren t': 'current',             'Curren t': 'Current',
  };

  for (const [broken, fixed] of Object.entries(fixes)) {
    text = text.replace(
      new RegExp('\\b' + broken.replace(/\s/g, '\\s') + '\\b', 'g'),
      fixed
    );
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column parser — behavioral indicator + KSA items
// ─────────────────────────────────────────────────────────────────────────────

function parseColumn(lines) {
  // ── Phase 1: pre-process ─────────────────────────────────────────────────
  const processed = [];
  for (const line of lines) {
    let t = line.trim();
    if (!t) continue;
    t = stripLeadingOrphan(t);
    if (!t) continue;
    if (/^[A-Z]{1,5}\d+[A-Z]?$/.test(t)) continue; // lone competency code
    if (/^\d+$/.test(t)) continue;                   // lone page number
    if (LEVEL_NAMES.includes(t.toUpperCase())) continue;
    processed.push(t);
  }

  // ── Phase 2: segment into BI + numbered items ────────────────────────────
  const segments = [];

  for (const line of processed) {
    // Detect embedded "N." after BI text on the same line
    const embeddedMatch = line.match(/^(.+?)\s+(\d+)\.\s+(.+)$/);
    if (embeddedMatch) {
      const beforeNum     = embeddedMatch[1].trim();
      const num           = parseInt(embeddedMatch[2], 10);
      const afterNum      = embeddedMatch[3].trim();
      const startsWithNum = /^\d+\./.test(beforeNum);
      if (!startsWithNum && beforeNum.length > 5) {
        if (beforeNum) segments.push({ type: 'bi',   num: null, parts: [beforeNum] });
        segments.push(              { type: 'item', num,       parts: [afterNum]  });
        continue;
      }
    }

    // Normal numbered item
    const numMatch = line.match(/^(\d+)\.\s*(.*)/);
    if (numMatch) {
      const num  = parseInt(numMatch[1], 10);
      const rest = numMatch[2].trim();
      segments.push({ type: 'item', num, parts: rest ? [rest] : [] });
      continue;
    }

    // Continuation of previous segment
    if (segments.length > 0 && segments[segments.length - 1].type === 'item') {
      segments[segments.length - 1].parts.push(line);
      continue;
    }

    // Behavioral indicator
    if (segments.length === 0 || segments[segments.length - 1].type === 'bi') {
      if (segments.length === 0) segments.push({ type: 'bi', num: null, parts: [] });
      segments[segments.length - 1].parts.push(line);
    } else {
      segments[segments.length - 1].parts.push(line);
    }
  }

  // ── Phase 3: assemble ────────────────────────────────────────────────────
  const biParts = [];
  const items   = [];

  for (const seg of segments) {
    if (seg.type === 'bi') {
      biParts.push(seg.parts.join(' '));
    } else {
      const raw  = seg.parts.join(' ').trim();
      items.push(stripTrailingCode(`${seg.num}. ${raw}`));
    }
  }

  const behavioralIndicator = fixSpacing(biParts.join(' ').trim());
  const fixedItems = items
    .map(item => fixSpacing(item))
    .filter(item => item.replace(/^\d+\.\s*/, '').trim().length > 3);

  return { behavioralIndicator, items: fixedItems };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractLevels(rows, headerY, code) {
  const cols = [[], [], [], []];
  let past = false;

  for (const [y, items] of rows) {
    if (!past) {
      if (y >= headerY) past = true;
      else continue;
    }
    if (y === headerY) continue;

    const rowText = items.map(i => i.str).join(' ').trim();
    if (isSectionBreak(rowText)) break;
    if (/^\d+$/.test(rowText)) continue;

    const rowByCol = [[], [], [], []];
    for (const item of items) {
      const colIdx = getColumn(item.x);
      rowByCol[colIdx].push(item.str);
    }

    rowByCol.forEach((colItems, colIdx) => {
      if (colItems.length > 0) {
        const line = colItems.join(' ').trim();
        if (line) cols[colIdx].push(line);
      }
    });
  }

  const levels = {};
  LEVEL_NAMES.forEach((name, i) => {
    levels[name] = parseColumn(cols[i]);
  });

  console.log(`Processing: ${code}`, {
    INTERMEDIATE: levels.INTERMEDIATE,
    ADVANCED:     levels.ADVANCED,
  });

  return levels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP = {
  RSCI: 'Strategic Communication & Information',
  RP:   'Planning & Programming',
  RADM: 'Administrative',
  RFM:  'Financial Management',
  RHR:  'Human Resource Management',
  RO:   'Operations & Resource Management',
  PCO:  'PENRO/CENRO Operations',
  LC:   'Legal & Compliance',
  ICT:  'Information & Communication Technology',
};

function getCategory(code) {
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (code.startsWith(k)) return v;
  }
  return 'General Competencies';
}

function isSectionBreak(text) {
  const sectionHeaders = [
    'ORGANIZATIONAL COMPETENCIES',
    'CORE COMPETENCIES',
    'LEADERSHIP COMPETENCIES',
    'MINIMUM COMPETENCIES',
    'BASIC COMPETENCIES',
    'TECHNICAL COMPETENCIES',
  ];
  const normalized = text.trim().toUpperCase();
  return sectionHeaders.some(header => normalized.includes(header));
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF parsing pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function _parse(onProgress = () => {}) {
  onProgress(0, 'Loading PDF…');
  const pdf = await pdfjsLib.getDocument({ url: PDF_PATH }).promise;
  const total = pdf.numPages;
  onProgress(5, `${total} pages found…`);

  const allRows = [];
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    allRows.push(groupByRow(await getPageItems(page)));
    if (p % 20 === 0 || p === total)
      onProgress(Math.round(5 + (p / total) * 55), `Page ${p}/${total}…`);
  }

  onProgress(62, 'Indexing…');

  const locs = [];
  for (let pi = 0; pi < allRows.length; pi++) {
    for (const [y, items] of allRows[pi]) {
      const line = items.map(i => i.str).join(' ').trim();
      const m = CODE_RE.exec(line);
      if (m) locs.push({ pi, y, code: m[1].trim(), name: m[2].trim() });
    }
  }

  onProgress(70, `Found ${locs.length} competencies. Extracting…`);

  const result = [];
  for (let ci = 0; ci < locs.length; ci++) {
    const loc  = locs[ci];
    const next = locs[ci + 1] ?? null;
    const section = new Map();
    let yOff = 0;

    for (let pi = loc.pi; pi < allRows.length; pi++) {
      if (next && pi > next.pi) break;

      let maxY = 0;
      let shouldBreak = false;

      for (const [y, items] of allRows[pi]) {
        if (pi === loc.pi   && y < loc.y)   continue;
        if (pi === next?.pi && y >= next.y)  continue;

        const rowText = items.map(i => i.str).join(' ').trim();
        if (isSectionBreak(rowText)) { shouldBreak = true; break; }

        section.set(y + yOff, items);
        maxY = Math.max(maxY, y);
      }

      if (shouldBreak) break;
      yOff += maxY + 50;
      if (!next || pi < next.pi - 1) continue;
      if (next && pi === next.pi - 1) break;
    }

    const headerY = findHeaderRow(section);
    if (!headerY) continue;

    const levels = extractLevels(section, headerY, loc.code);
    const hasContent = LEVEL_NAMES.some(l =>
      levels[l].behavioralIndicator || levels[l].items.length > 0
    );
    if (!hasContent) continue;

    result.push({
      code:     loc.code,
      name:     loc.name,
      category: getCategory(loc.code),
      levels,
    });

    if (ci % 15 === 0)
      onProgress(Math.round(70 + (ci / locs.length) * 28), `Extracted ${ci + 1}…`);
  }

  onProgress(100, 'Done');
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name-matching helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeName(name) {
  return name.toUpperCase()
    .replace(/[()]/g, ' ')          // open/close parens → spaces so inner words tokenize cleanly
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s\/\-]/g, '') // strip commas, punctuation (but keep spaces, slashes, hyphens)
    .trim();
}

// Stop-words too common to carry meaningful signal for competency name matching.
const STOP_WORDS = new Set([
  'AND', 'THE', 'OF', 'FOR', 'TO', 'IN', 'ON', 'AT', 'BY', 'OR',
  'ITS', 'WITH', 'FROM', 'THAT', 'THIS', 'ARE', 'WAS', 'HAS',
  'THEIR', 'THEY', 'INTO', 'ALSO',
]);

function meaningfulWords(normalized) {
  return new Set(
    normalized.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 1.0;

  const aw = meaningfulWords(na);
  const bw = meaningfulWords(nb);

  if (aw.size === 0 || bw.size === 0) return 0;

  const inter = [...aw].filter(w => bw.has(w)).length;
  const union = new Set([...aw, ...bw]).size;
  const jaccard = inter / union;

  // Containment bonus: if ALL meaningful words of the shorter name exist in the
  // longer name's word set, the shorter name is a "short form" of the longer —
  // give a boost regardless of raw length ratio.
  // This handles the case where the DB stores a truncated competency title
  // (e.g. without the parenthetical sector list) while the CBS PDF has the full title.
  // We require the shorter side to have at least 4 meaningful words to prevent
  // trivially short queries from matching almost anything.
  const shorter = aw.size <= bw.size ? aw : bw;
  const longer  = aw.size <= bw.size ? bw : aw;
  const allContained = shorter.size >= 4 && [...shorter].every(w => longer.has(w));
  const containmentBonus = allContained ? 0.25 : 0;

  return Math.min(1.0, jaccard + containmentBonus);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureParsed(onProgress) {
  if (_cache)   return _cache;
  if (_promise) return _promise;
  _promise = _parse(onProgress).then(r => { _cache = r; _promise = null; return r; });
  return _promise;
}

/**
 * Find ALL competencies whose name genuinely matches the query.
 *
 * Two-tier strategy:
 *
 *  1. SINGLE-MATCH threshold (0.65) — the normal bar for "this is the right
 *     competency". Returns the best match(es) at or above this score.
 *
 *  2. VARIANT threshold (0.85) — two results are only both shown as "variants"
 *     of the same competency when their scores are BOTH ≥ 0.85 AND their own
 *     names are near-identical to each other (similarity ≥ 0.85). This
 *     correctly groups RO2 and PCO2 (same title) while excluding unrelated
 *     competencies that merely share common domain words like "ENVIRONMENT".
 *
 * @param {string} name  - Competency name as stored in the database
 * @returns {Array}      - Array of matched competency objects (may be empty)
 */
export async function findCompetenciesByName(name) {
  const comps = await ensureParsed();

  // Strip UI level-prefix decoration, e.g. "(ADV) - Teamwork" → "Teamwork"
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();

  const SINGLE_THRESHOLD  = 0.60; // minimum to consider anything a match at all
  const VARIANT_THRESHOLD = 0.85; // minimum for BOTH entries to be shown as variants

  const collectMatches = (searchName) => {
    return comps
      .map(c => ({ comp: c, score: nameSimilarity(searchName, c.name) }))
      .filter(({ score }) => score >= SINGLE_THRESHOLD)
      .sort((a, b) => b.score - a.score);
  };

  let scored = collectMatches(cleanName);

  // Fallback: strip parenthetical suffix and retry if nothing found
  if (scored.length === 0) {
    const fallbackName = cleanName.split('(')[0].trim();
    if (fallbackName !== cleanName && fallbackName.length > 10) {
      scored = collectMatches(fallbackName);
    }
  }

  if (scored.length === 0) return [];

  // Always include the best match
  const best = scored[0];
  const results = [best.comp];

  // Only add additional variants when:
  //   a) their own score vs the query is also ≥ VARIANT_THRESHOLD, AND
  //   b) their name is near-identical to the best match's name (≥ 0.85)
  //      — this is what distinguishes "same competency, different code prefix"
  //      from "unrelated competency that shares some domain words"
  for (let i = 1; i < scored.length; i++) {
    const candidate = scored[i];
    if (candidate.score < VARIANT_THRESHOLD) break; // sorted descending, can stop early

    const nameToName = nameSimilarity(best.comp.name, candidate.comp.name);
    if (nameToName >= VARIANT_THRESHOLD) {
      results.push(candidate.comp);
    }
  }

  return results;
}

/**
 * Legacy single-result wrapper — returns the highest-scoring match or null.
 * Kept so any existing callers that expect a single object still work.
 */
export async function findCompetencyByName(name) {
  const results = await findCompetenciesByName(name);
  return results[0] ?? null;
}

/**
 * Find a competency by its exact CBS code (e.g. "RO2", "PCO2").
 */
export async function findCompetencyByCode(code) {
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.find(c => c.code.toUpperCase() === upper) ?? null;
}

export async function isPDFAvailable() {
  try {
    const r = await fetch(PDF_PATH, { method: 'HEAD' });
    return r.ok;
  } catch (e) {
    console.error('PDF fetch error:', e);
    return false;
  }
}
