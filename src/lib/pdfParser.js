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

// TOC layout
const TOC_COL_SPLIT = 465;

// Competency codes
const BARE_CODE_RE    = /^[A-Z]{1,6}\d+[A-Z]?$/;
const ENTRY_HEADER_RE = /^([A-Z]{1,6}\d+[A-Z]?)\s*[-–]\s*(.+)/;

// Section breaks
const CBS_SECTION_BREAKS = [
  'ORGANIZATIONAL COMPETENCIES',
  'CORE COMPETENCIES',
  'LEADERSHIP COMPETENCIES',
  'MINIMUM COMPETENCIES',
  'BASIC COMPETENCIES',
  'TECHNICAL COMPETENCIES',
  'FUNCTIONAL COMPETENCIES',
];

// ─────────────────────────────────────────────────────────────────────────────
// Office detection from TOC
// ─────────────────────────────────────────────────────────────────────────────

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

// Section header patterns (only trigger on divider pages)
const OFFICE_SECTION_HEADERS = [
  { re: /CBS\s+MANUAL\s+FOR\s+CENTRAL\s+OFFICE/i,                              office: 'Central Office' },
  { re: /CBS\s+MANUAL\s+FOR\s+REGIONAL\s+OFFICE/i,                             office: 'Regional Offices' },
  { re: /CBS\s+MANUAL\s+FOR\s+P\s*\/\s*CENRO/i,                                office: 'P/CENRO' },
  { re: /CBS\s+MANUAL\s+FOR\s+BIODIVERSITY\s+MANAGEMENT\s+BUREAU/i,            office: 'Biodiversity Management Bureau' },
  { re: /CBS\s+MANUAL\s+FOR\s+ECOSYSTEMS\s+RESEARCH\s+AND\s+DEVELOPMENT/i,     office: 'Ecosystems Research and Development Bureau' },
  { re: /CBS\s+MANUAL\s+FOR\s+FOREST\s+MANAGEMENT\s+BUREAU/i,                  office: 'Forest Management Bureau' },
  { re: /CBS\s+MANUAL\s+FOR\s+LAND\s+MANAGEMENT\s+BUREAU/i,                    office: 'Land Management Bureau' },
  { re: /CBS\s+MANUAL\s+FOR\s+ENVIRONMENTAL\s+MANAGEMENT\s+BUREAU/i,           office: 'Environmental Management Bureau' },
  { re: /CBS\s+MANUAL\s+FOR\s+MINES\s+AND\s+GEOSCIENCES\s+BUREAU/i,            office: 'Mines and Geosciences Bureau' },
];

// Category detection
const TOC_CATEGORY_MAP = [
  [/\bLEADERSHIP\s+COMPETEN/i,     'Leadership'],
  [/\bORGANIZATIONAL\s+COMPETEN/i, 'Organizational'],
  [/\bCORE\s+COMPETEN/i,           'Core'],
  [/\bCOMMON\s+COMPETEN/i,         'Common'],
  [/\bFUNCTIONAL\s+COMPETEN/i,     'Functional'],
];

