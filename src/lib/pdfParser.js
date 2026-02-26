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
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s()\/\-]/g, '')
    .trim();
}

function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 1.0;
  const aw = new Set(na.split(' ').filter(w => w.length > 2));
  const bw = new Set(nb.split(' ').filter(w => w.length > 2));
  const inter = [...aw].filter(w => bw.has(w)).length;
  const union = new Set([...aw, ...bw]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const sub = na.includes(nb) || nb.includes(na) ? 0.3 : 0;
  return Math.min(1.0, jaccard + sub);
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
 * Find ALL competencies whose name matches well enough.
 *
 * Returns an array (may contain 1 or more entries).
 * When multiple competencies share the same name but have different codes
 * (e.g. RO2 and PCO2), ALL of them are returned so the UI can show every
 * variation with a warning banner.
 *
 * @param {string} name       - Competency name as stored in the database
 * @param {number} threshold  - Minimum similarity score (0–1) to include
 * @returns {Array}           - Array of matched competency objects (may be empty)
 */
export async function findCompetenciesByName(name, threshold = 0.30) {
  const comps = await ensureParsed();

  // Strip UI level-prefix decoration, e.g. "(ADV) - Teamwork" → "Teamwork"
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();

  const collectMatches = (searchName) => {
    return comps
      .map(c => ({ comp: c, score: nameSimilarity(searchName, c.name) }))
      .filter(({ score }) => score >= threshold)
      .sort((a, b) => b.score - a.score)
      .map(({ comp }) => comp);
  };

  let matches = collectMatches(cleanName);

  // Fallback: strip parenthetical suffix and retry
  if (matches.length === 0) {
    const fallbackName = cleanName.split('(')[0].trim();
    if (fallbackName !== cleanName && fallbackName.length > 10) {
      matches = collectMatches(fallbackName);
    }
  }

  return matches;
}

/**
 * Legacy single-result wrapper — kept for any callers that expect one result.
 * Returns the highest-scoring match or null.
 */
export async function findCompetencyByName(name, threshold = 0.30) {
  const results = await findCompetenciesByName(name, threshold);
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
