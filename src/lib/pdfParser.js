import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CBS_PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';
const TOC_PDF_PATH = '/rhrmpsb-system/TABLE_CONTENTS.pdf';

const COLUMN_BOUNDARIES  = [192, 384, 589];
const LEVEL_NAMES        = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];
const COLUMN_MARGIN      = 6;

// Matches e.g. "RSCI6 - Photojournalism" or "RO2 – Identification..."
const ENTRY_HEADER_RE    = /^([A-Z]{1,6}\d+[A-Z]?)\s*[-–]\s*(.+)/;
// Matches a bare code token like "RSCI6", "BFM1", "LC1"
const BARE_CODE_RE       = /^[A-Z]{1,6}\d+[A-Z]?$/;

// ─────────────────────────────────────────────────────────────────────────────
// Office / section detection patterns (used while parsing TOC pages)
// ─────────────────────────────────────────────────────────────────────────────

const OFFICE_PATTERNS = [
  { re: /MINES\s+AND\s+GEOSCIENCES/i,            office: 'Mines and Geosciences Bureau'              },
  { re: /ENVIRONMENTAL\s+MANAGEMENT\s+BUREAU/i,  office: 'Environmental Management Bureau'           },
  { re: /LAND\s+MANAGEMENT\s+BUREAU/i,           office: 'Land Management Bureau'                    },
  { re: /FOREST\s+MANAGEMENT\s+BUREAU/i,         office: 'Forest Management Bureau'                  },
  { re: /ECOSYSTEMS\s+RESEARCH/i,                office: 'Ecosystems Research and Development Bureau'},
  { re: /BIODIVERSITY\s+MANAGEMENT\s+BUREAU/i,   office: 'Biodiversity Management Bureau'            },
  { re: /PROVINCIAL.*COMMUNITY|P\s*\/\s*CENRO/i, office: 'P/CENRO'                                   },
  { re: /REGIONAL\s+OFFICE/i,                    office: 'Regional Offices'                          },
  { re: /CENTRAL\s+OFFICE/i,                     office: 'Central Office'                            },
];

// Category labels – richer than the raw office name
const OFFICE_CATEGORY_MAP = {
  'Central Office'                               : 'Central Office',
  'Regional Offices'                             : 'Regional Offices',
  'P/CENRO'                                      : 'Provincial/Community ENR Offices',
  'Biodiversity Management Bureau'               : 'Biodiversity Management Bureau',
  'Ecosystems Research and Development Bureau'   : 'Ecosystems Research and Development Bureau',
  'Forest Management Bureau'                     : 'Forest Management Bureau',
  'Land Management Bureau'                       : 'Land Management Bureau',
  'Environmental Management Bureau'              : 'Environmental Management Bureau',
  'Mines and Geosciences Bureau'                 : 'Mines and Geosciences Bureau',
};

// Section headers that signal a break between competencies in the CBS PDF
const CBS_SECTION_BREAKS = [
  'ORGANIZATIONAL COMPETENCIES',
  'CORE COMPETENCIES',
  'LEADERSHIP COMPETENCIES',
  'MINIMUM COMPETENCIES',
  'BASIC COMPETENCIES',
  'TECHNICAL COMPETENCIES',
];

// Text snippets to skip while building name groups from the TOC
const TOC_NOISE_RE = new RegExp(
  [
    '^(TABLE\\s+OF\\s+CONTENTS|CBS\\s+MANUAL|DENR|2\\d{3})$',
    '^[IVX]+\\.?$',                      // Roman numerals alone
    '^(FUNCTIONAL|LEADERSHIP|ORGANIZATIONAL|CORE|MINIMUM)\\s+COMPETENCIES',
    '^(FOR\\s+)?(SUPPORT|TECHNICAL|DIRECTOR|DIRECTORS)',
    '^(AND|THE|OF|IN|TO|AT|FOR|BY)$',   // stop words that leak from headers
    '^(I\\.|II\\.|III\\.|IV\\.|V\\.)$',  // e.g. "I.", "II."
    '^(CBS)$',
  ].join('|'),
  'i'
);

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────────────────────

let _cache   = null;   // parsed competency array
let _promise = null;   // in-flight promise

// ─────────────────────────────────────────────────────────────────────────────
// Low-level PDF helpers
// ─────────────────────────────────────────────────────────────────────────────

