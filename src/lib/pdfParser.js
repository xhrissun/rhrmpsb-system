import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CBS_PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';
const TOC_PDF_PATH = '/rhrmpsb-system/TABLE_CONTENTS.pdf';

// CBS content extraction — column boundaries for the 4-level grid
const COLUMN_BOUNDARIES = [192, 384, 589];
const COLUMN_MARGIN     = 6;
const LEVEL_NAMES       = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];

// TOC layout — the split between left and right columns on each TOC page
const TOC_COL_SPLIT = 465;

// Competency codes
const BARE_CODE_RE    = /^[A-Z]{1,6}\d+[A-Z]?$/;
const ENTRY_HEADER_RE = /^([A-Z]{1,6}\d+[A-Z]?)\s*[-–]\s*(.+)/;

// Section headers that signal a break between competencies in the CBS content
const CBS_SECTION_BREAKS = [
  'ORGANIZATIONAL COMPETENCIES',
  'CORE COMPETENCIES',
  'LEADERSHIP COMPETENCIES',
  'MINIMUM COMPETENCIES',
  'BASIC COMPETENCIES',
  'TECHNICAL COMPETENCIES',
];

// ─────────────────────────────────────────────────────────────────────────────
// Office detection — ordered from most-specific to least-specific.
// We look for these in the section HEADING rows of the TOC (large/bold text
// that identifies the bureau), NOT in the competency name rows.
// ─────────────────────────────────────────────────────────────────────────────

const OFFICE_PATTERNS = [
  { re: /MINES\s+AND\s+GEOSCIENCES/i,                     office: 'Mines and Geosciences Bureau'              },
  { re: /ENVIRONMENTAL\s+MANAGEMENT\s+BUREAU/i,           office: 'Environmental Management Bureau'           },
  { re: /LAND\s+MANAGEMENT\s+BUREAU/i,                    office: 'Land Management Bureau'                    },
  { re: /FOREST\s+MANAGEMENT\s+BUREAU/i,                  office: 'Forest Management Bureau'                  },
  { re: /ECOSYSTEMS\s+RESEARCH/i,                         office: 'Ecosystems Research and Development Bureau'},
  { re: /BIODIVERSITY\s+MANAGEMENT\s+BUREAU/i,            office: 'Biodiversity Management Bureau'            },
  { re: /PROVINCIAL.*COMMUNITY|P\s*\/\s*CENRO/i,          office: 'P/CENRO'                                   },
  { re: /REGIONAL\s+OFFICE/i,                             office: 'Regional Offices'                          },
  { re: /CENTRAL\s+OFFICE/i,                              office: 'Central Office'                            },
];

// These are the HEADING strings that appear on section-separator pages of
// the TOC.  They are large, prominent, and contain the office name.
// We detect office changes ONLY when one of these patterns dominates a row
// (i.e. the row text IS essentially the office name, not buried in a comp name).
const OFFICE_HEADING_PATTERNS = [
  { re: /^CBS\s+MANUAL\s+FOR\s+MINES\s+AND\s+GEOSCIENCES/i,                  office: 'Mines and Geosciences Bureau'              },
  { re: /^CBS\s+MANUAL\s+FOR\s+.*ENVIRONMENTAL\s+MANAGEMENT/i,               office: 'Environmental Management Bureau'           },
  { re: /^CBS\s+MANUAL\s+FOR\s+.*LAND\s+MANAGEMENT/i,                        office: 'Land Management Bureau'                    },
  { re: /^CBS\s+MANUAL\s+FOR\s+.*FOREST\s+MANAGEMENT/i,                      office: 'Forest Management Bureau'                  },
  { re: /^CBS\s+MANUAL\s+FOR\s+ECOSYSTEMS/i,                                 office: 'Ecosystems Research and Development Bureau'},
  { re: /^CBS\s+MANUAL\s+FOR\s+BIODIVERSITY/i,                               office: 'Biodiversity Management Bureau'            },
  { re: /^CBS\s+MANUAL\s+FOR\s+P\s*\/?\s*CENRO|PROVINCIAL.*COMMUNITY.*ENR/i, office: 'P/CENRO'                                   },
  { re: /^CBS\s+MANUAL\s+FOR\s+REGIONAL/i,                                   office: 'Regional Offices'                          },
  { re: /^CBS\s+MANUAL\s+FOR\s+CENTRAL/i,                                    office: 'Central Office'                            },
  // Also catch the standalone heading rows (the decorative vertical text reconstructed):
  { re: /^MINES\s+AND\s+GEOSCIENCES\s+BUREAU$/i,                             office: 'Mines and Geosciences Bureau'              },
  { re: /^ENVIRONMENTAL\s+MANAGEMENT\s+BUREAU$/i,                            office: 'Environmental Management Bureau'           },
  { re: /^LAND\s+MANAGEMENT\s+BUREAU$/i,                                     office: 'Land Management Bureau'                    },
  { re: /^FOREST\s+MANAGEMENT\s+BUREAU$/i,                                   office: 'Forest Management Bureau'                  },
  { re: /^ECOSYSTEMS\s+RESEARCH\s+AND\s+DEVELOPMENT\s+BUREAU$/i,             office: 'Ecosystems Research and Development Bureau'},
  { re: /^BIODIVERSITY\s+MANAGEMENT\s+BUREAU$/i,                             office: 'Biodiversity Management Bureau'            },
  { re: /PROVINCIAL\s*\/\s*COMMUNITY\s+ENVIRONMENT/i,                        office: 'P/CENRO'                                   },
  { re: /^REGIONAL\s+OFFICES$/i,                                              office: 'Regional Offices'                          },
  { re: /^CENTRAL\s+OFFICE$/i,                                                office: 'Central Office'                            },
];