function isTOCNoise(t) {
  if (!t || t.length === 0) return true;
  if (t.length === 1) return true;
  if (/^2\d{3}$/.test(t)) return true;
  if (/^[IVX]+\.?\s*(.*)$/.test(t)) return true;
  if (/^(AND|THE|OF|IN|TO|AT|FOR|BY|OR|WITH)$/i.test(t)) return true;
  if (/CBS\s+MANUAL/i.test(t)) return true;
  if (/TABLE\s+OF\s+CONTENTS/i.test(t)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────────────────────

let _cache   = null;
let _promise = null;

// ─────────────────────────────────────────────────────────────────────────────
// PDF helpers
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

async function getPageItems(page) {
  const vp = page.getViewport({ scale: 1.0 });
  const content = await page.getTextContent();
  const items = content.items
    .filter(i => i.str && i.str.trim())
    .map(i => ({
      str: i.str.trim(),
      x: Math.round(i.transform[4] * 10) / 10,
      y: Math.round((vp.height - i.transform[5]) * 10) / 10,
    }));
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 STRATEGY: Build TOC metadata index, then scan CBS PDF for actual content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse TOC to build a metadata map: code → { office, category, name }
 * This gives us the authoritative office/category context for each code.
 */
async function buildTOCMetadataIndex(onProgress = () => {}) {
  let tocPdf;
  try {
    const probe = await fetch(TOC_PDF_PATH, { method: 'HEAD' });
    if (!probe.ok) throw new Error('not found');
    tocPdf = await pdfjsLib.getDocument({ url: TOC_PDF_PATH }).promise;
  } catch (e) {
    console.warn('[TOC] Cannot load TABLE_CONTENTS.pdf —', e.message);
    return new Map();
  }

  const metadata = new Map(); // code → { office, category, name }
  let currentOffice = 'Central Office';
  let currentCategory = { left: 'Functional', right: 'Functional' };

  for (let p = 1; p <= tocPdf.numPages; p++) {
    const page = await tocPdf.getPage(p);
    const items = await getPageItems(page);
    const rows = groupByRow(items, 4);

    // Detect office section header
    const fullText = items.map(i => i.str).join(' ').toUpperCase();
    for (const { re, office } of OFFICE_SECTION_HEADERS) {
      if (re.test(fullText)) {
        currentOffice = office;
        console.log(`[TOC] Page ${p}: → ${office}`);
        break;
      }
    }

    // Process both columns
    for (const side of ['left', 'right']) {
      const xMin = side === 'left' ? 0 : TOC_COL_SPLIT;
      const xMax = side === 'left' ? TOC_COL_SPLIT : Infinity;

      for (const [y, rowItems] of rows) {
        if (y < 60) continue; // Skip header

        const sideItems = rowItems.filter(i => i.x >= xMin && i.x < xMax);
        if (!sideItems.length) continue;

        const rowText = sideItems.map(i => i.str).join(' ');

        // Check for category header
        for (const [re, cat] of TOC_CATEGORY_MAP) {
          if (re.test(rowText)) {
            currentCategory[side] = cat;
            break;
          }
        }

        // Look for competency code
        const codeItem = sideItems.find(i => BARE_CODE_RE.test(i.str));
        if (!codeItem) continue;

        // Extract name
        const nameFrags = sideItems
          .filter(i => !BARE_CODE_RE.test(i.str) && !/^\d+$/.test(i.str) && !isTOCNoise(i.str))
          .map(i => i.str);

        const name = nameFrags.join(' ').replace(/\s{2,}/g, ' ').trim();
        
        if (name) {
          // Store metadata for this code
          const key = `${codeItem.str}|${currentOffice}`;
          metadata.set(key, {
            code: codeItem.str,
            office: currentOffice,
            category: currentCategory[side],
            name: name
          });
        }
      }
    }

    onProgress(Math.round((p / tocPdf.numPages) * 20), `Building index ${p}/${tocPdf.numPages}…`);
  }

  console.log(`[TOC] Indexed ${metadata.size} code+office combinations`);
  return metadata;
}

/**
 * Scan CBS PDF to find all competency entries and extract their content.
 * Use TOC metadata to enrich with office/category information.
 */
async function scanCBSForContent(tocMetadata, onProgress = () => {}) {
  const cbsPdf = await pdfjsLib.getDocument({ url: CBS_PDF_PATH }).promise;
  const total = cbsPdf.numPages;
  
  onProgress(25, `Scanning ${total} CBS pages…`);

  // Step 1: Build full content index
  const allRows = [];
  for (let p = 1; p <= total; p++) {
    const page = await cbsPdf.getPage(p);
    const items = await getPageItems(page);
    allRows.push(groupByRow(items));
    
    if (p % 50 === 0 || p === total) {
      onProgress(25 + Math.round((p / total) * 35), `Scanning page ${p}/${total}…`);
    }
  }

  // Step 2: Find all competency headers
  const competencies = [];
  const locations = []; // { pageIdx, code, name, y }

  for (let pageIdx = 0; pageIdx < allRows.length; pageIdx++) {
    const rows = allRows[pageIdx];
    
    for (const [y, items] of rows) {
      const line = items.map(i => i.str).join(' ').trim();
      const match = ENTRY_HEADER_RE.exec(line);
      
      if (match) {
        const [, code, name] = match;
        locations.push({ pageIdx, code, name: name.trim(), y });
      }
    }
  }

  console.log(`[CBS] Found ${locations.length} competency headers`);
  onProgress(65, `Processing ${locations.length} competencies…`);

  // Step 3: Extract content for each competency
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const nextLoc = locations[i + 1];

    // Build section content
    const section = new Map();
    let yOffset = 0;

    const endPageIdx = nextLoc ? Math.min(nextLoc.pageIdx, loc.pageIdx + 5) : Math.min(loc.pageIdx + 5, allRows.length - 1);

    for (let pi = loc.pageIdx; pi <= endPageIdx; pi++) {
      let maxY = 0;
      let shouldStop = false;

      for (const [y, items] of allRows[pi]) {
        // Skip if before start on first page
        if (pi === loc.pageIdx && y < loc.y) continue;
        
        // Stop if reached next competency on same page
        if (pi === nextLoc?.pageIdx && y >= nextLoc.y) {
          shouldStop = true;
          break;
        }

        const rowText = items.map(i => i.str).join(' ').trim();
        
        // Check for section breaks
        if (pi > loc.pageIdx) {
          const m = ENTRY_HEADER_RE.exec(rowText);
          if (m && m[1].toUpperCase() !== loc.code.toUpperCase()) {
            shouldStop = true;
            break;
          }
          
          if (CBS_SECTION_BREAKS.some(h => rowText.toUpperCase().includes(h))) {
            shouldStop = true;
            break;
          }
        }

        section.set(y + yOffset, items);
        maxY = Math.max(maxY, y);
      }

      if (shouldStop) break;
      yOffset += maxY + 50;
    }

    // Find the BASIC/INTERMEDIATE/ADVANCED/SUPERIOR header row
    const headerY = findHeaderRow(section);
    if (!headerY) continue;

    // Extract the 4 levels
    const levels = extractLevels(section, headerY, loc.code);
    
    // Check if has actual content
    const hasContent = LEVELS.some(l =>
      levels[l]?.behavioralIndicator || levels[l]?.items?.length > 0
    );
    
    if (!hasContent) continue;

    // 🎯 Enrich with TOC metadata
    // Try to find metadata for this code
    let metadata = null;
    
    // Strategy 1: Look for exact code match in current office context
    // We infer office from nearby codes that we do have metadata for
    let inferredOffice = 'Central Office';
    
    // Look at nearby successfully parsed competencies
    for (let j = Math.max(0, competencies.length - 10); j < competencies.length; j++) {
      if (competencies[j].office) {
        inferredOffice = competencies[j].office;
        break;
      }
    }
    
    // Try all possible offices for this code
    for (const office of Object.keys(OFFICE_CATEGORY_MAP)) {
      const key = `${loc.code}|${office}`;
      if (tocMetadata.has(key)) {
        metadata = tocMetadata.get(key);
        break;
      }
    }
    
    // Fallback: use inferred office
    if (!metadata) {
      metadata = {
        code: loc.code,
        name: loc.name,
        office: inferredOffice,
        category: 'Functional'
      };
    }

    competencies.push({
      code: loc.code,
      name: metadata.name || loc.name,
      office: metadata.office,
      category: OFFICE_CATEGORY_MAP[metadata.office] || metadata.office,
      levels
    });

    if (i % 20 === 0) {
      onProgress(
        65 + Math.round((i / locations.length) * 33),
        `Processed ${competencies.length}/${locations.length}…`
      );
    }
  }

  return competencies;
}

// ─────────────────────────────────────────────────────────────────────────────
// CBS content extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

const LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

function stripLeadingOrphan(t) { return t.replace(/^[a-z] /, ''); }
function stripTrailingCode(t) { return t.replace(/\s+[A-Z]{1,6}\d+[A-Z]?\s*$/, '').trim(); }

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
    if (LEVELS.includes(t.toUpperCase())) continue;
    processed.push(t);
  }

  const segments = [];
  for (const line of processed) {
    const embedded = line.match(/^(.+?)\s+(\d+)\.\s+(.+)$/);
    if (embedded) {
      const before = embedded[1].trim();
      const num = parseInt(embedded[2], 10);
      const after = embedded[3].trim();
      if (!/^\d+\./.test(before) && before.length > 5) {
        if (before) segments.push({ type: 'bi', num: null, parts: [before] });
        segments.push({ type: 'item', num, parts: [after] });
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
  const items = [];
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
    
    // Stop at section breaks
    if (CBS_SECTION_BREAKS.some(h => rowText.toUpperCase().includes(h))) break;
    if (/^\d+$/.test(rowText)) continue;

    // Check for different competency
    const m = ENTRY_HEADER_RE.exec(rowText);
    if (m && m[1].toUpperCase() !== code.toUpperCase()) break;

    const rowByCol = [[], [], [], []];
    for (const item of items) rowByCol[getColumn(item.x)].push(item.str);
    rowByCol.forEach((colItems, ci) => {
      const line = colItems.join(' ').trim();
      if (line) cols[ci].push(line);
    });
  }

  const levels = {};
  LEVELS.forEach((name, i) => { levels[name] = parseColumn(cols[i]); });
  return levels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Master orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function _parse(onProgress = () => {}) {
  onProgress(0, 'Phase 1: Building TOC index…');
  
  // Phase 1: Parse TOC for metadata (office/category context)
  const tocMetadata = await buildTOCMetadataIndex(onProgress);
  
  onProgress(20, 'Phase 2: Scanning CBS PDF…');
  
  // Phase 2: Scan CBS PDF for actual content, enrich with TOC metadata
  const result = await scanCBSForContent(tocMetadata, onProgress);
  
  onProgress(100, `Done — ${result.length} competencies loaded`);
  console.log(`[PARSER] Successfully parsed ${result.length} competencies`);
  
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name matching helpers
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
  if (na === nb) return 1.0;

  const aw = meaningfulWords(na);
  const bw = meaningfulWords(nb);
  if (!aw.size || !bw.size) return 0;

  const inter = [...aw].filter(w => bw.has(w)).length;
  const union = new Set([...aw, ...bw]).size;
  const jaccard = inter / union;

  const shorter = aw.size <= bw.size ? aw : bw;
  const longer = aw.size <= bw.size ? bw : aw;
  const contained = shorter.size >= 2 && [...shorter].every(w => longer.has(w));

  return Math.min(1.0, jaccard + (contained ? 0.25 : 0));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureParsed(onProgress) {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = _parse(onProgress).then(r => {
    _cache = r;
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
      totalCompetencies: comps.length,
      categories,
      totalPages: comps.length,
    },
  };
}

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

  const SINGLE_THRESHOLD = 0.50;
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

  // Typo-tolerant fallback
  if (!scored.length && cleanName.length >= 6) {
    const upperQuery = cleanName.toUpperCase().replace(/\s+/g, '');
    const candidates = validComps.map(c => {
      const upperName = c.name.toUpperCase().replace(/\s+/g, '');
      const lenDiff = Math.abs(upperQuery.length - upperName.length);
      if (lenDiff > Math.ceil(upperQuery.length * 0.3)) return null;
      const dist = levenshtein(upperQuery, upperName);
      const maxLen = Math.max(upperQuery.length, upperName.length);
      const score = 1 - dist / maxLen;
      return score >= 0.75 ? { comp: c, score } : null;
    }).filter(Boolean);
    candidates.sort((a, b) => b.score - a.score);
    scored = candidates;
  }

  if (!scored.length) return [];

  const best = scored[0];
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

export async function findCompetencyByName(name) {
  const r = await findCompetenciesByName(name);
  return r[0] ?? null;
}

export async function findCompetencyByCode(code) {
  if (!code) return null;
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.find(c => c.code.toUpperCase() === upper) ?? null;
}

export async function findAllByCode(code) {
  if (!code) return [];
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.filter(c => c.code.toUpperCase() === upper);
}

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