function getColumn(x) {
  for (let i = 0; i < COLUMN_BOUNDARIES.length; i++) {
    if (x < COLUMN_BOUNDARIES[i] + COLUMN_MARGIN) return i;
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
      x  : Math.round(i.transform[4] * 10) / 10,
      y  : Math.round((vp.height - i.transform[5]) * 10) / 10,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TOC PARSING  –  builds the authoritative competency index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect which office section the TOC page belongs to.
 * Returns null if no pattern matches (office unchanged).
 */
function detectOfficeFromItems(items) {
  const combined = items.map(i => i.str).join(' ');
  for (const { re, office } of OFFICE_PATTERNS) {
    if (re.test(combined)) return office;
  }
  return null;
}

/**
 * Group raw name-fragment items into strings matching one entry each.
 * Uses the largest y-gaps to infer boundaries between entries.
 *
 * @param {Array}  nameItems     – text items after codes & page numbers are removed
 * @param {number} expectedCount – number of entries expected on this page (= codes.length)
 */
function buildNameGroups(nameItems, expectedCount) {
  if (!nameItems.length)  return [];
  if (expectedCount <= 0) return [];

  // Calculate vertical gaps between consecutive items
  const gaps = [];
  for (let i = 1; i < nameItems.length; i++) {
    gaps.push({ idx: i, gap: nameItems[i].y - nameItems[i - 1].y });
  }

  // The (expectedCount - 1) largest gaps are the entry boundaries
  gaps.sort((a, b) => b.gap - a.gap);
  const breakIndices = new Set(
    gaps.slice(0, Math.max(0, expectedCount - 1)).map(g => g.idx)
  );

  const groups  = [];
  let current   = [];

  for (let i = 0; i < nameItems.length; i++) {
    if (i > 0 && breakIndices.has(i)) {
      const joined = current.map(it => it.str.trim()).join(' ').replace(/\s{2,}/g, ' ').trim();
      if (joined) groups.push(joined);
      current = [];
    }
    current.push(nameItems[i]);
  }

  if (current.length) {
    const joined = current.map(it => it.str.trim()).join(' ').replace(/\s{2,}/g, ' ').trim();
    if (joined) groups.push(joined);
  }

  return groups;
}

/**
 * Parse TABLE_CONTENTS.pdf → array of { code, name, page, office }.
 * Returns [] on failure (fallback mode will be used).
 */
async function parseTOC(onProgress = () => {}) {
  let tocPdf;
  try {
    const probe = await fetch(TOC_PDF_PATH, { method: 'HEAD' });
    if (!probe.ok) throw new Error('not found');
    tocPdf = await pdfjsLib.getDocument({ url: TOC_PDF_PATH }).promise;
  } catch (e) {
    console.warn('[TOC] Cannot load TABLE_CONTENTS.pdf –', e.message);
    return [];
  }

  const numPages    = tocPdf.numPages;
  const allEntries  = [];
  let   currentOffice = 'Central Office';

  for (let p = 1; p <= numPages; p++) {
    const page  = await tocPdf.getPage(p);
    const items = await getPageItems(page);

    // Update office context from page header text
    const detected = detectOfficeFromItems(items);
    if (detected) currentOffice = detected;

    // ── Classify each text item ──────────────────────────────────────────────
    const codes    = [];   // RSCI6, BFM1, PCO2 …
    const pageNums = [];   // 1 … 999
    const nameRaw  = [];   // everything else (name fragments)

    for (const item of items) {
      const t = item.str.trim();
      if (!t || t.length < 2) continue;

      if (BARE_CODE_RE.test(t)) {
        codes.push(item);
        continue;
      }

      if (/^\d+$/.test(t)) {
        const n = parseInt(t, 10);
        if (n >= 1 && n <= 999) { pageNums.push(item); continue; }
        // year / large number – skip
        continue;
      }

      if (!TOC_NOISE_RE.test(t)) {
        nameRaw.push(item);
      }
    }

    // Sort each bucket by y (reading order, top→bottom)
    codes   .sort((a, b) => a.y - b.y || a.x - b.x);
    pageNums.sort((a, b) => a.y - b.y || a.x - b.x);
    nameRaw .sort((a, b) => a.y - b.y || a.x - b.x);

    // ── Align codes ↔ page numbers ↔ name groups ────────────────────────────
    // Sometimes page-number column includes duplicates or stray numbers;
    // filter to keep only as many as we have codes.
    const pairedPageNums = pageNums.slice(0, codes.length);

    const nameGroups = buildNameGroups(nameRaw, codes.length);
    const count      = Math.min(codes.length, pairedPageNums.length, nameGroups.length);

    for (let i = 0; i < count; i++) {
      const code    = codes[i].str.trim();
      const pg      = parseInt(pairedPageNums[i].str, 10);
      const name    = nameGroups[i];

      if (code && pg && name) {
        allEntries.push({ code, name, page: pg, office: currentOffice });
      }
    }

    onProgress(Math.round((p / numPages) * 25), `TOC ${p}/${numPages}…`);
  }

  console.log(`[TOC] Indexed ${allEntries.length} competencies across ${numPages} pages`);
  return allEntries;
}

// ─────────────────────────────────────────────────────────────────────────────
// CBS PDF helpers – content extraction
// ─────────────────────────────────────────────────────────────────────────────

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

function isSectionBreak(text) {
  const norm = text.trim().toUpperCase();
  return CBS_SECTION_BREAKS.some(h => norm.includes(h));
}

// ── Text-cleanup helpers ─────────────────────────────────────────────────────

function stripLeadingOrphan(text) {
  return text.replace(/^[a-z] /, '');
}

function stripTrailingCode(text) {
  return text.replace(/\s+[A-Z]{1,5}\d+[A-Z]?\s*$/, '').trim();
}

function fixSpacing(text) {
  if (!text) return text;

  text = text.replace(/(\w+)\s+-\s+(\w+)/g, '$1-$2');

  const fixes = {
    'Deve lops':'Develops','deve lops':'develops',
    'st rategies':'strategies','St rategies':'Strategies',
    'pro cedures':'procedures','Pro cedures':'Procedures',
    'inte grates':'integrates','Inte grates':'Integrates',
    'inter ventions':'interventions','Inter ventions':'Interventions',
    'poli cies':'policies','Poli cies':'Policies',
    'guide lines':'guidelines','Guide lines':'Guidelines',
    'recom mends':'recommends','Recom mends':'Recommends',
    'th e':'the','Th e':'The','an d':'and','An d':'And',
    'In fluences':'Influences','in fluences':'influences',
    'im prove':'improve','Im prove':'Improve',
    'im proving':'improving','Im proving':'Improving',
    'im provement':'improvement','Im provement':'Improvement',
    'com pliance':'compliance','Com pliance':'Compliance',
    'en vironment':'environment','En vironment':'Environment',
    'en vironmental':'environmental','En vironmental':'Environmental',
    'sus tainable':'sustainable','Sus tainable':'Sustainable',
    're silient':'resilient','Re silient':'Resilient',
    'bio diversity':'biodiversity','Bio diversity':'Biodiversity',
    'eco logy':'ecology','Eco logy':'Ecology',
    'con struction':'construction','Con struction':'Construction',
    'de velopment':'development','De velopment':'Development',
    'cur rent':'current','Cur rent':'Current',
    'curren t':'current','Curren t':'Current',
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
// Column parser  –  behavioral indicator + KSA items
// ─────────────────────────────────────────────────────────────────────────────

function parseColumn(lines) {
  const processed = [];
  for (const line of lines) {
    let t = line.trim();
    if (!t) continue;
    t = stripLeadingOrphan(t);
    if (!t) continue;
    if (BARE_CODE_RE.test(t)) continue;
    if (/^\d+$/.test(t))       continue;
    if (LEVEL_NAMES.includes(t.toUpperCase())) continue;
    processed.push(t);
  }

  const segments = [];

  for (const line of processed) {
    const embeddedMatch = line.match(/^(.+?)\s+(\d+)\.\s+(.+)$/);
    if (embeddedMatch) {
      const before     = embeddedMatch[1].trim();
      const num        = parseInt(embeddedMatch[2], 10);
      const after      = embeddedMatch[3].trim();
      const startsNum  = /^\d+\./.test(before);
      if (!startsNum && before.length > 5) {
        if (before) segments.push({ type: 'bi',   num: null, parts: [before] });
        segments.push(              { type: 'item', num,       parts: [after]  });
        continue;
      }
    }

    const numMatch = line.match(/^(\d+)\.\s*(.*)/);
    if (numMatch) {
      const num  = parseInt(numMatch[1], 10);
      const rest = numMatch[2].trim();
      segments.push({ type: 'item', num, parts: rest ? [rest] : [] });
      continue;
    }

    if (segments.length > 0 && segments[segments.length - 1].type === 'item') {
      segments[segments.length - 1].parts.push(line);
      continue;
    }

    if (segments.length === 0 || segments[segments.length - 1].type === 'bi') {
      if (segments.length === 0) segments.push({ type: 'bi', num: null, parts: [] });
      segments[segments.length - 1].parts.push(line);
    } else {
      segments[segments.length - 1].parts.push(line);
    }
  }

  const biParts = [];
  const items   = [];

  for (const seg of segments) {
    if (seg.type === 'bi') {
      biParts.push(seg.parts.join(' '));
    } else {
      const raw = seg.parts.join(' ').trim();
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
// Level extraction from a stitched section Map
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
    if (/^\d+$/.test(rowText))   continue;

    const rowByCol = [[], [], [], []];
    for (const item of items) {
      const colIdx = getColumn(item.x);
      rowByCol[colIdx].push(item.str);
    }

    rowByCol.forEach((colItems, colIdx) => {
      if (colItems.length) {
        const line = colItems.join(' ').trim();
        if (line) cols[colIdx].push(line);
      }
    });
  }

  const levels = {};
  LEVEL_NAMES.forEach((name, i) => {
    levels[name] = parseColumn(cols[i]);
  });

  return levels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-offset detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The TOC lists printed page numbers.  The CBS PDF may have front-matter pages
 * that shift the PDF page index.  This function detects that offset by scanning
 * a few early TOC entries against the CBS PDF rows.
 *
 * Returns the delta such that:   pdfPageIndex = tocPage - 1 + offset
 */
function detectPageOffset(allRows, tocEntries) {
  // Try the first 5 TOC entries to get a stable reading
  const candidates = tocEntries.slice(0, 5);

  for (let offset = -5; offset <= 15; offset++) {
    let hits = 0;
    for (const entry of candidates) {
      const pIdx = entry.page - 1 + offset;
      if (pIdx < 0 || pIdx >= allRows.length) continue;
      for (const [, items] of allRows[pIdx]) {
        const lineText = items.map(i => i.str).join(' ');
        // Look for the code itself OR "CODE – name" pattern
        if (lineText.includes(entry.code)) { hits++; break; }
      }
    }
    if (hits >= Math.min(3, candidates.length)) {
      console.log(`[CBS] Detected page offset: ${offset} (${hits}/${candidates.length} hits)`);
      return offset;
    }
  }

  console.warn('[CBS] Could not reliably detect page offset, using 0');
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parse pipeline  –  TOC-driven
// ─────────────────────────────────────────────────────────────────────────────

async function _parseTOCDriven(tocEntries, allRows, totalPDFPages, onProgress) {
  const pageOffset = detectPageOffset(allRows, tocEntries);

  // Build a code→[entries] map so same-code entries across bureaus are all accessible
  const byCode = new Map();
  for (const entry of tocEntries) {
    const k = entry.code.toUpperCase();
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k).push(entry);
  }

  const result = [];

  for (let i = 0; i < tocEntries.length; i++) {
    const entry     = tocEntries[i];
    const nextEntry = tocEntries[i + 1] ?? null;

    const startIdx = entry.page - 1 + pageOffset;
    const endIdx   = nextEntry
      ? Math.min(nextEntry.page - 1 + pageOffset, allRows.length - 1)
      : allRows.length - 1;

    if (startIdx < 0 || startIdx >= allRows.length) continue;

    // ── Stitch section rows across pages ────────────────────────────────────
    const section = new Map();
    let yOffset   = 0;

    for (let pi = startIdx; pi <= endIdx; pi++) {
      let maxY = 0;
      let stop = false;

      for (const [y, items] of allRows[pi]) {
        const rowText = items.map(i => i.str).join(' ').trim();

        // If we're past the start page and we see a NEW competency header, stop
        if (pi > startIdx && ENTRY_HEADER_RE.test(rowText)) {
          const m = ENTRY_HEADER_RE.exec(rowText);
          if (m && m[1].toUpperCase() !== entry.code.toUpperCase()) { stop = true; break; }
        }

        if (isSectionBreak(rowText)) { stop = true; break; }
        if (/^\d+$/.test(rowText))   continue;  // bare page number

        section.set(y + yOffset, items);
        maxY = Math.max(maxY, y);
      }

      if (stop) break;
      yOffset += maxY + 50;
    }

    // ── Find level header row & extract content ──────────────────────────────
    const headerY = findHeaderRow(section);
    if (headerY == null) {
      console.warn(`[CBS] No level-header found for ${entry.code} (TOC page ${entry.page})`);
      continue;
    }

    const levels = extractLevels(section, headerY, entry.code);
    const hasContent = LEVEL_NAMES.some(l =>
      levels[l].behavioralIndicator || levels[l].items.length > 0
    );

    if (!hasContent) continue;

    result.push({
      code    : entry.code,
      name    : entry.name,   // always use authoritative TOC name
      category: OFFICE_CATEGORY_MAP[entry.office] ?? entry.office,
      office  : entry.office,
      levels,
    });

    if (i % 20 === 0) {
      onProgress(
        70 + Math.round((i / tocEntries.length) * 28),
        `Extracted ${result.length} of ~${tocEntries.length}…`
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback pipeline  –  scan-based (original approach)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP_FALLBACK = {
  RSCI: 'Regional Offices',  RP:   'Regional Offices',
  RADM: 'Regional Offices',  RFM:  'Regional Offices',
  RHR:  'Regional Offices',  RO:   'Regional Offices',
  PCO:  'P/CENRO',           PCP:  'P/CENRO',
  PCIS: 'P/CENRO',           PCFM: 'P/CENRO',
  PCAS: 'P/CENRO',           PCHR: 'P/CENRO',
  LC:   'Leadership',        OC:   'Organizational',
  CC:   'Core Competencies',
};

function getFallbackCategory(code) {
  for (const [k, v] of Object.entries(CATEGORY_MAP_FALLBACK)) {
    if (code.startsWith(k)) return v;
  }
  return 'General Competencies';
}

async function _parseFallback(allRows, onProgress) {
  onProgress(65, 'Indexing competency headers (fallback mode)…');

  const locs = [];
  for (let pi = 0; pi < allRows.length; pi++) {
    for (const [y, items] of allRows[pi]) {
      const line = items.map(i => i.str).join(' ').trim();
      const m    = ENTRY_HEADER_RE.exec(line);
      if (m) locs.push({ pi, y, code: m[1].trim(), name: m[2].trim() });
    }
  }

  onProgress(70, `Fallback: found ${locs.length} headers. Extracting…`);
  const result = [];

  for (let ci = 0; ci < locs.length; ci++) {
    const loc  = locs[ci];
    const next = locs[ci + 1] ?? null;

    const section = new Map();
    let yOff = 0;

    for (let pi = loc.pi; pi < allRows.length; pi++) {
      if (next && pi > next.pi) break;
      let maxY = 0;
      let stop = false;

      for (const [y, items] of allRows[pi]) {
        if (pi === loc.pi   && y < loc.y)   continue;
        if (pi === next?.pi && y >= next.y)  continue;

        const rowText = items.map(i => i.str).join(' ').trim();
        if (isSectionBreak(rowText)) { stop = true; break; }

        section.set(y + yOff, items);
        maxY = Math.max(maxY, y);
      }

      if (stop) break;
      yOff += maxY + 50;
      if (!next || pi < next.pi - 1) continue;
      if (next && pi === next.pi - 1) break;
    }

    const headerY = findHeaderRow(section);
    if (!headerY) continue;

    const levels     = extractLevels(section, headerY, loc.code);
    const hasContent = LEVEL_NAMES.some(l =>
      levels[l].behavioralIndicator || levels[l].items.length > 0
    );
    if (!hasContent) continue;

    result.push({
      code    : loc.code,
      name    : loc.name,
      category: getFallbackCategory(loc.code),
      office  : getFallbackCategory(loc.code),
      levels,
    });

    if (ci % 15 === 0) {
      onProgress(70 + Math.round((ci / locs.length) * 28), `Fallback ${ci + 1}/${locs.length}…`);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Master orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function _parse(onProgress = () => {}) {
  // ── Step 1: parse the TOC ─────────────────────────────────────────────────
  onProgress(0, 'Reading Table of Contents…');
  const tocEntries = await parseTOC(onProgress);

  // ── Step 2: load CBS PDF pages ────────────────────────────────────────────
  const startMsg = tocEntries.length
    ? `TOC: ${tocEntries.length} entries. Loading CBS PDF…`
    : 'TOC unavailable. Loading CBS PDF (fallback mode)…';

  onProgress(27, startMsg);

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ url: CBS_PDF_PATH }).promise;
  } catch (e) {
    throw new Error('Cannot load 2025_CBS.pdf: ' + e.message);
  }

  const total = pdf.numPages;
  onProgress(30, `Loading ${total} pages…`);

  const allRows = [];
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    allRows.push(groupByRow(await getPageItems(page)));
    if (p % 30 === 0 || p === total) {
      onProgress(30 + Math.round((p / total) * 38), `Page ${p}/${total}…`);
    }
  }

  onProgress(70, 'Extracting competency data…');

  // ── Step 3: extract content ───────────────────────────────────────────────
  let result;
  if (tocEntries.length > 0) {
    result = await _parseTOCDriven(tocEntries, allRows, total, onProgress);

    // If TOC-driven misses too many entries, supplement with fallback scan
    if (result.length < tocEntries.length * 0.5) {
      console.warn('[CBS] TOC-driven extraction yield is low, supplementing with scan…');
      const fallback   = await _parseFallback(allRows, () => {});
      const existCodes = new Set(result.map(r => r.code.toUpperCase()));
      for (const fb of fallback) {
        if (!existCodes.has(fb.code.toUpperCase())) result.push(fb);
      }
    }
  } else {
    result = await _parseFallback(allRows, onProgress);
  }

  onProgress(100, `Done – ${result.length} competencies loaded`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name-matching helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeName(name) {
  return name.toUpperCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s\/\-]/g, '')
    .trim();
}

const STOP_WORDS = new Set([
  'AND','THE','OF','FOR','TO','IN','ON','AT','BY','OR',
  'ITS','WITH','FROM','THAT','THIS','ARE','WAS','HAS',
  'THEIR','THEY','INTO','ALSO',
]);

function meaningfulWords(normalized) {
  return new Set(
    normalized.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1.0;

  const aw = meaningfulWords(na);
  const bw = meaningfulWords(nb);
  if (!aw.size || !bw.size) return 0;

  const inter    = [...aw].filter(w => bw.has(w)).length;
  const union    = new Set([...aw, ...bw]).size;
  const jaccard  = inter / union;

  const shorter  = aw.size <= bw.size ? aw : bw;
  const longer   = aw.size <= bw.size ? bw : aw;
  const contained = shorter.size >= 4 && [...shorter].every(w => longer.has(w));

  return Math.min(1.0, jaccard + (contained ? 0.25 : 0));
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
 * Find ALL competencies whose name matches the query.
 */
export async function findCompetenciesByName(name) {
  const comps = await ensureParsed();

  // Strip UI level prefix decoration, e.g. "(ADV) - Teamwork" → "Teamwork"
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();

  const SINGLE_THRESHOLD  = 0.50;
  const VARIANT_THRESHOLD = 0.85;

  const collect = (searchName) =>
    comps
      .map(c => ({ comp: c, score: nameSimilarity(searchName, c.name) }))
      .filter(({ score }) => score >= SINGLE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

  let scored = collect(cleanName);

  // Fallback 1: strip parenthetical suffix
  if (!scored.length) {
    const fallback = cleanName.split('(')[0].trim();
    if (fallback !== cleanName && fallback.length > 10) scored = collect(fallback);
  }

  // Fallback 2: substring containment
  if (!scored.length) {
    const norm = normalizeName(cleanName);
    scored = comps
      .filter(c => {
        const cn = normalizeName(c.name);
        return cn.includes(norm) || norm.includes(cn);
      })
      .map(c => ({ comp: c, score: 0.55 }));
  }

  if (!scored.length) return [];

  const best    = scored[0];
  const results = [best.comp];

  for (let i = 1; i < scored.length; i++) {
    const candidate = scored[i];
    if (candidate.score < VARIANT_THRESHOLD) break;
    if (nameSimilarity(best.comp.name, candidate.comp.name) >= VARIANT_THRESHOLD) {
      results.push(candidate.comp);
    }
  }

  return results;
}

/** Legacy single-result wrapper. */
export async function findCompetencyByName(name) {
  const r = await findCompetenciesByName(name);
  return r[0] ?? null;
}

/**
 * Find a competency by its CBS code.
 * Returns the best match (first occurrence); all occurrences via getAllByCode().
 */
export async function findCompetencyByCode(code) {
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.find(c => c.code.toUpperCase() === upper) ?? null;
}

/**
 * Find ALL competencies matching a given code (same code, different bureaus).
 */
export async function findAllByCode(code) {
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.filter(c => c.code.toUpperCase() === upper);
}

/** Return every parsed competency (for the manual browser). */
export async function getAllCompetencies() {
  return ensureParsed();
}

export async function isPDFAvailable() {
  try {
    const r = await fetch(CBS_PDF_PATH, { method: 'HEAD' });
    return r.ok;
  } catch (e) {
    console.error('PDF fetch error:', e);
    return false;
  }
}