const OFFICE_CATEGORY_MAP = {
  'Central Office'                             : 'Central Office',
  'Regional Offices'                           : 'Regional Offices',
  'P/CENRO'                                    : 'Provincial/Community ENR Offices',
  'Biodiversity Management Bureau'             : 'Biodiversity Management Bureau',
  'Ecosystems Research and Development Bureau' : 'Ecosystems Research and Development Bureau',
  'Forest Management Bureau'                   : 'Forest Management Bureau',
  'Land Management Bureau'                     : 'Land Management Bureau',
  'Environmental Management Bureau'            : 'Environmental Management Bureau',
  'Mines and Geosciences Bureau'               : 'Mines and Geosciences Bureau',
};

// Noise patterns to filter out while reading TOC name fragments
function isTOCNoise(t) {
  if (!t || t.length === 0) return true;
  if (t.length === 1) return true;
  if (/^2\d{3}$/.test(t)) return true;
  if (/^[IVX]+\.?\s*(.*)$/.test(t)) return true;   // Roman numeral section headers
  if (/^(AND|THE|OF|IN|TO|AT|FOR|BY|OR|WITH)$/i.test(t)) return true;
  if (/CBS\s+MANUAL/i.test(t)) return true;
  if (/TABLE\s+OF\s+CONTENTS/i.test(t)) return true;
  if (/^2\s*0\s*2\s*[45]\s+D\s*E\s*N\s*R/i.test(t)) return true;
  if (/C\s*E\s*N\s*T\s*R\s*A\s*L/i.test(t)) return true;
  if (/R\s*E\s*G\s*I\s*O\s*N\s*A\s*L/i.test(t)) return true;
  if (/M\s*I\s*N\s*E\s*S/i.test(t)) return true;
  if (/B\s*U\s*R\s*E\s*A\s*U/i.test(t)) return true;
  if (/^C\s*B\s*S\s/.test(t)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────────────────────

let _cache   = null;
let _promise = null;

// ─────────────────────────────────────────────────────────────────────────────
// Low-level PDF helpers
// ─────────────────────────────────────────────────────────────────────────────

function getColumn(x) {
  for (let i = 0; i < COLUMN_BOUNDARIES.length; i++) {
    if (x < COLUMN_BOUNDARIES[i] + COLUMN_MARGIN) return i;
  }
  return 3;
}

function groupByRow(items, tol = 4) {
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

async function getPageItemsRaw(page) {
  const vp      = page.getViewport({ scale: 1.0 });
  const content = await page.getTextContent();
  const items   = content.items
    .filter(i => i.str && i.str.trim())
    .map(i => ({
      str: i.str.trim(),
      x  : Math.round(i.transform[4] * 10) / 10,
      y  : Math.round((vp.height - i.transform[5]) * 10) / 10,
    }));
  return { items, width: vp.width, height: vp.height };
}

async function getPageItems(page) {
  const { items } = await getPageItemsRaw(page);
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOC PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect office from a page using a two-pass approach:
 * 1. Look for explicit "CBS MANUAL FOR X" headings (most reliable)
 * 2. Look for large standalone bureau name rows
 * 3. Fall back to full-page text scan only if score is high enough
 */
function detectOfficeFromPage(items, rows) {
  // Pass 1: look for explicit CBS MANUAL FOR heading
  for (const [, rowItems] of rows) {
    const rowText = rowItems.map(i => i.str).join(' ').trim();
    for (const { re, office } of OFFICE_HEADING_PATTERNS) {
      if (re.test(rowText)) return office;
    }
  }

  // Pass 2: check for isolated bureau name text blocks
  // These appear as vertical decorative text on section divider pages,
  // reconstructed by pdf.js as individual characters or short strings.
  // We look for rows where the ONLY content (after joining) matches a bureau name.
  for (const [, rowItems] of rows) {
    const rowText = rowItems.map(i => i.str).join('').trim();
    for (const { re, office } of OFFICE_HEADING_PATTERNS) {
      if (re.test(rowText)) return office;
    }
  }

  return null;
}

function extractTOCEntriesFromSide(rows, side, currentOffice) {
  const xMin = side === 'left' ? 0   : TOC_COL_SPLIT;
  const xMax = side === 'left' ? TOC_COL_SPLIT : Infinity;

  const anchors = [];
  const sortedYs = [...rows.keys()];

  for (const y of sortedYs) {
    const sideItems = rows.get(y).filter(i => i.x >= xMin && i.x < xMax);
    if (!sideItems.length) continue;

    const codeItem = sideItems.find(i => BARE_CODE_RE.test(i.str));
    if (!codeItem) continue;

    const pageCandidates = sideItems
      .filter(i => /^\d+$/.test(i.str))
      .filter(i => { const n = parseInt(i.str, 10); return n >= 1 && n <= 999; });

    if (!pageCandidates.length) continue;
    const pageItem = pageCandidates.sort((a, b) => b.x - a.x)[0];
    const pageNum  = parseInt(pageItem.str, 10);

    const nameFrags = sideItems.filter(i => {
      const t = i.str;
      return !BARE_CODE_RE.test(t)
          && !/^\d+$/.test(t)
          && !isTOCNoise(t);
    }).map(i => i.str);

    anchors.push({ y, code: codeItem.str, page: pageNum, nameFrags });
  }

  if (!anchors.length) return [];

  const entries = [];

  for (let ai = 0; ai < anchors.length; ai++) {
    const anchor     = anchors[ai];
    const nextAnchorY = anchors[ai + 1]?.y ?? Infinity;

    let allFrags = [...anchor.nameFrags];

    const anchorIdx = sortedYs.indexOf(anchor.y);
    for (let ri = anchorIdx + 1; ri < sortedYs.length; ri++) {
      const ry         = sortedYs[ri];
      if (ry >= nextAnchorY)   break;
      if (ry - anchor.y > 60)  break;

      const sideItems = rows.get(ry).filter(i => i.x >= xMin && i.x < xMax);
      if (!sideItems.length) continue;

      const hasCode    = sideItems.some(i => BARE_CODE_RE.test(i.str));
      const hasPageNum = sideItems.some(i => /^\d+$/.test(i.str) &&
                           parseInt(i.str, 10) >= 1 && parseInt(i.str, 10) <= 999 &&
                           i.x > xMin + 200);

      if (hasCode || hasPageNum) break;

      const contFrags = sideItems
        .filter(i => !isTOCNoise(i.str) && !/^\d+$/.test(i.str))
        .map(i => i.str);

      if (contFrags.length) allFrags = [...allFrags, ...contFrags];
    }

    const name = allFrags.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (name && anchor.code) {
      entries.push({ code: anchor.code, page: anchor.page, name, office: currentOffice });
    }
  }

  return entries;
}

/**
 * Parse TABLE_CONTENTS.pdf → flat array of { code, name, page, office }.
 *
 * KEY FIX: Office is only updated when a clear section-divider heading is found.
 * We no longer update office from every page's full text, which was causing
 * shared codes (BHR3, BFM1 etc.) to all get assigned to the same office.
 */
async function parseTOC(onProgress = () => {}) {
  let tocPdf;
  try {
    const probe = await fetch(TOC_PDF_PATH, { method: 'HEAD' });
    if (!probe.ok) throw new Error('not found');
    tocPdf = await pdfjsLib.getDocument({ url: TOC_PDF_PATH }).promise;
  } catch (e) {
    console.warn('[TOC] Cannot load TABLE_CONTENTS.pdf —', e.message);
    return [];
  }

  const total        = tocPdf.numPages;
  const allEntries   = [];
  let   currentOffice = 'Central Office';

  for (let p = 1; p <= total; p++) {
    const page  = await tocPdf.getPage(p);
    const items = await getPageItems(page);
    const rows  = groupByRow(items, 4);

    // Only update office if THIS page has an unambiguous section heading
    const detectedOffice = detectOfficeFromPage(items, rows);
    if (detectedOffice) {
      currentOffice = detectedOffice;
    }

    const leftEntries  = extractTOCEntriesFromSide(rows, 'left',  currentOffice);
    const rightEntries = extractTOCEntriesFromSide(rows, 'right', currentOffice);

    allEntries.push(...leftEntries, ...rightEntries);
    onProgress(Math.round((p / total) * 25), `TOC page ${p}/${total}…`);
  }

  console.log(`[TOC] Indexed ${allEntries.length} competencies`);
  return allEntries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-offset detection
// ─────────────────────────────────────────────────────────────────────────────

function detectPageOffset(allRows, tocEntries) {
  const probes = tocEntries.filter((_, i) => i % 4 === 0).slice(0, 30);
  let bestOffset = 0;
  let bestHits   = 0;

  for (let offset = -5; offset <= 20; offset++) {
    let hits = 0;
    for (const entry of probes) {
      const pIdx = entry.page - 1 + offset;
      if (pIdx < 0 || pIdx >= allRows.length) continue;
      for (let delta = -2; delta <= 2; delta++) {
        const ci = pIdx + delta;
        if (ci < 0 || ci >= allRows.length) break;
        let found = false;
        for (const [, rowItems] of allRows[ci]) {
          if (rowItems.some(i => i.str.trim() === entry.code)) { found = true; break; }
        }
        if (found) { hits++; break; }
      }
    }
    if (hits > bestHits) { bestHits = hits; bestOffset = offset; }
  }

  console.log(`[CBS] Page offset: ${bestOffset} (${bestHits}/${probes.length} hits)`);
  return bestOffset;
}

// ─────────────────────────────────────────────────────────────────────────────
// CBS content extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

function isSectionBreak(text, currentCode = '') {
  const norm = text.trim().toUpperCase();
  if (CBS_SECTION_BREAKS.some(h => norm.includes(h))) return true;
  const m = ENTRY_HEADER_RE.exec(text.trim());
  if (m && m[1].toUpperCase() !== currentCode.toUpperCase()) return true;
  return false;
}

function stripLeadingOrphan(t)  { return t.replace(/^[a-z] /, ''); }
function stripTrailingCode(t)   { return t.replace(/\s+[A-Z]{1,6}\d+[A-Z]?\s*$/, '').trim(); }

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

function parseColumn(lines) {
  const processed = [];
  for (const line of lines) {
    let t = line.trim();
    if (!t) continue;
    t = stripLeadingOrphan(t);
    if (!t) continue;
    if (BARE_CODE_RE.test(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (LEVEL_NAMES.includes(t.toUpperCase())) continue;
    processed.push(t);
  }

  const segments = [];
  for (const line of processed) {
    const embedded = line.match(/^(.+?)\s+(\d+)\.\s+(.+)$/);
    if (embedded) {
      const before = embedded[1].trim();
      const num    = parseInt(embedded[2], 10);
      const after  = embedded[3].trim();
      if (!/^\d+\./.test(before) && before.length > 5) {
        if (before) segments.push({ type: 'bi',   num: null, parts: [before] });
        segments.push(              { type: 'item', num,       parts: [after]  });
        continue;
      }
    }
    const numM = line.match(/^(\d+)\.\s*(.*)/);
    if (numM) {
      segments.push({ type: 'item', num: parseInt(numM[1], 10), parts: numM[2].trim() ? [numM[2].trim()] : [] });
      continue;
    }
    if (segments.length && segments[segments.length - 1].type === 'item') {
      segments[segments.length - 1].parts.push(line);
      continue;
    }
    if (!segments.length || segments[segments.length - 1].type === 'bi') {
      if (!segments.length) segments.push({ type: 'bi', num: null, parts: [] });
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

  return {
    behavioralIndicator: fixSpacing(biParts.join(' ').trim()),
    items: items
      .map(fixSpacing)
      .filter(item => item.replace(/^\d+\.\s*/, '').trim().length > 3),
  };
}

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
    if (isSectionBreak(rowText, code)) break;
    if (/^\d+$/.test(rowText)) continue;

    const rowByCol = [[], [], [], []];
    for (const item of items) rowByCol[getColumn(item.x)].push(item.str);
    rowByCol.forEach((colItems, ci) => {
      const line = colItems.join(' ').trim();
      if (line) cols[ci].push(line);
    });
  }

  const levels = {};
  LEVEL_NAMES.forEach((name, i) => { levels[name] = parseColumn(cols[i]); });
  return levels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seek
// ─────────────────────────────────────────────────────────────────────────────

function seekPageIdx(allRows, calcIdx, code, radius = 6) {
  for (let d = 0; d <= radius; d++) {
    for (const sign of [0, 1, -1]) {
      const ci = calcIdx + sign * d;
      if (ci < 0 || ci >= allRows.length) continue;
      for (const [, rowItems] of allRows[ci]) {
        const line = rowItems.map(r => r.str).join(' ').trim();
        const m    = ENTRY_HEADER_RE.exec(line);
        if (m && m[1].toUpperCase() === code.toUpperCase()) return ci;
      }
    }
  }
  for (let d = 0; d <= radius; d++) {
    for (const sign of [0, 1, -1]) {
      const ci = calcIdx + sign * d;
      if (ci < 0 || ci >= allRows.length) continue;
      for (const [, rowItems] of allRows[ci]) {
        if (rowItems.some(r => r.str.trim().toUpperCase() === code.toUpperCase())) return ci;
      }
    }
  }
  return calcIdx;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOC-driven extraction pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function _parseTOCDriven(tocEntries, allRows, onProgress) {
  const pageOffset = detectPageOffset(allRows, tocEntries);
  const result     = [];

  for (let i = 0; i < tocEntries.length; i++) {
    const entry     = tocEntries[i];
    const nextEntry = tocEntries[i + 1] ?? null;

    const calcStart = entry.page - 1 + pageOffset;
    const calcEnd   = nextEntry ? nextEntry.page - 1 + pageOffset : allRows.length - 1;

    const startIdx = seekPageIdx(allRows, calcStart, entry.code, 6);
    const endIdx   = Math.min(
      nextEntry ? seekPageIdx(allRows, calcEnd, nextEntry.code, 3) : allRows.length - 1,
      startIdx + 8
    );

    if (startIdx < 0 || startIdx >= allRows.length) continue;

    const section = new Map();
    let   yOffset = 0;

    for (let pi = startIdx; pi <= endIdx; pi++) {
      let maxY = 0;
      let stop = false;

      for (const [y, rowItems] of allRows[pi]) {
        const rowText = rowItems.map(r => r.str).join(' ').trim();

        if (pi > startIdx) {
          const m = ENTRY_HEADER_RE.exec(rowText);
          if (m && m[1].toUpperCase() !== entry.code.toUpperCase()) { stop = true; break; }
        }

        if (isSectionBreak(rowText, entry.code)) { stop = true; break; }
        if (/^\d+$/.test(rowText)) continue;

        section.set(y + yOffset, rowItems);
        maxY = Math.max(maxY, y);
      }

      if (stop) break;
      yOffset += maxY + 50;
    }

    const headerY = findHeaderRow(section);
    if (headerY == null) continue;

    const levels     = extractLevels(section, headerY, entry.code);
    const hasContent = LEVEL_NAMES.some(l =>
      levels[l].behavioralIndicator || levels[l].items.length > 0
    );
    if (!hasContent) continue;

    result.push({
      code    : entry.code,
      name    : entry.name,
      category: OFFICE_CATEGORY_MAP[entry.office] ?? entry.office,
      office  : entry.office,
      levels,
    });

    if (i % 20 === 0) {
      onProgress(
        70 + Math.round((i / tocEntries.length) * 28),
        `Extracted ${result.length}/${tocEntries.length}…`
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback pipeline — scan-based
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_CATEGORY_MAP = {
  RSCI:'Regional Offices', RP:'Regional Offices', RADM:'Regional Offices',
  RFM:'Regional Offices',  RHR:'Regional Offices', RO:'Regional Offices',
  PCO:'P/CENRO',  PCP:'P/CENRO', PCIS:'P/CENRO', PCFM:'P/CENRO',
  PCAS:'P/CENRO', PCHR:'P/CENRO',
  LC:'Leadership Competencies', OC:'Organizational Competencies',
  CC:'Core Competencies',
};
function getFallbackCategory(code) {
  for (const [k, v] of Object.entries(FALLBACK_CATEGORY_MAP)) {
    if (code.startsWith(k)) return v;
  }
  return 'General Competencies';
}

async function _parseFallback(allRows, onProgress) {
  onProgress(65, 'Fallback: scanning for competency headers…');
  const locs = [];
  for (let pi = 0; pi < allRows.length; pi++) {
    for (const [y, items] of allRows[pi]) {
      const line = items.map(i => i.str).join(' ').trim();
      const m    = ENTRY_HEADER_RE.exec(line);
      if (m) locs.push({ pi, y, code: m[1].trim(), name: m[2].trim() });
    }
  }

  onProgress(70, `Fallback: found ${locs.length} headers…`);
  const result = [];

  for (let ci = 0; ci < locs.length; ci++) {
    const loc  = locs[ci];
    const next = locs[ci + 1] ?? null;

    const section = new Map();
    let   yOff    = 0;

    for (let pi = loc.pi; pi < allRows.length; pi++) {
      if (next && pi > next.pi) break;
      let maxY = 0;
      let stop = false;

      for (const [y, items] of allRows[pi]) {
        if (pi === loc.pi    && y < loc.y)   continue;
        if (pi === next?.pi  && y >= next.y)  continue;
        const rowText = items.map(r => r.str).join(' ').trim();
        if (isSectionBreak(rowText, loc.code)) { stop = true; break; }
        section.set(y + yOff, items);
        maxY = Math.max(maxY, y);
      }

      if (stop) break;
      yOff += maxY + 50;
      if (!next || pi < next.pi - 1) continue;
      if (pi === next.pi - 1) break;
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
// Master parse orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function _parse(onProgress = () => {}) {
  onProgress(0, 'Reading Table of Contents…');
  const tocEntries = await parseTOC(onProgress);

  const startMsg = tocEntries.length
    ? `TOC: ${tocEntries.length} entries. Loading CBS PDF…`
    : 'No TOC found. Loading CBS PDF (fallback mode)…';
  onProgress(27, startMsg);

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ url: CBS_PDF_PATH }).promise;
  } catch (e) {
    throw new Error('Cannot open 2025_CBS.pdf: ' + e.message);
  }

  const total = pdf.numPages;
  onProgress(30, `Scanning ${total} pages…`);

  const allRows = [];
  for (let p = 1; p <= total; p++) {
    const page  = await pdf.getPage(p);
    const items = await getPageItems(page);
    allRows.push(groupByRow(items));
    if (p % 40 === 0 || p === total) {
      onProgress(30 + Math.round((p / total) * 38), `Page ${p}/${total}…`);
    }
  }

  onProgress(70, 'Extracting competency data…');

  let result;
  if (tocEntries.length > 10) {
    result = await _parseTOCDriven(tocEntries, allRows, onProgress);

    if (result.length < tocEntries.length * 0.4) {
      console.warn('[CBS] Low TOC yield — supplementing with fallback scan');
      const fbResult   = await _parseFallback(allRows, () => {});
      const existCodes = new Set(result.map(r => r.code.toUpperCase()));
      for (const fb of fbResult) {
        if (!existCodes.has(fb.code.toUpperCase())) result.push(fb);
      }
    }
  } else {
    result = await _parseFallback(allRows, onProgress);
  }

  onProgress(100, `Done — ${result.length} competencies loaded`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name-matching helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeName(name) {
  if (!name) return '';
  return String(name).toUpperCase()
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
  if (!na || !nb) return 0;
  if (na === nb)  return 1.0;

  const aw = meaningfulWords(na);
  const bw = meaningfulWords(nb);
  if (!aw.size || !bw.size) return 0;

  const inter    = [...aw].filter(w => bw.has(w)).length;
  const union    = new Set([...aw, ...bw]).size;
  const jaccard  = inter / union;

  const shorter  = aw.size <= bw.size ? aw : bw;
  const longer   = aw.size <= bw.size ? bw : aw;
  const contained = shorter.size >= 2 && [...shorter].every(w => longer.has(w));

  return Math.min(1.0, jaccard + (contained ? 0.25 : 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureParsed(onProgress) {
  if (_cache)   return _cache;
  if (_promise) return _promise;
  _promise = _parse(onProgress).then(r => {
    _cache   = r;
    _promise = null;
    return r;
  });
  return _promise;
}

export async function parsePDF(fileOrNull, onProgress) {
  const comps = await ensureParsed(onProgress);
  const categories = [...new Set(comps.filter(c => c.category).map(c => c.category))];
  return {
    competencies: comps,
    stats: {
      totalCompetencies : comps.length,
      categories,
      totalPages        : comps.length,
    },
  };
}

/** Find ALL competencies whose name matches the query. */
export async function findCompetenciesByName(name) {
  if (!name) return [];
  const comps = await ensureParsed();
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();
  if (!cleanName) return [];

  // Code lookup first
  if (BARE_CODE_RE.test(cleanName.toUpperCase())) {
    const byCode = comps.filter(c => c.code.toUpperCase() === cleanName.toUpperCase());
    if (byCode.length) return byCode;
  }

  const SINGLE_THRESHOLD  = 0.50;
  const VARIANT_THRESHOLD = 0.85;
  const validComps = comps.filter(c => c.name && typeof c.name === 'string');

  const collect = searchName =>
    validComps
      .map(c => ({ comp: c, score: nameSimilarity(searchName, c.name) }))
      .filter(({ score }) => score >= SINGLE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

  let scored = collect(cleanName);

  if (!scored.length) {
    const shorter = cleanName.split('(')[0].trim();
    if (shorter !== cleanName && shorter.length > 8) scored = collect(shorter);
  }
  if (!scored.length) {
    const norm = normalizeName(cleanName);
    scored = validComps
      .filter(c => {
        const cn = normalizeName(c.name);
        return cn.includes(norm) || norm.includes(cn);
      })
      .map(c => ({ comp: c, score: 0.55 }));
  }
  if (!scored.length) {
    const upper = cleanName.toUpperCase().trim();
    scored = validComps
      .filter(c => c.name.toUpperCase().includes(upper))
      .map(c => ({ comp: c, score: 0.6 }));
  }

  if (!scored.length) return [];

  const best    = scored[0];
  const results = [best.comp];

  for (let i = 1; i < scored.length; i++) {
    const cand = scored[i];
    if (cand.score < VARIANT_THRESHOLD) break;
    if (nameSimilarity(best.comp.name, cand.comp.name) >= VARIANT_THRESHOLD) {
      results.push(cand.comp);
    }
  }

  return results;
}

/** Legacy single-result wrapper. */
export async function findCompetencyByName(name) {
  const r = await findCompetenciesByName(name);
  return r[0] ?? null;
}

/** Find a competency by its exact CBS code. */
export async function findCompetencyByCode(code) {
  if (!code) return null;
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.find(c => c.code.toUpperCase() === upper) ?? null;
}

/** Find ALL competencies sharing a code (same code across different bureau sections). */
export async function findAllByCode(code) {
  if (!code) return [];
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.filter(c => c.code.toUpperCase() === upper);
}

/**
 * Return all parsed competencies (for the Browse Manual view).
 * Shared codes (BHR3, BFM1 etc. that appear in multiple bureaus) are kept
 * as separate entries since each bureau's version has distinct content —
 * but we tag them clearly with their office/category so the browser can
 * group them properly.
 */
export async function getAllCompetencies() {
  const comps = await ensureParsed();
  return comps.filter(c => c && c.code && c.name && typeof c.name === 'string');
}

export async function isPDFAvailable() {
  try {
    const r = await fetch(CBS_PDF_PATH, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}
