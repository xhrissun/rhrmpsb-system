import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const COLUMN_BOUNDARIES = [192, 384, 589];
const LEVEL_NAMES = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];
const PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';
const CODE_RE = /^([A-Z]+\d+[A-Z]?)\s*[-–]\s*(.+)/;

let _cache = null;
let _promise = null;

function getColumn(x) {
  for (let i = 0; i < COLUMN_BOUNDARIES.length; i++) {
    if (x < COLUMN_BOUNDARIES[i]) return i;
  }
  return 3;
}

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

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

function fixSpacing(text) {
  if (!text) return text;

  // Fix hyphenated words split across lines: "long - term" -> "long-term", "im prove" -> "improve"
  // Pattern: word fragment + space + hyphen + space + word fragment
  text = text.replace(/(\w+)\s+-\s+(\w+)/g, '$1-$2');

  // Fix common broken words from PDF text extraction
  const fixes = {
    'Deve lops': 'Develops',
    'deve lops': 'develops',
    'st rategies': 'strategies',
    'St rategies': 'Strategies',
    'pro cedures': 'procedures',
    'Pro cedures': 'Procedures',
    'inte grates': 'integrates',
    'Inte grates': 'Integrates',
    'inter ventions': 'interventions',
    'Inter ventions': 'Interventions',
    'poli cies': 'policies',
    'Poli cies': 'Policies',
    'guide lines': 'guidelines',
    'Guide lines': 'Guidelines',
    'recom mends': 'recommends',
    'Recom mends': 'Recommends',
    'th e': 'the',
    'Th e': 'The',
    'an d': 'and',
    'An d': 'And',
    'In fluences': 'Influences',
    'in fluences': 'influences',
    'im prove': 'improve',
    'Im prove': 'Improve',
    'im proving': 'improving',
    'Im proving': 'Improving',
    'im provement': 'improvement',
    'Im provement': 'Improvement',
    'com pliance': 'compliance',
    'Com pliance': 'Compliance',
    'en vironment': 'environment',
    'En vironment': 'Environment',
    'en vironmental': 'environmental',
    'En vironmental': 'Environmental',
    'sus tainable': 'sustainable',
    'Sus tainable': 'Sustainable',
    're silient': 'resilient',
    'Re silent': 'Resilient',
    'bio diversity': 'biodiversity',
    'Bio diversity': 'Biodiversity',
    'eco logy': 'ecology',
    'Eco logy': 'Ecology',
    'con struction': 'construction',
    'Con struction': 'Construction',
    'de velopment': 'development',
    'De velopment': 'Development',
  };

  for (const [broken, fixed] of Object.entries(fixes)) {
    text = text.replace(new RegExp('\\b' + broken.replace(/\s/g, '\\s') + '\\b', 'g'), fixed);
  }

  return text;
}

/**
 * Strips any trailing competency code that leaked in from the next page/section.
 * e.g. "...best practice. OC2" -> "...best practice."
 * e.g. "...best practice. RO2" -> "...best practice."
 */
function stripTrailingCode(text) {
  // Remove a trailing competency code like "OC2", "RO2", "RHR1", etc.
  return text.replace(/\s+[A-Z]{1,5}\d+[A-Z]?\s*$/, '').trim();
}

/**
 * IMPROVED parseColumn
 *
 * Key fixes:
 * 1. Numbered items that start with text before the digit (e.g. "Serves as a good role model … 1.")
 *    are split into: behavioralIndicator text + item starting at the digit.
 * 2. A line that contains ONLY a competency code (like "OC2") at the end is discarded.
 * 3. Hyphenated split words ("long - term") are healed.
 * 4. Items whose first token is a continuation of the previous item's last line are joined properly.
 */
function parseColumn(lines) {
  // ── Phase 1: pre-process lines ───────────────────────────────────────────
  // Collapse hyphenated line-breaks inside a line segment that was split.
  const processed = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Discard lines that are ONLY a competency code (cross-page bleed)
    if (/^[A-Z]{1,5}\d+[A-Z]?$/.test(t)) continue;

    // Discard page numbers (lone digits)
    if (/^\d+$/.test(t)) continue;

    // Discard level header names
    if (LEVEL_NAMES.includes(t.toUpperCase())) continue;

    processed.push(t);
  }

  // ── Phase 2: re-join lines into logical segments ─────────────────────────
  // We treat a numbered item as: starts with "1." or "2." etc. (possibly after
  // leading whitespace). Everything before the first numbered item goes into
  // behavioralIndicator. But sometimes the BI and item 1 are on the SAME line
  // (e.g. "Serves as a good role model … t 1. Influences others…") — we split
  // that line at the "N." boundary.

  const segments = []; // each segment = { type: 'bi' | 'item', num: number|null, parts: string[] }

  for (const line of processed) {
    // Check if this line contains an embedded "N." pattern after some BI text.
    // This happens when the PDF renderer puts the BI and the first KSA on the same extracted line.
    // e.g. "Serves as a good role model in conserving ... t 1. Influences others..."
    const embeddedMatch = line.match(/^(.+?)\s+(\d+)\.\s+(.+)$/);

    if (embeddedMatch) {
      const beforeNum  = embeddedMatch[1].trim();
      const num        = parseInt(embeddedMatch[2], 10);
      const afterNum   = embeddedMatch[3].trim();

      // Only treat as embedded split if the "before" part doesn't look like it
      // already starts a numbered item (i.e., doesn't begin with N.)
      const startsWithNum = /^\d+\./.test(beforeNum);

      if (!startsWithNum && beforeNum.length > 5) {
        // Push the BI portion
        if (beforeNum) segments.push({ type: 'bi', num: null, parts: [beforeNum] });
        // Push the item portion
        segments.push({ type: 'item', num, parts: [afterNum] });
        continue;
      }
    }

    // Normal numbered item line: starts with "N."
    const numMatch = line.match(/^(\d+)\.\s*(.*)/);
    if (numMatch) {
      const num  = parseInt(numMatch[1], 10);
      const rest = numMatch[2].trim();
      segments.push({ type: 'item', num, parts: rest ? [rest] : [] });
      continue;
    }

    // Continuation: append to the last segment if we're inside an item
    if (segments.length > 0 && segments[segments.length - 1].type === 'item') {
      segments[segments.length - 1].parts.push(line);
      continue;
    }

    // Otherwise it's part of the behavioral indicator
    if (segments.length === 0 || segments[segments.length - 1].type === 'bi') {
      if (segments.length === 0) segments.push({ type: 'bi', num: null, parts: [] });
      segments[segments.length - 1].parts.push(line);
    } else {
      // We already have items but hit non-numbered text — treat as BI continuation
      // (can happen in badly ordered PDFs; safer to ignore late BI noise)
      // Actually append to the last item as continuation (common for wrapped lines)
      segments[segments.length - 1].parts.push(line);
    }
  }

  // ── Phase 3: build output ────────────────────────────────────────────────
  const biParts  = [];
  const items    = [];

  for (const seg of segments) {
    if (seg.type === 'bi') {
      biParts.push(seg.parts.join(' '));
    } else {
      const raw  = seg.parts.join(' ').trim();
      const text = `${seg.num}. ${raw}`;
      items.push(stripTrailingCode(text));
    }
  }

  const behavioralIndicator = fixSpacing(biParts.join(' ').trim());
  const fixedItems = items
    .map(item => fixSpacing(item))
    // Filter out items that ended up with no real content after the number
    .filter(item => item.replace(/^\d+\.\s*/, '').trim().length > 3);

  return { behavioralIndicator, items: fixedItems };
}

// ✅ FIXED: Properly reconstruct text lines within each column
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
    ADVANCED: levels.ADVANCED,
  });

  return levels;
}

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
    'TECHNICAL COMPETENCIES'
  ];

  const normalized = text.trim().toUpperCase();
  return sectionHeaders.some(header => normalized.includes(header));
}

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
        if (pi === loc.pi && y < loc.y) continue;
        if (pi === next?.pi && y >= next.y) continue;

        const rowText = items.map(i => i.str).join(' ').trim();
        if (isSectionBreak(rowText)) {
          shouldBreak = true;
          break;
        }

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
      code: loc.code,
      name: loc.name,
      category: getCategory(loc.code),
      levels
    });

    if (ci % 15 === 0)
      onProgress(Math.round(70 + (ci / locs.length) * 28), `Extracted ${ci + 1}…`);
  }

  onProgress(100, 'Done');
  return result;
}

function normalize(name) {
  return name.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9\s()\/\-]/g, '').trim();
}

function score(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1.0;
  const aw = new Set(na.split(' ').filter(w => w.length > 2));
  const bw = new Set(nb.split(' ').filter(w => w.length > 2));
  const inter = [...aw].filter(w => bw.has(w)).length;
  const union = new Set([...aw, ...bw]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const sub = na.includes(nb) || nb.includes(na) ? 0.3 : 0;
  return Math.min(1.0, jaccard + sub);
}

export async function ensureParsed(onProgress) {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = _parse(onProgress).then(r => { _cache = r; _promise = null; return r; });
  return _promise;
}

export async function findCompetencyByName(name, threshold = 0.30) {
  const comps = await ensureParsed();

  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();

  let best = null, bestScore = 0;
  for (const c of comps) {
    const s = score(cleanName, c.name);
    if (s > bestScore) { bestScore = s; best = c; }
  }

  if (bestScore >= threshold) return best;

  const fallbackName = cleanName.split('(')[0].trim();

  if (fallbackName !== cleanName && fallbackName.length > 10) {
    best = null;
    bestScore = 0;
    for (const c of comps) {
      const s = score(fallbackName, c.name);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (bestScore >= threshold) return best;
  }

  return null;
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
